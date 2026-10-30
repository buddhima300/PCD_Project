import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ApiError} from '../../shared/errors.js';
import {createDomain} from './runtime.js';
import {attendanceSchedules,addDays,fingerprint} from './attendance-schedule.js';
import {businessDate} from './roster.js';

export const seatRequestMethods=new Set(['getMySeatVacancies','requestVacancySeat','withdrawSeatRequest','listSeatRequests','decideSeatRequest']);
const id=z.string().min(1).max(150);
const month=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const fail=(code,message,status=409)=>{throw new ApiError(status,code,message);};
const instant=value=>Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(value)?value:`${value}+05:30`);
const iso=value=>value?new Date(instant(value)).toISOString():'';
const signature=r=>fingerprint([r.platformCode,r.dept,r.date,r.shift,r.shiftStart,r.shiftEnd,r.absentEmployeeId]);
const open=(state,r,now)=>r&&!r.freelancerId&&['PENDING','SEARCHING','FAILED'].includes(r.status)&&instant(r.shiftStart)>now.getTime()&&r.date<=addDays(businessDate(now),60)&&state.platforms.some(p=>p.code===r.platformCode&&p.status==='ACTIVE'&&p.lifecycle!=='SETUP'&&p.departments[r.dept]>0);
function freelancer(state,auth){
  if(auth.user.role!=='FREELANCER')fail('FORBIDDEN','Freelancer access is required.',403);
  const f=state.freelancers.find(f=>f.id===auth.workerId);
  if(!f)fail('NOT_FOUND','Freelancer record not found.',404);
  return f;
}
export function seatRequestStatus(state,request,now=new Date()){
  if(request.status!=='PENDING')return request.status;
  const rep=state.replacements.find(r=>r.id===request.replacementId);
  if(rep&&['ASSIGNED','CONFIRMED'].includes(rep.status))return rep.freelancerId===request.freelancerId?'ALLOCATED':'NOT_SELECTED';
  return open(state,rep,now)&&signature(rep)===request.signature?'PENDING':'CLOSED';
}
export function seatEligibility(state,f,r,evaluate,now=new Date()){
  const candidate=evaluate(r,state.freelancers,state.availability,state.replacements).find(c=>c.freelancerId===f.id);
  const reasons=candidate?.checks.filter(c=>!c.passed).map(c=>c.label)??['Department does not match'];
  if(f.compatiblePlatforms?.length&&!f.compatiblePlatforms.includes(r.platformCode))reasons.push('Not cleared for this platform');
  if(f.qualifiedForProduction===false||['IN_PLATFORM_TRAINING','TRAINING_COMPLETED','TRAINING_EXTENDED','TRAINING_FAILED','PLATFORM_PLACEMENT_REQUIRED','RELEASED'].includes(f.lifecycle)||state.trainingAssignments.some(t=>!t.promotedAt&&t.trainingStatus!=='TRAINING_FAILED'&&(t.workerId===f.id||state.candidates.some(c=>c.id===t.workerId&&c.registeredWorkerId===f.id))))reasons.push('Complete training and production placement first');
  const dates=[addDays(r.date,-1),r.date,addDays(r.date,1)];
  const scheduled=attendanceSchedules(state,dates,now).filter(s=>s.workerId===f.id&&s.sourceKey!==`replacement:${r.id}`);
  if(scheduled.some(s=>instant(s.effectiveStart)<instant(r.shiftEnd)&&instant(s.effectiveEnd)>instant(r.shiftStart)))reasons.push('Overlaps an assigned shift');
  if(scheduled.filter(s=>Math.abs(instant(s.effectiveStart)-instant(r.shiftStart))<86400000).length>=2)reasons.push('Workload limit reached');
  return {eligible:!!candidate?.eligible&&reasons.length===0,reasons:[...new Set(reasons)]};
}
function notify(state,auth,roles,recipientId,title,body,link,now){state.notifications.unshift({id:`NTF-${randomUUID()}`,type:'REPLACEMENT_ASSIGNED',title,body,link,recipientRoles:roles,recipientId,createdAt:now.toISOString(),read:false,emailStatus:'NOT_SENT'});}
function audit(state,auth,request,action,now){state.audit.unshift({id:`AUD-${randomUUID()}`,at:now.toISOString(),actorId:auth.workerId,actorName:auth.user.name,role:auth.user.role,action,entity:'SeatRequest',entityId:request.id,platformCode:state.replacements.find(r=>r.id===request.replacementId)?.platformCode,previous:'',next:request.status,reason:request.note??'',isOverride:false});}
function detail(state,request,evaluate,now){
  const rep=state.replacements.find(r=>r.id===request.replacementId),f=state.freelancers.find(f=>f.id===request.freelancerId);
  return {id:request.id,replacementId:request.replacementId,freelancerId:request.freelancerId,name:f?.name??request.name,note:request.note,status:seatRequestStatus(state,request,now),version:request.version,createdAt:request.createdAt,platformCode:rep?.platformCode??'',dept:rep?.dept??'',date:rep?.date??'',shift:rep?.shift??'MORNING',shiftStart:iso(rep?.shiftStart),shiftEnd:iso(rep?.shiftEnd),...(rep&&f?seatEligibility(state,f,rep,evaluate,now):{eligible:false,reasons:['Vacancy or worker no longer available']})};
}
export async function seatRequestOperation(state,auth,method,args,now=new Date()){
  const engine=await createDomain(),evaluate=engine.evaluateReplacementCandidates;
  const requests=state.seatRequests??=[];
  if(method==='getMySeatVacancies'){
    const [selectedMonth]=z.tuple([month]).parse(args),f=freelancer(state,auth);
    const vacancies=state.replacements.filter(r=>open(state,r,now)&&r.dept===f.dept&&r.date.startsWith(selectedMonth)).sort((a,b)=>a.shiftStart.localeCompare(b.shiftStart)).map(r=>{
      const request=requests.find(q=>q.replacementId===r.id&&q.freelancerId===f.id);
      return {id:r.id,platformCode:r.platformCode,dept:r.dept,date:r.date,shift:r.shift,shiftStart:iso(r.shiftStart),shiftEnd:iso(r.shiftEnd),...seatEligibility(state,f,r,evaluate,now),request:request?{id:request.id,status:seatRequestStatus(state,request,now),version:request.version}:null};
    });
    return {vacancies,requests:requests.filter(r=>r.freelancerId===f.id).map(r=>detail(state,r,evaluate,now)).filter(r=>r.date.startsWith(selectedMonth)),serverNow:now.toISOString()};
  }
  if(method==='requestVacancySeat'){
    const [replacementId,input]=z.tuple([id,z.object({note:z.string().trim().max(500)}).strict()]).parse(args),f=freelancer(state,auth);
    const rep=state.replacements.find(r=>r.id===replacementId);
    if(!open(state,rep,now))fail('SEAT_UNAVAILABLE','This seat is no longer open. Refresh the vacancies.');
    const eligibility=seatEligibility(state,f,rep,evaluate,now);
    if(!eligibility.eligible)fail('NOT_ELIGIBLE',eligibility.reasons.join('; ')||'You are not eligible for this seat.',422);
    let request=requests.find(r=>r.replacementId===replacementId&&r.freelancerId===f.id);
    if(request&&seatRequestStatus(state,request,now)==='PENDING')return detail(state,request,evaluate,now);
    if(request&&request.status!=='WITHDRAWN')fail('REQUEST_CLOSED','Your request has already been reviewed or closed.');
    if(request)Object.assign(request,{note:input.note,status:'PENDING',signature:signature(rep),version:request.version+1,createdAt:now.toISOString()});
    else{request={id:`SEAT-${randomUUID()}`,replacementId,freelancerId:f.id,name:f.name,note:input.note,status:'PENDING',signature:signature(rep),version:1,createdAt:now.toISOString()};requests.push(request);}
    audit(state,auth,request,'SEAT_REQUESTED',now);
    notify(state,auth,['SUPERVISOR'],null,'Freelancer requested a vacancy',`${f.name} requests ${rep.platformCode} / ${rep.dept} on ${rep.date} (${rep.shift}). Review their interest before allocating this seat.`,`/replacements/${rep.id}`,now);
    return detail(state,request,evaluate,now);
  }
  if(method==='withdrawSeatRequest'){
    const [requestId,version]=z.tuple([id,z.number().int().positive()]).parse(args);const f=freelancer(state,auth),r=requests.find(r=>r.id===requestId&&r.freelancerId===f.id);
    if(!r)fail('NOT_FOUND','Request not found.',404);
    if(r.status==='WITHDRAWN')return detail(state,r,evaluate,now);
    if(r.version!==version)fail('STALE_VERSION','This request changed. Refresh first.');
    if(seatRequestStatus(state,r,now)!=='PENDING')fail('REQUEST_CLOSED','Only pending requests can be withdrawn.');
    r.status='WITHDRAWN';r.version++;audit(state,auth,r,'SEAT_REQUEST_WITHDRAWN',now);return detail(state,r,evaluate,now);
  }
  if(auth.user.role!=='SUPERVISOR')fail('FORBIDDEN','Supervisor access is required.',403);
  if(method==='listSeatRequests'){
    const [replacementId]=z.tuple([id.optional()]).parse(args);
    return requests.filter(r=>!replacementId||r.replacementId===replacementId).map(r=>detail(state,r,evaluate,now)).filter(r=>replacementId||r.status==='PENDING').sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  }
  const [requestId,input]=z.tuple([id,z.object({decision:z.enum(['ALLOCATE','REJECT']),version:z.number().int().positive()}).strict()]).parse(args);
  const r=requests.find(r=>r.id===requestId);if(!r)fail('NOT_FOUND','Request not found.',404);
  if(r.version!==input.version)fail('STALE_VERSION','This request changed. Refresh first.');
  if(seatRequestStatus(state,r,now)!=='PENDING')fail('REQUEST_CLOSED','The request or vacancy is no longer open.');
  const rep=state.replacements.find(p=>p.id===r.replacementId);
  if(input.decision==='ALLOCATE'){
    const f=state.freelancers.find(f=>f.id===r.freelancerId),eligibility=f&&seatEligibility(state,f,rep,evaluate,now);
    if(!eligibility?.eligible)fail('NOT_ELIGIBLE',eligibility?.reasons.join('; ')||'Freelancer no longer eligible.',422);
    engine.hydrate(structuredClone(state),[]);engine.setOperationalClock(now.toISOString());engine.setAuthContext({userId:auth.workerId,role:'SUPERVISOR',name:auth.user.name,permissions:auth.permissions});
    try{await engine.methods.assignFreelancer(rep.id,r.freelancerId);}catch(error){throw new ApiError(error.status??422,error.code??'ALLOCATION_REJECTED',error.message);}
    Object.assign(state,engine.snapshot());
    r.status='ALLOCATED';
  }else r.status='REJECTED';
  r.version++;audit(state,auth,r,`SEAT_REQUEST_${r.status}`,now);
  notify(state,auth,['FREELANCER'],r.freelancerId,input.decision==='ALLOCATE'?'Seat request allocated':'Seat request declined',`${rep.platformCode} / ${rep.dept} · ${rep.date} (${rep.shift})`,input.decision==='ALLOCATE'?'/my/assignments':'/my/availability',now);
  return detail(state,r,evaluate,now);
}
