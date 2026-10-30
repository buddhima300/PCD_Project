import { z } from 'zod';
import { ApiError } from '../../shared/errors.js';
import { businessDate, rosterProjection, scheduledWindow } from './roster.js';
import { attendanceSchedules, addDays } from './attendance-schedule.js';
import { shiftContext } from './equipment.js';

const trainingStatuses = new Set(['TRAINING_ASSIGNED','IN_TRAINING','TRAINING_EXTENDED']);
function assignment(state, person, now) {
  const trainings=(state.trainingAssignments??[]).filter(t=>t.workerId===person.id || state.candidates?.some(c=>c.id===t.workerId&&c.registeredWorkerId===person.id));
  const active=trainings.filter(t=>!t.promotedAt&&trainingStatuses.has(t.trainingStatus));
  if(active.length>1)return null;
  if(active.length===1){const t=active[0];return {platformCode:t.platformCode,dept:t.dept,shift:t.shift,kind:'TRAINEE',training:{completed:t.completedTrainingDays??0,required:t.requiredTrainingDays??0,start:t.trainingStartDate,end:t.expectedCompletionDate}};}
  if(person.qualifiedForProduction===false || trainings.some(t=>!t.promotedAt&&t.trainingStatus==='TRAINING_COMPLETED'))return null;
  const live=shiftContext(now);
  const replacement=(state.replacements??[]).find(r=>r.freelancerId===person.id&&r.date===live.date&&r.shift===live.shift&&['ASSIGNED','CONFIRMED'].includes(r.status));
  if(replacement)return {platformCode:replacement.platformCode,dept:replacement.dept,shift:replacement.shift,kind:'REPLACEMENT',training:null};
  const platformCode=person.platformCode??person.currentPlatform;
  const production=trainings.filter(t=>t.promotedAt).sort((a,b)=>b.promotedAt.localeCompare(a.promotedAt))[0];
  const shift=person.platformCode?scheduledWindow(state,person,businessDate(now)).shift:production?.productionShift??person.shift;
  return platformCode?{platformCode,dept:person.dept,shift:shift??null,kind:state.freelancers.some(w=>w.id===person.id)?'FREELANCER':'EMPLOYEE',training:null}:null;
}

