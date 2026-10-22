import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../../shared/errors.js';
import { attendanceSchedules, addDays, fingerprint } from './attendance-schedule.js';
import { businessDate, dateRange } from './roster.js';
import { requireAttendanceSchema, attendanceWorker, materializeOccurrence, readAttendanceRecord,
  recordCustodyReceipt, recordCustodyReturn, recordSelect, attendanceRecord } from './attendance-store.js';

export const shiftAttendanceMethods = new Set(['getMyAttendanceContext','getMyAttendanceDevices','confirmMyShiftAttendance',
  'returnMyShiftDevice','listShiftAttendance','getShiftAttendanceDetail','reviewShiftAttendance','getDirectoryAttendance']);
const fail = (code,message,status=409) => { throw new ApiError(status,code,message); };
const id = z.string().uuid();
const note = z.string().trim().max(2000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
const inputSchema = z.object({occurrenceId:id,expectedRevision:z.number().int().positive(),department:z.enum(['GS','DP','WD','SAFETY']),
  assetId:z.string().min(1).max(100).optional(),attendanceOnly:z.boolean(),notes:note,equipmentIssue:note,exceptionReason:note,
  declaration:z.literal(true),deviceTimestamp:z.string().datetime({offset:true}),timezoneOffsetMinutes:z.number().int().min(-840).max(840),
  idempotencyKey:z.string().uuid()}).strict();
const filters = z.object({from:date,to:date,platform:z.string().max(100).optional(),department:z.string().max(20).optional(),
  shift:z.enum(['','MORNING','NIGHT']).optional(),workerType:z.enum(['','EMPLOYEE','FREELANCER']).optional(),
  status:z.enum(['','CONFIRMED','NEEDS_REVIEW','VOIDED']).optional(),search:z.string().max(100).optional(),
  workerId:z.string().max(100).optional(),page:z.number().int().min(1).default(1),pageSize:z.number().int().min(1).max(100).default(25)}).strict();
const own = (auth,worker) => {
  if (!['EMPLOYEE','FREELANCER'].includes(auth.user.role) || worker !== auth.workerId) fail('FORBIDDEN','Only your own shift can be confirmed.',403);
};
const supervisor = auth => {if(auth.user.role!=='SUPERVISOR')fail('FORBIDDEN','Supervisor access is required.',403);};
const canCorrect = auth => {supervisor(auth);if(!auth.permissions.includes('attendance.correct'))fail('FORBIDDEN','Attendance-correction permission is required.',403);};
const usable = (state,l,work) => {
  const platform=state.platforms.find(p=>p.code===work.platform_code);
  const slot=Number(l.workstationId?.match(/(\d+)$/)?.[1]);
  return l.platformCode===work.platform_code && l.dept===work.department && !l.currentUserId
    && platform?.status==='ACTIVE' && platform.lifecycle!=='SETUP'
    && Number.isInteger(slot) && slot>0 && slot<=(platform.departments[work.department]??0)
    && l.status==='AVAILABLE' && l.condition!=='DAMAGED'
    && !state.incidents.some(i=>i.assetId===l.assetId&&i.status!=='RESOLVED');
};
function audit(state,auth,action,record,reason,at) {
  state.audit.unshift({id:`AUD-${randomUUID()}`,at,actorId:auth.workerId,actorName:auth.user.name,role:auth.user.role,
    action,entity:'ShiftAttendance',entityId:record.id,platformCode:record.platformCode,dept:record.department,
    previous:'',next:record.status,reason,isOverride:action==='ATTENDANCE_REVIEWED'});
}
async function occurrence(client,idValue,auth) {
  const row = (await client.query('SELECT *,roster_date::text AS roster_date FROM work_occurrences WHERE id=$1',[idValue])).rows[0];
  if (!row) fail('NOT_FOUND','Scheduled occurrence not found.',404);
  own(auth,auth.workerId);
  const worker=await attendanceWorker(client,auth.workerId,auth.user.id);
  if(worker.id!==row.worker_id)fail('FORBIDDEN','This occurrence belongs to another worker.',403);
  return row;
}
function liveOccurrence(state,row,now) {
  const work = attendanceSchedules(state,[row.roster_date],now).find(w=>w.workerId===row.operational_worker_id&&w.shift===row.shift);
  if (!work || work.sourceVersion!==row.source_version) fail('SCHEDULE_CHANGED','Your assignment or approved leave changed. Refresh the shift before confirming.');
  return work;
}
async function command(client,auth,operation,input,action,at) {
  const digest = fingerprint(input);
  const prior = (await client.query('SELECT * FROM attendance_commands WHERE actor_user_id=$1 AND operation=$2 AND request_key=$3',
    [auth.user.id,operation,input.idempotencyKey])).rows[0];
  if(prior){if(prior.payload_digest!==digest)fail('IDEMPOTENCY_CONFLICT','Use a new request reference after changing the form.');return prior.result;}
  const result = await action();
  await client.query('INSERT INTO attendance_commands(actor_user_id,operation,request_key,payload_digest,result,accepted_at) VALUES($1,$2,$3,$4,$5,$6)',
    [auth.user.id,operation,input.idempotencyKey,digest,JSON.stringify(result),at]);
  return result;
}
async function authorizedRecord(client,auth,value,history=false) {
  const record = await readAttendanceRecord(client,value,{history});
  if(auth.user.role!=='SUPERVISOR'&&record.workerId!==auth.user.id)fail('FORBIDDEN','This confirmation belongs to another worker.',403);
  return record;
}
export async function shiftAttendanceOperation(client,auth,state,method,args,now=new Date()) {
  await requireAttendanceSchema(client);
  const at=now.toISOString(),today=businessDate(now);
  if(method==='getMyAttendanceContext') {
    z.tuple([]).parse(args);own(auth,auth.workerId);
    const worker=await attendanceWorker(client,auth.workerId,auth.user.id);
    const person=[...state.employees,...state.freelancers].find(w=>w.id===auth.workerId);
    const schedules=attendanceSchedules(state,[addDays(today,-1),today,addDays(today,1)],now).filter(w=>w.workerId===auth.workerId);
    const occurrences=[];
    for(const work of schedules){
      const row=await materializeOccurrence(client,worker,work);
      const found=(await client.query('SELECT id FROM attendance_confirmations WHERE occurrence_id=$1',[row.id])).rows[0];
      const snapshot=found?{platformCode:row.platform_code,department:row.department,workerName:row.worker_name,
        scheduledStart:new Date(row.scheduled_start).toISOString(),scheduledEnd:new Date(row.scheduled_end).toISOString(),
        effectiveStart:new Date(row.effective_start).toISOString(),effectiveEnd:new Date(row.effective_end).toISOString()}:{};
      occurrences.push({...work,...snapshot,id:row.id,staffNumber:row.operational_worker_id,workerId:auth.user.id,revision:row.revision,
        canSubmit:!found,reason:found?'Already submitted':null,
        confirmation:found?await readAttendanceRecord(client,found.id):null});
    }
    const custody=(await client.query(`SELECT confirmation_id FROM equipment_custody_sessions WHERE worker_id=$1 AND released_at IS NULL`,[worker.id])).rows[0];
    return {serverNow:at,today,workerName:person?.name??auth.user.name,occurrences,
      openCustody:custody?await readAttendanceRecord(client,custody.confirmation_id):null,
      reason:!custody&&state.laptops.some(l=>l.currentUserId===auth.workerId)?'A previously assigned laptop is still recorded in your custody. Ask a supervisor to verify its physical return before receiving another laptop, or submit an attendance-only exception.':occurrences.length?null:person?.platformCode||person?.currentPlatform?'No eligible production shift is scheduled. Training is not attendance.':'Awaiting platform assignment'};
  }
  if(method==='getMyAttendanceDevices') {
    const [value]=z.tuple([id]).parse(args),row=await occurrence(client,value,auth);
    liveOccurrence(state,row,now);
    if(state.laptops.some(l=>l.currentUserId===auth.workerId))return [];
    const history=(await client.query('SELECT asset_id,max(received_at) AS received,max(released_at) AS returned FROM equipment_custody_sessions GROUP BY asset_id')).rows;
    const held=new Set((await client.query('SELECT asset_id FROM equipment_custody_sessions WHERE released_at IS NULL')).rows.map(r=>r.asset_id));
    return state.laptops.filter(l=>usable(state,l,row)&&!held.has(l.assetId)).map(l=>{const h=history.find(h=>h.asset_id===l.assetId);return {
      assetId:l.assetId,serial:l.serial,model:l.model,condition:l.condition,
      workstationId:`WS-${row.platform_code.replace(/-/g,'')}-${row.department}${String(Number(l.workstationId.match(/(\d+)$/)[1])).padStart(2,'0')}`,
      lastReceivedAt:h?.received?new Date(h.received).toISOString():null,lastReturnedAt:h?.returned?new Date(h.returned).toISOString():null};});
  }
  if(method==='confirmMyShiftAttendance') {
    const [input]=z.tuple([inputSchema]).parse(args);own(auth,auth.workerId);
    return command(client,auth,method,input,async()=>{
      const row=await occurrence(client,input.occurrenceId,auth),work=liveOccurrence(state,row,now);
      if(row.revision!==input.expectedRevision)fail('CONCURRENCY_CONFLICT','Your shift changed. Refresh before confirming.');
      if(input.department!==row.department)fail('DEPARTMENT_MISMATCH','Use the department in your scheduled assignment.',422);
      // Submission is always available for an eligible unconfirmed occurrence.
      // Device time determines punctuality; server receipt remains separate evidence.
      const previous=(await client.query('SELECT id FROM attendance_confirmations WHERE occurrence_id=$1',[row.id])).rows[0];
      if(previous)fail('ALREADY_SUBMITTED','This shift already has a confirmation. Refresh to view it.');
      if(input.attendanceOnly&&input.exceptionReason.length<5)fail('REASON_REQUIRED','Explain why laptop receipt cannot be confirmed (at least five characters).',422);
      if(input.equipmentIssue&&!input.attendanceOnly)fail('EQUIPMENT_EXCEPTION_REQUIRED','Report equipment faults as an attendance-only exception so a faulty laptop is not claimed.',422);
      if(!input.attendanceOnly&&state.laptops.some(l=>l.currentUserId===auth.workerId))fail('CURRENT_CUSTODY','Return the laptop already recorded in your custody before receiving another. A supervisor can verify a historical device return.');
      if(!input.attendanceOnly&&(!input.assetId||!state.laptops.some(l=>l.assetId===input.assetId&&usable(state,l,row))))fail('DEVICE_UNAVAILABLE','That laptop is no longer available. Refresh the laptop options.');
      const deviceTime=Date.parse(input.deviceTimestamp);
      const review=input.attendanceOnly||deviceTime>Date.parse(work.effectiveEnd);
      const recordId=randomUUID(),status=review?'NEEDS_REVIEW':'CONFIRMED',assetId=input.attendanceOnly?null:input.assetId;
      await client.query(`INSERT INTO attendance_confirmations(id,occurrence_id,actor_user_id,accepted_at,device_timestamp,timezone_offset_minutes,
        status,punctuality,verification,asset_id,notes,equipment_issue,exception_reason,original_evidence)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[recordId,row.id,auth.user.id,at,input.deviceTimestamp,input.timezoneOffsetMinutes,
        status,deviceTime<=Date.parse(work.effectiveStart)+15*60000?'ON_TIME':'LATE',input.attendanceOnly?'EQUIPMENT_EXCEPTION':'SELF_DECLARED',
        assetId,input.notes,input.equipmentIssue,input.exceptionReason,JSON.stringify({input,serverReceivedAt:at,assignment:work,timestampAuthority:'DEVICE'})]);
      if(assetId){
        await recordCustodyReceipt(client,{confirmationId:recordId,workerId:row.worker_id,assetId,actorId:auth.user.id,at,notes:input.equipmentIssue});
        Object.assign(state.laptops.find(l=>l.assetId===assetId),{currentUserId:auth.workerId,currentUserName:auth.user.name,currentShift:row.shift,status:'ASSIGNED'});
      }else await client.query(`INSERT INTO attendance_handover_events(id,confirmation_id,actor_user_id,kind,recorded_at,notes)
        VALUES($1,$2,$3,'ATTENDANCE_EXCEPTION',$4,$5)`,[randomUUID(),recordId,auth.user.id,at,input.exceptionReason]);
      const record=await readAttendanceRecord(client,recordId);audit(state,auth,'ATTENDANCE_SUBMITTED',record,input.notes,at);
      state.notifications.unshift({id:`NTF-${randomUUID()}`,type:'ROSTER_UPDATED',title:review?'Attendance needs review':'Attendance confirmed',
        body:`${auth.user.name} · ${work.platformCode} · ${work.department} · ${work.rosterDate} ${work.shift}`,
        createdAt:at,read:false,emailStatus:'NOT_SENT',link:'/shifts',recipientRoles:['SUPERVISOR'],recipientId:null});
      return record;
    },at);
  }
  if(method==='returnMyShiftDevice') {
    const [input]=z.tuple([z.object({confirmationId:id,expectedRevision:z.number().int().positive(),notes:note,idempotencyKey:id,physicallyReturned:z.literal(true)}).strict()]).parse(args);
    own(auth,auth.workerId);
    return command(client,auth,method,input,async()=>{
      const record=await authorizedRecord(client,auth,input.confirmationId);
      if(!record.custody)fail('NO_CUSTODY','This confirmation has no laptop receipt.');
      const result=await recordCustodyReturn(client,{custodyId:record.custody.id,expectedRevision:input.expectedRevision,actorId:auth.user.id,at,notes:input.notes});
      if(!result.alreadyReturned){
        const laptop=state.laptops.find(l=>l.assetId===record.assetId);
        if(!laptop||laptop.currentUserId!==auth.workerId)fail('CUSTODY_CHANGED','Inventory custody differs. Ask a supervisor to verify the physical return.');
        Object.assign(laptop,{currentUserId:null,currentUserName:null,currentShift:null});
        if(!['MAINTENANCE','RETIRED','INCIDENT'].includes(laptop.status))laptop.status=laptop.condition==='DAMAGED'?'INCIDENT':'AVAILABLE';
        audit(state,auth,'DEVICE_RETURNED',record,input.notes,at);
      }
      return readAttendanceRecord(client,record.id);
    },at);
  }
  if(method==='getShiftAttendanceDetail')return authorizedRecord(client,auth,z.tuple([id]).parse(args)[0],true);
  if(method==='reviewShiftAttendance') {
    canCorrect(auth);
    const [value,input]=z.tuple([id,z.object({expectedRevision:z.number().int().positive(),status:z.enum(['CONFIRMED','VOIDED']),reason:z.string().trim().min(5).max(2000)}).strict()]).parse(args);
    const before=await readAttendanceRecord(client,value);
    if(before.revision!==input.expectedRevision)fail('CONCURRENCY_CONFLICT','This confirmation was changed. Refresh before reviewing.');
    await client.query(`UPDATE attendance_confirmations SET status=$2,verification='SUPERVISOR_REVIEWED',reviewed_at=$3,reviewed_by=$4,revision=revision+1 WHERE id=$1`,[value,input.status,at,auth.user.id]);
    const after=await readAttendanceRecord(client,value);
    await client.query('INSERT INTO attendance_corrections(id,confirmation_id,actor_user_id,recorded_at,reason,prior_version,before_values,after_values) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [randomUUID(),value,auth.user.id,at,input.reason,before.revision,JSON.stringify(before),JSON.stringify(after)]);
    await client.query(`INSERT INTO attendance_handover_events(id,confirmation_id,actor_user_id,kind,recorded_at,notes) VALUES($1,$2,$3,'CORRECTION',$4,$5)`,[randomUUID(),value,auth.user.id,at,input.reason]);
    audit(state,auth,'ATTENDANCE_REVIEWED',after,input.reason,at);
    return readAttendanceRecord(client,value,{history:true});
  }
  if(method==='listShiftAttendance') {
    const [q]=z.tuple([filters]).parse(args);if(dateRange(q.from,q.to).length>31)fail('VALIDATION','Select at most 31 roster dates.',422);
    if(auth.user.role!=='SUPERVISOR'){own(auth,q.workerId??auth.workerId);q.workerId=auth.workerId;}
    const values=[q.from,q.to],where=['o.roster_date BETWEEN $1 AND $2'];
    for(const [key,column] of [['platform','o.platform_code'],['department','o.department'],['shift','o.shift'],['workerType','o.worker_type'],['status','c.status'],['workerId','u.worker_number']])if(q[key]){values.push(q[key]);where.push(`${column}=$${values.length}`);}
    if(q.search){values.push(`%${q.search}%`);where.push(`(o.worker_name ILIKE $${values.length} OR o.operational_worker_id ILIKE $${values.length})`);}
    const base=`${recordSelect} WHERE ${where.join(' AND ')}`;
    const total=Number((await client.query(`SELECT count(*) FROM (${base}) matches`,values)).rows[0].count);
    const result=await client.query(`${base} ORDER BY o.roster_date DESC,c.accepted_at DESC,c.id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,q.pageSize,(q.page-1)*q.pageSize]);
    return {items:result.rows.map(attendanceRecord),total,page:q.page,pageSize:q.pageSize,serverNow:at};
  }
  if(method==='getDirectoryAttendance') {
    supervisor(auth);
    const [q]=z.tuple([z.object({date,shift:z.enum(['','MORNING','NIGHT']).default(''),workerIds:z.array(z.string().max(100)).max(1000)}).strict()]).parse(args);
    const schedules=attendanceSchedules(state,[q.date],now).filter(s=>!q.shift||s.shift===q.shift);
    const rows=(await client.query(`${recordSelect} WHERE o.roster_date=$1 AND ($2='' OR o.shift=$2) AND u.worker_number=ANY($3::text[])`,[q.date,q.shift,q.workerIds])).rows;
    return Object.fromEntries(q.workerIds.map(worker=>{
      const confirmations=rows.filter(r=>r.current_staff_number===worker).map(attendanceRecord);
      const status=confirmations.some(c=>c.status==='CONFIRMED')?'CONFIRMED':confirmations.some(c=>c.status==='NEEDS_REVIEW')?'NEEDS_REVIEW':
        confirmations.some(c=>c.status==='VOIDED')?'VOIDED':schedules.some(w=>w.workerId===worker)?'NOT_SUBMITTED':'NOT_SCHEDULED';
      return [worker,{status,confirmations}];
    }));
  }
  fail('NOT_FOUND','Attendance operation not found.',404);
}
