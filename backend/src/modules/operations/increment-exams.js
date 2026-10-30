import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../../shared/errors.js';
import { incrementEvidence,incrementProgress } from './increment-eligibility.js';
import { fingerprint,addDays } from './attendance-schedule.js';
import { businessDate } from './roster.js';

export const incrementExamMethods=new Set(['getIncrementProgress','listIncrementEligibility','setIncrementOpeningBalance','scheduleIncrementExam','cancelIncrementExam']);
const fail=(code,message,status=409)=>{throw new ApiError(status,code,message);};
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(d=>Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d);
const workerRef=z.string().min(1).max(100),reason=z.string().trim().min(5).max(2000);
const supervisor=auth=>{if(auth.user.role!=='SUPERVISOR')fail('FORBIDDEN','Supervisor access is required.',403);};
const iso=v=>new Date(v).toISOString();
const appointment=row=>row?{id:row.id,startsAt:iso(row.starts_at),location:row.location,instructions:row.instructions,
  status:row.status,revision:row.revision,updatedAt:iso(row.updated_at),appointedBy:row.actor_name}:null;

async function workspace(client,state,now) {
  if(!(await client.query("SELECT to_regclass('increment_exam_appointments') AS name")).rows[0].name)fail('MIGRATION_REQUIRED','Apply the increment exam migration before using this feature.',503);
  const [workers,balances,appointments,attendance]=await Promise.all([
    client.query("SELECT id,worker_number,user_id FROM workers WHERE worker_type='EMPLOYEE'"),
    client.query('SELECT *,through_date::text AS through_date FROM increment_opening_balances'),
    client.query('SELECT a.*,u.name AS actor_name FROM increment_exam_appointments a JOIN users u ON u.id=a.actor_user_id'),
    client.query(`SELECT w.worker_number,o.roster_date::text AS date,o.shift,o.effective_end,c.status
      FROM attendance_confirmations c JOIN work_occurrences o ON o.id=c.occurrence_id JOIN workers w ON w.id=o.worker_id WHERE w.worker_type='EMPLOYEE'`),
  ]);
  const evidence=incrementEvidence(state,attendance.rows);
  const byNumber=new Map(workers.rows.map(w=>[w.worker_number,w]));
  const byBalance=new Map(balances.rows.map(b=>[b.worker_id,b]));
  const byAppointment=new Map(appointments.rows.map(a=>[a.worker_id,a]));
  return state.employees.filter(e=>byNumber.has(e.id)).map(e=>{
    const worker=byNumber.get(e.id),progress=incrementProgress(e,evidence,byBalance.get(worker.id),now,state);
    return {workerUuid:worker.id,employeeId:e.id,staffNumber:e.staffNumber??e.id,name:e.name,department:e.dept,
      platformCode:e.platformCode??null,progress,appointment:appointment(byAppointment.get(worker.id)),
      appointmentNeedsReview:byAppointment.get(worker.id)?.status==='SCHEDULED'&&!progress.eligible};
  });
}
function publicRecord(record){const result={...record};delete result.workerUuid;return result;}
function employee(rows,id){const record=rows.find(r=>r.employeeId===id);if(!record)fail('NOT_FOUND','Registered employee not found.',404);return record;}
async function event(client,auth,state,row,kind,before,after,note,now,appointmentId=null){
  await client.query('INSERT INTO increment_exam_events(id,worker_id,appointment_id,kind,actor_user_id,recorded_at,reason,before_values,after_values) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [randomUUID(),row.workerUuid,appointmentId,kind,auth.user.id,now.toISOString(),note,JSON.stringify(before??{}),JSON.stringify(after)]);
  state.audit.unshift({id:`AUD-${randomUUID()}`,at:now.toISOString(),actorId:auth.workerId,actorName:auth.user.name,role:auth.user.role,
    action:`INCREMENT_${kind}`,entity:'IncrementExam',entityId:row.employeeId,platformCode:row.platformCode,dept:row.department,
    previous:JSON.stringify(before??{}),next:JSON.stringify(after),reason:note,isOverride:kind==='BASELINE_UPDATED'});
}
function notify(state,row,title,body,now){
  state.notifications.unshift({id:`NTF-${randomUUID()}`,type:'INCREMENT_EXAM',title,body,createdAt:now.toISOString(),read:false,
    emailStatus:'NOT_SENT',link:'/profile#increment-exam',recipientRoles:['EMPLOYEE'],recipientId:row.employeeId});
}
async function idempotent(client,auth,method,id,input,action){
  const digest=fingerprint({id,input});
  const previous=(await client.query('SELECT * FROM increment_exam_commands WHERE actor_user_id=$1 AND operation=$2 AND request_key=$3',[auth.user.id,method,input.idempotencyKey])).rows[0];
  if(previous){if(previous.payload_digest!==digest)fail('IDEMPOTENCY_CONFLICT','This request reference was already used with different details.');return previous.result;}
  const result=await action();
  await client.query('INSERT INTO increment_exam_commands(actor_user_id,operation,request_key,payload_digest,result) VALUES($1,$2,$3,$4,$5)',[auth.user.id,method,input.idempotencyKey,digest,JSON.stringify(result)]);
  return result;
}

export async function incrementExamOperation(client,auth,state,method,args,now=new Date()) {
  if(method!=='getIncrementProgress')supervisor(auth);
  const rows=await workspace(client,state,now);
  if(method==='listIncrementEligibility'){
    const [q]=z.tuple([z.object({search:z.string().max(100).default(''),status:z.enum(['ELIGIBLE','SCHEDULED','VERIFY','ALL']).default('ELIGIBLE'),page:z.number().int().min(1).default(1),pageSize:z.number().int().min(1).max(100).default(8)}).strict()]).parse(args);
    const matches=rows.filter(r=>!q.search||`${r.name} ${r.staffNumber} ${r.department} ${r.platformCode??''}`.toLowerCase().includes(q.search.toLowerCase()))
      .filter(r=>q.status==='ALL'||q.status==='SCHEDULED'&&r.appointment?.status==='SCHEDULED'||q.status==='ELIGIBLE'&&r.progress.eligible||q.status==='VERIFY'&&(r.progress.verificationRequired||r.progress.breakdown.unverified>0))
      .sort((a,b)=>(a.progress.eligibleSince??'9999').localeCompare(b.progress.eligibleSince??'9999')||a.staffNumber.localeCompare(b.staffNumber));
    return {items:matches.slice((q.page-1)*q.pageSize,q.page*q.pageSize).map(publicRecord),total:matches.length,page:q.page,pageSize:q.pageSize,
      eligible:rows.filter(r=>r.progress.eligible).length,scheduled:rows.filter(r=>r.appointment?.status==='SCHEDULED').length,serverNow:now.toISOString()};
  }
  if(method==='getIncrementProgress'){
    const [id=auth.workerId]=z.tuple([workerRef.optional()]).parse(args);
    if(auth.user.role!=='SUPERVISOR'&&(auth.user.role!=='EMPLOYEE'||id!==auth.workerId))fail('FORBIDDEN','Only your own increment eligibility is available.',403);
    const row=employee(rows,id);
    const history=(await client.query(`SELECT e.id,e.kind,e.recorded_at,e.reason,u.name AS actor_name FROM increment_exam_events e JOIN users u ON u.id=e.actor_user_id
      WHERE e.worker_id=$1 ORDER BY e.recorded_at DESC,e.id DESC LIMIT 30`,[row.workerUuid])).rows.map(e=>({id:e.id,kind:e.kind,recordedAt:iso(e.recorded_at),reason:e.reason,actorName:e.actor_name}));
    return {...publicRecord(row),history};
  }
  if(method==='setIncrementOpeningBalance'){
    if(!auth.permissions.includes('attendance.correct'))fail('FORBIDDEN','Attendance-correction permission is required for historical qualifying-day balances.',403);
    const [id,input]=z.tuple([workerRef,z.object({throughDate:day,creditedDays:z.number().min(0).max(100000).multipleOf(.5),reason,expectedRevision:z.number().int().min(0)}).strict()]).parse(args);
    const row=employee(rows,id),prior=row.progress.baseline;
    if((prior?.revision??0)!==input.expectedRevision)fail('CONCURRENCY_CONFLICT','The verified opening balance changed. Refresh before saving.');
    if(!row.progress.joinedAt||input.throughDate<row.progress.joinedAt||input.throughDate>=businessDate(now)
      ||Date.parse(`${addDays(input.throughDate,1)}T07:30:00+05:30`)>now.getTime())fail('INVALID_PERIOD','Choose a completed roster date on or after the employment joining date.',422);
    const elapsed=Math.floor((Date.parse(input.throughDate)-Date.parse(row.progress.joinedAt))/86400000)+1;
    if(input.creditedDays>elapsed)fail('INVALID_BALANCE','Credited days cannot exceed the calendar days in the verified period.',422);
    await client.query(`INSERT INTO increment_opening_balances(worker_id,through_date,credited_days,reason,actor_user_id,recorded_at,revision)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(worker_id) DO UPDATE SET through_date=excluded.through_date,credited_days=excluded.credited_days,
      reason=excluded.reason,actor_user_id=excluded.actor_user_id,recorded_at=excluded.recorded_at,revision=excluded.revision`,
      [row.workerUuid,input.throughDate,input.creditedDays,input.reason,auth.user.id,now.toISOString(),input.expectedRevision+1]);
    await event(client,auth,state,row,'BASELINE_UPDATED',prior,input,input.reason,now);
    const result=employee(await workspace(client,state,now),id);
    notify(state,row,'Increment exam progress updated',`Your verified qualifying-day balance was updated. Current progress: ${result.progress.creditedDays}/90 days. View your profile for the covered period and reason.`,now);
    return publicRecord(result);
  }
  if(method==='scheduleIncrementExam'){
    const [id,input]=z.tuple([workerRef,z.object({startsAt:z.string().datetime({offset:true}),location:z.string().trim().min(1).max(200),instructions:z.string().trim().max(2000),
      expectedRevision:z.number().int().min(0),expectedEligibilityVersion:z.string().length(64),idempotencyKey:z.string().uuid()}).strict()]).parse(args);
    return idempotent(client,auth,method,id,input,async()=>{
      const row=employee(rows,id);
      if(!row.progress.eligible)fail('NOT_ELIGIBLE','This employee needs 90 verified qualifying days and active employment/login before an exam can be appointed.');
      if(row.progress.eligibilityVersion!==input.expectedEligibilityVersion)fail('ELIGIBILITY_CHANGED','Qualifying-day evidence changed. Refresh and review the latest progress.');
      if((row.appointment?.revision??0)!==input.expectedRevision)fail('CONCURRENCY_CONFLICT','Another supervisor changed this appointment. Refresh before scheduling.');
      if(Date.parse(input.startsAt)<=now.getTime())fail('PAST_APPOINTMENT','Choose a future physical exam date and time.',422);
      if(row.appointment?.status==='SCHEDULED'&&Date.parse(row.appointment.startsAt)<=now.getTime())fail('EXAM_STARTED','The appointed exam time has passed. Cancel with a reason before creating another appointment.');
      const appointmentId=row.appointment?.id??randomUUID(),kind=row.appointment?.status==='SCHEDULED'?'RESCHEDULED':'SCHEDULED';
      await client.query(`INSERT INTO increment_exam_appointments(id,worker_id,starts_at,location,instructions,status,actor_user_id,updated_at,revision,eligibility_snapshot)
        VALUES($1,$2,$3,$4,$5,'SCHEDULED',$6,$7,$8,$9) ON CONFLICT(worker_id) DO UPDATE SET starts_at=excluded.starts_at,location=excluded.location,instructions=excluded.instructions,
        status='SCHEDULED',actor_user_id=excluded.actor_user_id,updated_at=excluded.updated_at,revision=excluded.revision,eligibility_snapshot=excluded.eligibility_snapshot`,
        [appointmentId,row.workerUuid,input.startsAt,input.location,input.instructions,auth.user.id,now.toISOString(),input.expectedRevision+1,JSON.stringify(row.progress)]);
      await event(client,auth,state,row,kind,row.appointment,{...input,eligibility:row.progress},input.instructions||'Physical increment exam appointment',now,appointmentId);
      const local=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Colombo',dateStyle:'long',timeStyle:'short'}).format(new Date(input.startsAt));
      notify(state,row,kind==='RESCHEDULED'?'Increment exam rescheduled':'Your increment exam is appointed',`Physical exam: ${local} (Asia/Colombo). Location: ${input.location}. ${input.instructions} Appointed by ${auth.user.name}.`,now);
      return publicRecord(employee(await workspace(client,state,now),id));
    });
  }
  if(method==='cancelIncrementExam'){
    const [id,input]=z.tuple([workerRef,z.object({expectedRevision:z.number().int().positive(),reason,idempotencyKey:z.string().uuid()}).strict()]).parse(args);
    return idempotent(client,auth,method,id,input,async()=>{
      const row=employee(rows,id);
      if(!row.appointment||row.appointment.status!=='SCHEDULED')fail('INVALID_STATE','There is no active exam appointment to cancel.');
      if(row.appointment.revision!==input.expectedRevision)fail('CONCURRENCY_CONFLICT','The appointment changed. Refresh before cancelling.');
      await client.query("UPDATE increment_exam_appointments SET status='CANCELLED',revision=revision+1,updated_at=$2,actor_user_id=$3 WHERE worker_id=$1",[row.workerUuid,now.toISOString(),auth.user.id]);
      await event(client,auth,state,row,'CANCELLED',row.appointment,{status:'CANCELLED'},input.reason,now,row.appointment.id);
      notify(state,row,'Increment exam appointment cancelled',`Your physical increment exam appointment was cancelled by ${auth.user.name}. Reason: ${input.reason}`,now);
      return publicRecord(employee(await workspace(client,state,now),id));
    });
  }
  fail('NOT_FOUND','Increment exam operation not found.',404);
}