// A deliberately small, platform-scoped colleague DTO. Never return personnel,
// medical, disciplinary, break review or attendance evidence records to staff.
export function myPlatformProjection(state,auth,attendance=[],now=new Date()) {
  if(!['EMPLOYEE','FREELANCER'].includes(auth.user.role))throw new ApiError(403,'FORBIDDEN','Use your own staff account to view My platform.');
  const people=[...state.employees,...state.freelancers];
  const me=people.find(w=>w.id===auth.workerId);
  if(!me)throw new ApiError(404,'NOT_FOUND','Staff record not found.');
  const mine=assignment(state,me,now),live=shiftContext(now),today=businessDate(now);
  const platform=mine&&state.platforms.find(p=>p.code===mine.platformCode);
  const base={serverNow:now.toISOString(),today,live,person:{name:me.name,dept:me.dept},assignment:mine,platform:null,team:[],breaks:[],offDays:[],departments:[]};
  if(!platform||!['ACTIVE','ON_LEAVE'].includes(me.status)||me.accountStatus!=='ACTIVE')return {...base,assignment:null};
  const members=people.filter(w=>['ACTIVE','ON_LEAVE'].includes(w.status)&&w.accountStatus==='ACTIVE').map(w=>({w,a:assignment(state,w,now)})).filter(x=>x.a?.platformCode===platform.code);
  const roster=new Map();
  for(const month of new Set([live.date,today,addDays(today,6)].map(d=>d.slice(0,7)))){
    for(const row of rosterProjection(state,{user:{role:'SUPERVISOR'}},{month,platform:platform.code},now).rows)roster.set(`${month}:${row.employeeId}`,row);
  }
  const schedules=attendanceSchedules(state,[live.date],now).filter(s=>s.platformCode===platform.code&&s.shift===live.shift);
  for(const s of schedules){if(!members.some(x=>x.w.id===s.workerId)){const w=people.find(w=>w.id===s.workerId);if(w)members.push({w,a:{platformCode:platform.code,dept:s.department,shift:s.shift,kind:'REPLACEMENT',training:null}});}}
  const ids=new Set(members.map(x=>x.w.id));
  const breaks=(state.breaks?.sessions??[]).filter(s=>s.platform===platform.code&&s.shiftDate===live.date&&s.shift===live.shift&&ids.has(s.workerId)&&Date.parse(s.startedAt)<=now.getTime()).map(s=>{
    const active=s.status==='ACTIVE'&&!s.endedAt&&Date.parse(s.shiftEnd)>now.getTime();
    const end=s.endedAt??s.shiftEnd;
    return {id:s.id,workerId:s.workerId,name:people.find(w=>w.id===s.workerId)?.name??s.workerName,dept:s.department,startedAt:s.startedAt,endedAt:s.endedAt??null,active,seconds:Math.max(0,Math.floor((Math.min(now.getTime(),Date.parse(end))-Date.parse(s.startedAt))/1000))};
  }).sort((a,b)=>Number(b.active)-Number(a.active)||b.startedAt.localeCompare(a.startedAt));
  const team=members.map(({w,a})=>{
    const day=roster.get(`${live.date.slice(0,7)}:${w.id}`)?.cells.find(c=>c.date===live.date);
    const schedule=schedules.find(s=>s.workerId===w.id);
    const confirmation=attendance.find(c=>c.workerId===w.id&&c.platformCode===platform.code&&c.date===live.date&&c.shift===live.shift);
    let status=a.kind==='TRAINEE'?'Training':day?.state==='OFF'?'Off-day':day&&day.workingHours===0?'Unavailable':!schedule?'Other shift':Date.parse(schedule.effectiveStart)>now.getTime()?'Starts later':Date.parse(schedule.effectiveEnd)<=now.getTime()?'Shift finished':confirmation?.status==='CONFIRMED'?'Attendance confirmed':confirmation?.status==='NEEDS_REVIEW'?'Attendance under review':'Attendance not submitted';
    if(breaks.some(b=>b.workerId===w.id&&b.active))status='On break';
    return {id:w.id,name:w.name,dept:a.dept,shift:day?.shift??a.shift,kind:a.kind,self:w.id===me.id,status};
  }).sort((a,b)=>Number(b.self)-Number(a.self)||a.name.localeCompare(b.name));
  const offDays=[];
  for(const {w,a} of members){if(a.kind==='TRAINEE')continue;for(let i=0;i<7;i++){const date=addDays(today,i),day=roster.get(`${date.slice(0,7)}:${w.id}`)?.cells.find(c=>c.date===date);if(day?.scheduled!==false&&day?.state==='OFF')offDays.push({id:`${w.id}:${date}`,name:w.name,dept:a.dept,date,shift:day.shift});}}
  const departments=Object.entries(platform.departments).map(([dept,capacity])=>{
    const devices=state.laptops.filter(l=>l.platformCode===platform.code&&l.dept===dept);
    const current=schedules.filter(s=>s.department===dept&&Date.parse(s.effectiveStart)<=now.getTime()&&Date.parse(s.effectiveEnd)>now.getTime());
    return {dept,capacity,target:platform.staffingTargets?.[dept]?.[live.shift]??capacity,scheduled:current.length,confirmed:current.filter(s=>attendance.some(c=>c.workerId===s.workerId&&c.platformCode===platform.code&&c.date===live.date&&c.shift===live.shift&&c.status==='CONFIRMED')).length,trainees:team.filter(w=>w.dept===dept&&w.kind==='TRAINEE').length,devices:devices.length,held:devices.filter(l=>l.currentUserId).length,unavailable:devices.filter(l=>['MAINTENANCE','RETIRED','INCIDENT'].includes(l.status)||l.condition==='DAMAGED').length};
  });
  return {...base,platform:{code:platform.code,name:platform.name??platform.code,description:platform.description??'',category:state.categories.find(c=>c.code===platform.categoryCode)?.name??platform.categoryCode,status:platform.status,lifecycle:platform.lifecycle??'OPERATIONAL'},team,breaks,offDays:offDays.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name)),departments};
}

export async function myPlatformOverview(client,state,auth,args,now=new Date()) {
  z.tuple([]).parse(args);
  const result=myPlatformProjection(state,auth,[],now);
  if(!result.platform)return result;
  const exists=(await client.query("SELECT to_regclass('attendance_confirmations') AS name")).rows[0]?.name;
  const attendance=exists?(await client.query(`SELECT w.worker_number AS "workerId",o.platform_code AS "platformCode",o.roster_date::text AS date,o.shift,c.status FROM attendance_confirmations c JOIN work_occurrences o ON o.id=c.occurrence_id JOIN workers w ON w.id=o.worker_id WHERE o.platform_code=$1 AND o.roster_date=$2 AND o.shift=$3`,[result.platform.code,result.live.date,result.live.shift])).rows:[];
  return myPlatformProjection(state,auth,attendance,now);
}
