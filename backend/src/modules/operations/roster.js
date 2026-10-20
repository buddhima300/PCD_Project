import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../../shared/errors.js';

// Stored in ops_state alongside the other small domain modules. All commands run
// inside executeOperation's transaction/advisory lock, including legacy off-days.
export const rosterMethods = new Set(['getRosterWorkspace','completeOffDayPlan','submitLeaveRequest','amendLeaveRequest','decideLeaveRequest','cancelLeaveRequest','setLeaveEntitlement','createRosterReplacement','getRoster','getDailyRoster','getPlatformRoster','getOffDayCalendar','requestOffDay','cancelOffDay','overrideOffDay','setAvailability','getFreelancer']);
const active = r => ['PENDING','APPROVED','OVERRIDE_APPROVED','REQUESTED'].includes(r.status);
const approved = r => ['APPROVED','OVERRIDE_APPROVED'].includes(r.status);
const fail = (code,message,status=409) => { throw new ApiError(status,code,message); };
export const businessDate = (now=new Date()) => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Colombo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const daySchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(d => Number.isFinite(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0,10)===d);
const monthSchema=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const scopeSchema=z.object({month:monthSchema,platform:z.string().optional(),dept:z.enum(['','GS','DP','WD','SAFETY']).optional(),category:z.string().optional(),shift:z.enum(['','MORNING','NIGHT']).optional(),search:z.string().max(100).optional(),employeeId:z.string().optional(),state:z.string().optional()}).strict();
const note=z.string().trim().min(5).max(1000);
const leaveInput=z.object({kind:z.enum(['CASUAL_LEAVE','HALF_DAY','EIGHT_HOUR','INFORMED_ABSENCE','ANNUAL_LEAVE','MEDICAL_LEAVE']),startDate:daySchema,endDate:daySchema,reason:note,portion:z.enum(['FIRST','SECOND']).optional(),urgent:z.boolean().optional(),idempotencyKey:z.string().min(8).max(100)}).strict();
const monthNumber=d => Number(d.slice(0,4))*12+Number(d.slice(5,7));
const iso=value => new Date(value).toISOString();
const instant=value => Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}+05:30`);
const addDay=d => new Date(Date.parse(`${d}T12:00:00Z`)+86400000).toISOString().slice(0,10);
export function dateRange(start,end) {
  if(end<start)fail('VALIDATION','End date must follow the start date.',422);
  const dates=[];
  for(let d=start;d<=end;d=addDay(d)){dates.push(d);if(dates.length>62)fail('VALIDATION','Choose at most 62 calendar days per request.',422);}
  return dates;
}
const daysFor=month => dateRange(`${month}-01`,new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10));
function moduleState(state) { return state.roster ??= {version:1,requests:[],plans:[],entitlements:[]}; }
function supervisor(auth) { if(auth.user.role!=='SUPERVISOR')fail('FORBIDDEN','Supervisor access is required.',403); }
function employeeFor(state,id) {
  const e=state.employees.find(e=>e.id===id); if(!e)fail('NOT_FOUND','Employee not found.',404); return e;
}
function owner(auth,id) { if(auth.user.role!=='SUPERVISOR' && (auth.user.role!=='EMPLOYEE'||auth.workerId!==id))fail('FORBIDDEN','You can only manage your own requests.',403); }
function placed(e) { if(!e.platformCode || e.qualifiedForProduction===false || e.lifecycle==='RELEASED' || ['SUSPENDED','INACTIVE','RESIGNED','TERMINATED'].includes(e.status) || e.accountStatus!=='ACTIVE')fail('PLACEMENT_REQUIRED','An active employee platform assignment is required.',422); }
function audit(state,auth,action,id,reason,previous,next,e,now) {
  state.audit.unshift({id:`AUD-${randomUUID()}`,at:now.toISOString(),actorId:auth.workerId??auth.user.id,actorName:auth.user.name,role:auth.user.role,action,entity:'Roster',entityId:id,platformCode:e?.platformCode,dept:e?.dept,previous,next,reason,isOverride:false});
}
function notify(state,e,title,body,now,roles=['EMPLOYEE']) {
  state.notifications.unshift({id:`NTF-${randomUUID()}`,type:'ROSTER_UPDATED',title,body,createdAt:now.toISOString(),read:false,emailStatus:'NOT_SENT',link:roles[0]==='SUPERVISOR'?'/roster?view=requests':'/my/schedule',recipientRoles:roles,recipientId:roles[0]==='SUPERVISOR'?null:e.id});
}
export function scheduledWindow(state,e,date) {
  // A scheduled rotation is an explicit future flip relative to current assignment.
  const flips=(state.rotationCycles??[]).filter(c=>c.status==='SCHEDULED' && !c.executedAt && c.start<=date && c.start>=(e.shiftEffectiveFrom??e.joinedAt??'').slice(0,10)).length;
  const shift=flips%2 ? (e.shift==='MORNING'?'NIGHT':'MORNING') : e.shift;
  const start=Date.parse(`${date}T${shift==='MORNING'?'07:30':'19:30'}:00+05:30`);
  return {date,shift,start:iso(start),end:iso(start+12*3600000)};
}
function interval(state,e,date,kind,portion) {
  const w=scheduledWindow(state,e,date),start=Date.parse(w.start),end=Date.parse(w.end);
  if(kind==='HALF_DAY')return {...w,absentStart:iso(portion==='FIRST'?start:start+6*3600000),absentEnd:iso(portion==='FIRST'?start+6*3600000:end)};
  if(kind==='EIGHT_HOUR')return {...w,absentStart:iso(portion==='FIRST'?start:start+8*3600000),absentEnd:iso(portion==='FIRST'?start+4*3600000:end)};
  return {...w,absentStart:w.start,absentEnd:w.end};
}
const offDates=(state,id,month) => new Set(state.offDays.filter(o=>o.employeeId===id && approved(o) && o.date.startsWith(month)).map(o=>o.date));
const groupUsed=(state,e,date,except) => new Set(state.offDays.filter(o=>o.id!==except && o.platformCode===e.platformCode && o.dept===e.dept && o.date===date && approved(o)).map(o=>o.employeeId)).size;
const eventsFor=(state,id) => (state.profile?.events??[]).filter(e=>e.workerId===id);
const excluded=(id,exclude)=>Array.isArray(exclude)?exclude.includes(id):id===exclude;
function requestRoot(state,r){const seen=new Set();while(r.amendmentOf&&!seen.has(r.id)){seen.add(r.id);const parent=moduleState(state).requests.find(x=>x.id===r.amendmentOf);if(!parent)break;r=parent;}return r.id;}
function unitsUsed(state,id,end,exclude,statuses=['PENDING','APPROVED']) {
  const units=new Map(),groups=new Map();
  for(const e of eventsFor(state,id).filter(e=>e.date<=end && ['HALF_DAY','CASUAL_LEAVE'].includes(e.kind)))units.set(`${e.date}|${e.kind}`,e.kind==='HALF_DAY'?1:2);
  for(const r of moduleState(state).requests.filter(r=>!excluded(r.id,exclude) && r.employeeId===id && statuses.includes(r.status) && ['HALF_DAY','CASUAL_LEAVE'].includes(r.kind))){const dates=r.dates.filter(d=>d<=end);for(const d of dates)units.delete(`${d}|${r.kind}`);const root=requestRoot(state,r),cost=dates.length*(r.kind==='HALF_DAY'?1:2);groups.set(root,Math.max(groups.get(root)??0,cost));}
  return [...units.values(),...groups.values()].reduce((a,b)=>a+b,0);
}
function halfAvailable(state,e,end,exclude,statuses) {
  const accrued=Math.max(0,monthNumber(end)-monthNumber(e.joinedAt)+1);
  return Math.max(0,accrued-unitsUsed(state,e.id,end,exclude,statuses));
}
function annualUsage(state,id,year,kind,exclude,status='APPROVED') {
  const groups=new Map();
  for(const r of moduleState(state).requests.filter(r=>!excluded(r.id,exclude)&&r.employeeId===id&&r.kind===kind&&['PENDING','APPROVED'].includes(r.status))){const root=requestRoot(state,r),g=groups.get(root)??{APPROVED:0,PENDING:0};g[r.status]=Math.max(g[r.status],r.dates.filter(d=>d.startsWith(String(year))).length);groups.set(root,g);}
  return [...groups.values()].reduce((n,g)=>n+(status==='APPROVED'?g.APPROVED:Math.max(0,g.PENDING-g.APPROVED)),0);
}
function balance(state,e,month) {
  const store=moduleState(state),end=daysFor(month).at(-1),year=Number(month.slice(0,4)),ent=store.entitlements.find(x=>x.employeeId===e.id && x.year===year);
  const count=kind=>{const relevant=store.requests.filter(r=>r.employeeId===e.id&&active(r)&&r.kind===kind&&r.dates.some(d=>d.startsWith(month))),roots=new Set(relevant.map(r=>requestRoot(state,r)));const ledger=eventsFor(state,e.id).filter(r=>r.kind===kind&&r.date.startsWith(month)&&!relevant.some(x=>x.dates.includes(r.date)));return roots.size+new Set(ledger.map(e=>e.date)).size;};
  const available=halfAvailable(state,e,end,undefined,['APPROVED']);
  return {offAllowance:e.offDaysAllowance??4,offUsed:offDates(state,e.id,month).size,offRemaining:Math.max(0,(e.offDaysAllowance??4)-offDates(state,e.id,month).size),planComplete:store.plans.some(p=>p.employeeId===e.id && p.month===month),halfDayUsed:count('HALF_DAY'),eightHourUsed:count('EIGHT_HOUR'),halfUnitsAvailable:available,halfUnitsReserved:Math.max(0,available-halfAvailable(state,e,end)),annual:{allowance:ent?.annual??null,used:annualUsage(state,e.id,year,'ANNUAL_LEAVE'),reserved:annualUsage(state,e.id,year,'ANNUAL_LEAVE',undefined,'PENDING')},medical:{allowance:ent?.medical??null,used:annualUsage(state,e.id,year,'MEDICAL_LEAVE'),reserved:annualUsage(state,e.id,year,'MEDICAL_LEAVE',undefined,'PENDING')}};
}
function checkOverlap(state,e,dates,exclude) {
  if(state.offDays.some(o=>o.employeeId===e.id && active(o)&&dates.includes(o.date)))fail('OVERLAP','An off-day already occupies a selected date.');
  if(moduleState(state).requests.some(r=>!excluded(r.id,exclude)&&r.employeeId===e.id&&active(r)&&r.dates.some(d=>dates.includes(d))))fail('OVERLAP','A pending or approved request already occupies a selected date.');
  if(eventsFor(state,e.id).some(r=>dates.includes(r.date)))fail('OVERLAP','A recorded attendance or leave event already occupies a selected date.');
}
function checkRequest(state,e,r,{approval=false,now=new Date()}={}) {
  const ignore=[r.id,r.amendmentOf].filter(Boolean);
  placed(e);checkOverlap(state,e,r.dates,ignore);
  if(r.dates.some(d=>d<(e.joinedAt??'').slice(0,10)))fail('NOT_EMPLOYED','Leave cannot precede the employee joining date.',422);
  const months=[...new Set(r.dates.map(d=>d.slice(0,7)))];
  if(!(r.kind==='MEDICAL_LEAVE'&&r.urgent) && months.some(m=>!moduleState(state).plans.some(p=>p.employeeId===e.id&&p.month===m)))fail('PLAN_REQUIRED','Finish off-day planning for each selected month first. Unused off-days are allowed.');
  if(r.dates.some(d=>Date.parse(scheduledWindow(state,e,d).start)<=now.getTime()))fail('SHIFT_STARTED','Requests must be made before the scheduled shift starts.',422);
  if(r.kind==='INFORMED_ABSENCE' && r.dates.some(d=>Date.parse(scheduledWindow(state,e,d).start)-Date.parse(r.createdAt)<48*3600000))fail('NOTICE_REQUIRED','Informed absences require at least 48 hours before each shift starts.',422);
  if(['HALF_DAY','EIGHT_HOUR'].includes(r.kind)){
    if(r.dates.length!==1)fail('MONTHLY_LIMIT','Half-days and 8-hour shifts are single-date requests.',422);
    if(moduleState(state).requests.some(x=>!excluded(x.id,ignore)&&x.employeeId===e.id&&active(x)&&x.kind===r.kind&&x.dates.some(d=>d.startsWith(months[0]))) || eventsFor(state,e.id).some(x=>x.kind===r.kind&&x.date.startsWith(months[0])))fail('MONTHLY_LIMIT','Only one half-day and one 8-hour shift may be reserved or approved per month.');
  }
  if(['HALF_DAY','CASUAL_LEAVE'].includes(r.kind)){
    // Reserve accrued units at every date; later accrual cannot fund earlier leave.
    const future=[...moduleState(state).requests.filter(x=>!excluded(x.id,ignore)&&x.employeeId===e.id&&active(x)&&['HALF_DAY','CASUAL_LEAVE'].includes(x.kind)).flatMap(x=>x.dates),...r.dates];
    for(const d of future){const cost=r.dates.filter(x=>x<=d).length*(r.kind==='HALF_DAY'?1:2);if(halfAvailable(state,e,d,ignore)<cost)fail('INSUFFICIENT_BALANCE','Insufficient accrued half-day units (two units fund one casual day).');}
  }
  if(['ANNUAL_LEAVE','MEDICAL_LEAVE'].includes(r.kind))for(const year of new Set(r.dates.map(d=>Number(d.slice(0,4))))){
    const ent=moduleState(state).entitlements.find(x=>x.employeeId===e.id&&x.year===year),limit=ent?.[r.kind==='ANNUAL_LEAVE'?'annual':'medical'];
    if(limit==null){if(approval)fail('ENTITLEMENT_REQUIRED',`A supervisor must configure the ${year} entitlement before approving this leave.`);continue;}
    const used=annualUsage(state,e.id,year,r.kind,ignore)+annualUsage(state,e.id,year,r.kind,ignore,'PENDING');
    if(used+r.dates.filter(d=>d.startsWith(String(year))).length>limit)fail('INSUFFICIENT_BALANCE',`Insufficient ${year} leave entitlement.`);
  }
}
function normalizedOff(o) { return {id:o.id,employeeId:o.employeeId,employeeName:o.employeeName,platformCode:o.platformCode,dept:o.dept,shift:o.shift,kind:'OFF_DAY',dates:[o.date],status:approved(o)?'APPROVED':o.status==='REQUESTED'?'PENDING':o.status,reason:o.reason??'Automatically processed',createdAt:o.createdAt,version:o.version??1,decidedBy:o.override?.managerName??'System',decisionReason:o.reason}; }
export function rosterProjection(state,auth,q,now=new Date()) {
  q=scopeSchema.parse(q);if(auth.user.role==='FREELANCER')fail('FORBIDDEN','Freelancers use availability and assignments.',403);
  const days=daysFor(q.month),today=businessDate(now),store=moduleState(state);
  const people=state.employees.filter(e=>e.platformCode && (auth.user.role==='SUPERVISOR'?!q.employeeId||q.employeeId===e.id:e.id===auth.workerId)).filter(e=>(!q.platform||q.platform===e.platformCode)&&(!q.dept||q.dept===e.dept)&&(!q.category||q.category===e.categoryCode)&&(!q.search||`${e.id} ${e.name}`.toLowerCase().includes(q.search.toLowerCase())));
  const ids=new Set(people.map(e=>e.id));
  const requests=[...state.offDays.filter(o=>ids.has(o.employeeId)&&o.date.startsWith(q.month)).map(normalizedOff),...store.requests.filter(r=>ids.has(r.employeeId)&&r.dates.some(d=>d.startsWith(q.month)))].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const byEmployee=new Map(people.map(e=>[e.id,{off:new Map(),leave:new Map(),pending:new Map(),replacement:new Map(),events:new Map()}]));
  for(const o of state.offDays.filter(approved)){const m=byEmployee.get(o.employeeId);if(m)m.off.set(o.date,o);}
  for(const r of store.requests){const m=byEmployee.get(r.employeeId);if(!m)continue;for(const d of r.dates){if(r.status==='APPROVED')m.leave.set(d,r);if(r.status==='PENDING')m.pending.set(d,[...(m.pending.get(d)??[]),r.kind]);}}
  for(const r of state.replacements.filter(r=>r.status!=='CANCELLED')){const m=byEmployee.get(r.absentEmployeeId);if(m)m.replacement.set(r.date,r);}
  for(const e of state.profile?.events??[]){const m=byEmployee.get(e.workerId);if(m)m.events.set(e.date,e);}
  let rows=people.map(e=>({employeeId:e.id,name:e.name,platformCode:e.platformCode,dept:e.dept,shift:e.shift,cells:days.map(date=>{
    const m=byEmployee.get(e.id),off=m.off.get(date),leave=m.leave.get(date),event=m.events.get(date),rep=m.replacement.get(date);
    const kind=off?'OFF_DAY':leave?.kind??(event&&['HALF_DAY','CASUAL_LEAVE','INFORMED_ABSENCE','OFF_DAY'].includes(event.kind)?event.kind:undefined);
    const stored=leave?.intervals?.find(i=>i.date===date),w=stored??scheduledWindow(state,e,date);
    if(date<(e.joinedAt??'').slice(0,10)||(['INACTIVE','RESIGNED','TERMINATED','SUSPENDED'].includes(e.status)&&date>=today))return {date,state:'WORKING',scheduled:false,pending:[],shift:w.shift,shiftStart:w.start,shiftEnd:w.end,workingHours:0,uncoveredHours:0};
    const gap=kind&&kind!=='OFF_DAY'?(stored??interval(state,e,date,kind,leave?.portion)):null;
    const absentHours=gap?(Date.parse(gap.absentEnd)-Date.parse(gap.absentStart))/3600000:rep||event?.kind==='UNINFORMED_ABSENCE'?12:0;
    const covered=rep?.freelancerId && ['ASSIGNED','CONFIRMED'].includes(rep.status);
    const coverage=covered?Math.max(0,(Math.min(gap?Date.parse(gap.absentEnd):Date.parse(w.end),instant(rep.shiftEnd))-Math.max(gap?Date.parse(gap.absentStart):Date.parse(w.start),instant(rep.shiftStart)))/3600000):0;
    const stateCode=off?'OFF':kind==='EIGHT_HOUR'?'WORKING':kind==='OFF_DAY'?'OFF':kind?kind==='INFORMED_ABSENCE'?'ABSENT':'LEAVE':rep||event?.kind==='UNINFORMED_ABSENCE'?'ABSENT':'WORKING';
    return {date,state:covered&&absentHours>0?'REPLACED':stateCode,scheduled:true,kind,requestId:leave?.id??off?.id,pending:m.pending.get(date)??[],shift:w.shift,shiftStart:w.start,shiftEnd:w.end,workingHours:kind==='OFF_DAY'?0:12-absentHours,uncoveredHours:kind==='OFF_DAY'?0:Math.max(0,absentHours-coverage),absenceStart:gap?.absentStart,absenceEnd:gap?.absentEnd,replacement:rep?{id:rep.id,name:rep.freelancerName,status:rep.status}:undefined};
  })}));
  if(q.shift)rows=rows.filter(r=>r.cells.some(c=>c.shift===q.shift));
  if(q.state)rows=rows.filter(r=>r.cells.some(c=>c.state===q.state));
  const cells=rows.flatMap(r=>r.cells),mine=auth.user.role==='EMPLOYEE'?employeeFor(state,auth.workerId):null;
  return {month:q.month,today,serverNow:now.toISOString(),days,rows,requests:requests.filter(r=>rows.some(e=>e.employeeId===r.employeeId)),totals:{working:cells.filter(c=>c.workingHours>0).length,off:cells.filter(c=>c.kind==='OFF_DAY'||c.state==='OFF').length,leave:cells.filter(c=>c.kind&&c.kind!=='OFF_DAY').length,pending:requests.filter(r=>r.status==='PENDING').length,uncoveredHours:cells.reduce((n,c)=>n+c.uncoveredHours,0)},balance:mine?balance(state,mine,q.month):null,capacity:mine?days.map(date=>({date,used:groupUsed(state,mine,date),limit:2})):[],employees:auth.user.role==='SUPERVISOR'?people.map(e=>({id:e.id,name:e.name})):[],entitlements:auth.user.role==='SUPERVISOR'?store.entitlements.filter(x=>ids.has(x.employeeId)&&x.year===Number(q.month.slice(0,4))):[]};
}
function addOffDay(state,auth,e,date,now) {
  placed(e);if(date<=businessDate(now))fail('PAST_DATE','Off-days must be requested for a future date.',422);
  if(date<(e.joinedAt??'').slice(0,10))fail('NOT_EMPLOYED','Off-days cannot precede the employee joining date.',422);
  const existing=state.offDays.find(o=>o.employeeId===e.id&&o.date===date&&approved(o));
  if(existing)return {outcome:'APPROVED',request:existing,capacity:{approved:groupUsed(state,e,date),limit:2},message:'This off-day is already approved.'};
  checkOverlap(state,e,[date]);
  if(offDates(state,e.id,date.slice(0,7)).size>=(e.offDaysAllowance??4))fail('ALLOWANCE_EXHAUSTED','Your monthly off-day allowance is exhausted.');
  const used=groupUsed(state,e,date),ok=used<2;
  const request={id:`OFF-${randomUUID()}`,employeeId:e.id,employeeName:e.name,platformCode:e.platformCode,dept:e.dept,shift:scheduledWindow(state,e,date).shift,date,status:ok?'APPROVED':'REJECTED',createdAt:now.toISOString(),version:1,reason:ok?'Approved automatically.':`Two employees in ${e.platformCode} / ${e.dept} already have off-days on ${date}. Choose another date.`};
  state.offDays.push(request);audit(state,auth,'OFF_DAY_REQUESTED',request.id,request.reason,'',request.status,e,now);notify(state,e,ok?'Off-day approved':'Off-day unavailable',`${date}: ${request.reason}`,now);notify(state,e,'Off-day request processed',`${e.name} · ${date} · ${request.status}`,now,['SUPERVISOR']);
  return {outcome:request.status,request,capacity:{approved:ok?used+1:used,limit:2},message:request.reason};
}
function cancelCoverage(state,r,auth,now) {
  const reps=state.replacements.filter(x=>x.rosterRequestId===r.id&&x.status!=='CANCELLED');
  if(reps.some(x=>instant(x.shiftStart)<=now.getTime()))fail('COVERAGE_STARTED','Coverage has started; ask the supervisor to reconcile attendance.');
  for(const rep of reps){rep.status='CANCELLED';rep.cancelReason='Linked leave cancelled';rep.timeline=[...(rep.timeline??[]),{key:'cancelled',label:'Leave cancelled',state:'done',at:now.toISOString()}];if(rep.freelancerId){if(state.availability[rep.freelancerId]?.[rep.date])state.availability[rep.freelancerId][rep.date][rep.shift]='AVAILABLE';notify(state,{id:rep.freelancerId},'Replacement cancelled',`Your coverage on ${rep.date} was cancelled with the linked leave.`,now,['FREELANCER']);}audit(state,auth,'REPLACEMENT_CANCELLED',rep.id,'Linked leave cancelled','ACTIVE','CANCELLED',rep,now);}
}
export function rosterOperation(state,auth,method,args,now=new Date()) {
  const store=moduleState(state);
  if(method==='setAvailability'||method==='getFreelancer'){
    const freelancerId=z.string().parse(args[0]);
    if(auth.user.role==='EMPLOYEE'||(auth.user.role==='FREELANCER'&&auth.workerId!==freelancerId))fail('FORBIDDEN','Only your own availability can be managed.',403);
    const f=state.freelancers.find(f=>f.id===freelancerId);if(!f)fail('NOT_FOUND','Freelancer not found.',404);
    if(method==='getFreelancer'){
      const [,month]=z.tuple([z.string(),monthSchema.optional()]).parse(args),days=daysFor(month??businessDate(now).slice(0,7));
      const assignments=state.replacements.filter(r=>r.freelancerId===freelancerId),today=businessDate(now);
      return {freelancer:{...f,employmentType:f.employmentType??'FREELANCER',workloadUsed:assignments.filter(r=>['ASSIGNED','CONFIRMED'].includes(r.status)&&Math.abs(instant(r.shiftStart)-now.getTime())<86400000).length,workloadLimit:2,todayMorning:state.availability[freelancerId]?.[today]?.MORNING??'UNAVAILABLE',todayNight:state.availability[freelancerId]?.[today]?.NIGHT??'UNAVAILABLE'},availability:days.map(date=>({date,MORNING:state.availability[freelancerId]?.[date]?.MORNING??'UNAVAILABLE',NIGHT:state.availability[freelancerId]?.[date]?.NIGHT??'UNAVAILABLE'})),assignments,priorityHistory:state.audit.filter(x=>x.entity==='FreelancerPriority'&&x.dept===f.dept)};
    }
    const [,date,shift,value]=z.tuple([z.string(),daySchema,z.enum(['MORNING','NIGHT']),z.enum(['AVAILABLE','UNAVAILABLE','OFF'])]).parse(args);
    if(Date.parse(scheduledWindow({rotationCycles:[]},{shift},date).start)<=now.getTime())fail('SHIFT_STARTED','Availability cannot change after the shift starts.',422);
    if(Date.parse(`${date}T00:00:00+05:30`)-Date.parse(`${businessDate(now)}T00:00:00+05:30`)>60*86400000)fail('OUT_OF_RANGE','Availability can be managed up to 60 days ahead.',422);
    if(state.replacements.some(r=>r.freelancerId===freelancerId&&r.date===date&&r.shift===shift&&['ASSIGNED','CONFIRMED'].includes(r.status))||state.availability[freelancerId]?.[date]?.[shift]==='ASSIGNED')fail('ASSIGNED_SHIFT','Ask a supervisor to cancel the assigned shift before changing availability.');
    state.availability[freelancerId]??={};state.availability[freelancerId][date]??={MORNING:'UNAVAILABLE',NIGHT:'UNAVAILABLE'};state.availability[freelancerId][date][shift]=value;
    audit(state,auth,'AVAILABILITY_CHANGED',`${freelancerId}:${date}:${shift}`,value,'',value,f,now);return {date,...state.availability[freelancerId][date]};
  }
  if(method==='getRosterWorkspace'||method==='getRoster'){
    const [q]=z.tuple([scopeSchema]).parse(args);const w=rosterProjection(state,auth,q,now);
    if(method==='getRosterWorkspace')return w;
    const totals={WORKING:0,OFF:0,ABSENT:0,REPLACED:0,LEAVE:0};for(const r of w.rows)for(const c of r.cells)if(c.scheduled!==false)totals[c.state]++;
    return {days:w.days,rows:w.rows,totals};
  }
  if(method==='getDailyRoster'){
    supervisor(auth);const [date,q]=z.tuple([daySchema,scopeSchema.omit({month:true})]).parse(args);
    return rosterProjection(state,auth,{...q,month:date.slice(0,7)},now).rows.map(r=>{const c=r.cells.find(c=>c.date===date);const rep=state.replacements.find(x=>x.id===c.replacement?.id);return {...r,...c,replacement:rep?{id:rep.id,freelancerId:rep.freelancerId,freelancerName:rep.freelancerName,status:rep.status}:null};}).filter(r=>r.scheduled!==false&&(!q.state||r.state===q.state)&&(!q.shift||r.shift===q.shift));
  }
  if(method==='getPlatformRoster'){
    if(auth.user.role!=='SUPERVISOR'){const p=auth.user.role==='EMPLOYEE'?state.employees.find(e=>e.id===auth.workerId)?.platformCode:state.freelancers.find(e=>e.id===auth.workerId)?.currentPlatform;if(args[0]!==p)fail('FORBIDDEN','Only your assigned platform can be viewed.',403);}
    const [code,date]=z.tuple([z.string(),daySchema]).parse(args),p=state.platforms.find(x=>x.code===code);if(!p)fail('NOT_FOUND','Platform not found.',404);
    const w=rosterProjection(state,{user:{role:'SUPERVISOR'}},{month:date.slice(0,7),platform:code},now);
    return {platformCode:code,date,depts:Object.keys(p.departments).map(dept=>({dept,capacity:p.departments[dept],shifts:['MORNING','NIGHT'].map(shift=>{const time=scheduledWindow({rotationCycles:[]},{shift},date);const entries=w.rows.filter(r=>r.dept===dept&&r.cells.some(c=>c.date===date&&c.shift===shift&&c.scheduled!==false)).flatMap(r=>{const c=r.cells.find(c=>c.date===date),out=[{id:r.employeeId,name:r.name,state:c.state,isFreelancer:false}];if(c.replacement?.name&&['ASSIGNED','CONFIRMED'].includes(c.replacement.status))out.push({id:state.replacements.find(x=>x.id===c.replacement.id).freelancerId,name:c.replacement.name,state:'WORKING',isFreelancer:true,replacing:r.employeeId});return out;});return {shift,shiftStart:time.start,shiftEnd:time.end,working:entries.filter(e=>e.state==='WORKING').length,entries};})}))};
  }
  if(method==='getOffDayCalendar'){
    const [id,month]=z.tuple([z.string(),monthSchema]).parse(args);owner(auth,id);const e=employeeFor(state,id),b=balance(state,e,month),today=businessDate(now);
    return {employeeId:id,platformCode:e.platformCode,dept:e.dept,month,allowance:b.offAllowance,used:b.offUsed,remaining:b.offRemaining,cells:daysFor(month).map(date=>{const used=groupUsed(state,e,date),req=state.offDays.filter(o=>o.employeeId===id&&o.date===date&&o.status!=='CANCELLED').at(-1);const occupied=store.requests.some(r=>r.employeeId===id&&active(r)&&r.dates.includes(date));const reason=!e.platformCode?'Platform placement is required first':date<=today?'Select a future date':req&&active(req)?'An off-day is already approved':occupied?'A leave request occupies this date':used>=2?'The two off-day slots are taken':b.offRemaining===0?'Monthly allowance exhausted':null;return {date,approvedInGroup:used,limit:2,groupState:used>2?'CONFLICT':used===2?'FULL':used?'PARTIAL':'AVAILABLE',myRequest:req?{id:req.id,status:req.status,reason:req.reason}:null,selectable:!reason,unavailableReason:reason,isPast:date<=today};})};
  }
  if(method==='requestOffDay') {const [id,date]=z.tuple([z.string(),daySchema]).parse(args);owner(auth,id);return addOffDay(state,auth,employeeFor(state,id),date,now);}
  if(method==='overrideOffDay'){
    supervisor(auth);const [id,reason]=z.tuple([z.string(),note]).parse(args),r=state.offDays.find(r=>r.id===id);if(!r)fail('NOT_FOUND','Request not found.',404);
    if(r.status!=='REJECTED')fail('INVALID_STATE','Only rejected requests can be reconsidered.');
    const e=employeeFor(state,r.employeeId);if(groupUsed(state,e,r.date)>=2)fail('CAPACITY_CONFLICT','The two-person limit cannot be exceeded. Choose another date.');
    const result=addOffDay(state,auth,e,r.date,now);audit(state,auth,'OFF_DAY_RECONSIDERED',r.id,reason,'REJECTED',result.outcome,e,now);return result.request;
  }
  if(method==='cancelOffDay'){
    const [id]=z.tuple([z.string()]).parse(args),r=state.offDays.find(r=>r.id===id);if(!r)fail('NOT_FOUND','Request not found.',404);owner(auth,r.employeeId);
    if(r.status==='CANCELLED')return r;if(r.date<=businessDate(now))fail('PAST_DATE','Started or past off-days cannot be cancelled.');
    r.status='CANCELLED';r.version=(r.version??1)+1;audit(state,auth,'OFF_DAY_CANCELLED',id,'Employee/supervisor cancellation','APPROVED','CANCELLED',r,now);notify(state,{id:r.employeeId},'Off-day cancelled',r.date,now);notify(state,r,'Off-day cancelled',`${r.employeeName} · ${r.date}`,now,['SUPERVISOR']);return r;
  }
  if(method==='completeOffDayPlan'){
    if(auth.user.role!=='EMPLOYEE')fail('FORBIDDEN','Only employees can finish their own off-day plan.',403);
    const [month]=z.tuple([monthSchema]).parse(args),e=employeeFor(state,auth.workerId);placed(e);
    if(month<businessDate(now).slice(0,7))fail('PAST_DATE','Past-month planning is closed.');
    if(!store.plans.some(p=>p.employeeId===e.id&&p.month===month)){store.plans.push({employeeId:e.id,month,completedAt:now.toISOString()});audit(state,auth,'OFF_DAY_PLAN_COMPLETED',`${e.id}:${month}`,'Unused entitlement is allowed.','DRAFT','COMPLETE',e,now);}
    return balance(state,e,month);
  }
  if(method==='submitLeaveRequest'||method==='amendLeaveRequest'){
    if(auth.user.role!=='EMPLOYEE')fail('FORBIDDEN','Only employees can submit leave for themselves.',403);
    const [parentId,input,parentVersion]=method==='amendLeaveRequest'?z.tuple([z.string(),leaveInput,z.number().int().positive()]).parse(args):[null,...z.tuple([leaveInput]).parse(args),null];
    const e=employeeFor(state,auth.workerId),previous=store.requests.find(r=>r.employeeId===e.id&&r.idempotencyKey===input.idempotencyKey);
    if(previous){const original=previous.input;if(JSON.stringify(original)!==JSON.stringify(input)||(previous.amendmentOf??null)!==parentId)fail('IDEMPOTENCY_CONFLICT','This submission key was already used for a different request.');return previous;}
    let parent;
    if(parentId){parent=store.requests.find(r=>r.id===parentId);if(!parent)fail('NOT_FOUND','Original request not found.',404);owner(auth,parent.employeeId);if(parent.status!=='APPROVED'||parent.version!==parentVersion)fail('CONCURRENCY_CONFLICT','Only the current approved request can be amended. Refresh first.');if(parent.kind!==input.kind)fail('VALIDATION','An amendment must keep the same leave type.',422);if(parent.intervals.some(i=>Date.parse(i.start)<=now.getTime()))fail('SHIFT_STARTED','Started leave cannot be amended.');if(store.requests.some(r=>r.amendmentOf===parentId&&r.status==='PENDING'))fail('AMENDMENT_PENDING','A change to this request is already awaiting review.');}
    if(['HALF_DAY','EIGHT_HOUR'].includes(input.kind)&&!input.portion)fail('VALIDATION','Choose the first or second part of the shift.',422);
    const dates=dateRange(input.startDate,input.endDate),r={id:`LVE-${randomUUID()}`,employeeId:e.id,employeeName:e.name,platformCode:e.platformCode,dept:e.dept,shift:e.shift,kind:input.kind,dates,status:'PENDING',reason:input.reason,portion:input.portion,urgent:input.kind==='MEDICAL_LEAVE'&&!!input.urgent,createdAt:now.toISOString(),version:1,policyVersion:1,idempotencyKey:input.idempotencyKey,input,...(parent?{amendmentOf:parent.id,parentVersion}:{}),intervals:dates.map(d=>interval(state,e,d,input.kind,input.portion)),history:[{at:now.toISOString(),actor:auth.user.name,action:parent?'AMENDMENT_SUBMITTED':'SUBMITTED',reason:input.reason}]};
    checkRequest(state,e,r,{now});store.requests.push(r);audit(state,auth,'LEAVE_SUBMITTED',r.id,r.reason,'','PENDING',e,now);notify(state,e,'Leave request submitted',`${r.kind.replaceAll('_',' ')} · ${dates[0]}`,now);notify(state,e,'Leave request awaiting review',`${e.name} · ${r.kind.replaceAll('_',' ')} · ${dates[0]}`,now,['SUPERVISOR']);return r;
  }
  if(method==='decideLeaveRequest'){
    supervisor(auth);const [id,input]=z.tuple([z.string(),z.object({decision:z.enum(['APPROVED','REJECTED']),reason:note,expectedVersion:z.number().int().positive()}).strict()]).parse(args),r=store.requests.find(r=>r.id===id);
    if(!r)fail('NOT_FOUND','Request not found.',404);if(r.version!==input.expectedVersion)fail('CONCURRENCY_CONFLICT','This request changed. Refresh before deciding.');if(r.status!=='PENDING')fail('INVALID_STATE','Only pending requests may be decided.');
    const e=employeeFor(state,r.employeeId);
    if(input.decision==='APPROVED'){
      const parent=r.amendmentOf?store.requests.find(x=>x.id===r.amendmentOf):null;
      if(r.amendmentOf&&(!parent||parent.status!=='APPROVED'||parent.version!==r.parentVersion))fail('CONCURRENCY_CONFLICT','The original approval changed. Refresh and resubmit the amendment.');
      if(parent?.intervals.some(i=>Date.parse(i.start)<=now.getTime()))fail('SHIFT_STARTED','The original approved shift has started and cannot be amended.');
      if(e.platformCode!==r.platformCode||e.dept!==r.dept||r.intervals.some(i=>scheduledWindow(state,e,i.date).shift!==i.shift))fail('ASSIGNMENT_CHANGED','The employee assignment changed. Cancel and resubmit against the new schedule.');
      checkRequest(state,e,r,{approval:true,now});
      if(state.replacements.some(x=>x.absentEmployeeId===e.id&&r.dates.includes(x.date)&&x.status!=='CANCELLED'&&x.rosterRequestId!==parent?.id))fail('COVERAGE_CONFLICT','Resolve existing absence/replacement records before approving this request.');
      if(parent){cancelCoverage(state,parent,auth,now);parent.status='SUPERSEDED';parent.version++;parent.supersededBy=r.id;parent.history.push({at:now.toISOString(),actor:auth.user.name,action:'SUPERSEDED',reason:`Replaced by approved amendment ${r.id}`});audit(state,auth,'LEAVE_AMENDED',parent.id,input.reason,'APPROVED','SUPERSEDED',e,now);}
    }
    Object.assign(r,{status:input.decision,version:r.version+1,decisionReason:input.reason,decidedAt:now.toISOString(),decidedBy:auth.user.name});r.history.push({at:now.toISOString(),actor:auth.user.name,action:r.status,reason:input.reason});audit(state,auth,'LEAVE_DECIDED',id,input.reason,'PENDING',r.status,e,now);notify(state,e,`Leave ${r.status.toLowerCase()}`,`${r.dates[0]} · ${input.reason}`,now);return r;
  }
  if(method==='cancelLeaveRequest'){
    const [id,version]=z.tuple([z.string(),z.number().int().positive()]).parse(args),r=store.requests.find(r=>r.id===id);if(!r)fail('NOT_FOUND','Request not found.',404);owner(auth,r.employeeId);if(r.status==='CANCELLED')return r;
    if(r.version!==version)fail('CONCURRENCY_CONFLICT','This request changed. Refresh before cancelling.');if(!active(r))fail('INVALID_STATE','Only pending or approved requests can be cancelled.');
    if(r.intervals.some(i=>Date.parse(i.start)<=now.getTime()))fail('SHIFT_STARTED','Started leave must be reconciled by a supervisor through attendance.');
    cancelCoverage(state,r,auth,now);for(const child of store.requests.filter(x=>x.amendmentOf===r.id&&x.status==='PENDING')){child.status='CANCELLED';child.version++;child.history.push({at:now.toISOString(),actor:auth.user.name,action:'CANCELLED',reason:'Original request cancelled'});}const prev=r.status;r.status='CANCELLED';r.version++;r.history.push({at:now.toISOString(),actor:auth.user.name,action:'CANCELLED',reason:'Request cancelled'});audit(state,auth,'LEAVE_CANCELLED',id,'Request cancelled',prev,r.status,r,now);notify(state,{id:r.employeeId},'Leave cancelled',r.dates[0],now);notify(state,r,'Leave cancelled',`${r.employeeName} · ${r.dates[0]}`,now,['SUPERVISOR']);return r;
  }
  if(method==='setLeaveEntitlement'){
    supervisor(auth);const [input]=z.tuple([z.object({employeeId:z.string(),year:z.number().int().min(2000).max(2100),annual:z.number().int().min(0).max(366),medical:z.number().int().min(0).max(366),reason:note,expectedVersion:z.number().int().min(0)}).strict()]).parse(args),e=employeeFor(state,input.employeeId),prev=store.entitlements.find(x=>x.employeeId===e.id&&x.year===input.year);
    if((prev?.version??0)!==input.expectedVersion)fail('CONCURRENCY_CONFLICT','Entitlements changed. Refresh before saving.');
    for(const [field,kind] of [['annual','ANNUAL_LEAVE'],['medical','MEDICAL_LEAVE']])if(input[field]<annualUsage(state,e.id,input.year,kind)+annualUsage(state,e.id,input.year,kind,undefined,'PENDING'))fail('INSUFFICIENT_BALANCE','Entitlement cannot be lower than approved and reserved days.');
    const before=JSON.stringify(prev??{}),record={employeeId:e.id,year:input.year,annual:input.annual,medical:input.medical,version:(prev?.version??0)+1,updatedAt:now.toISOString()};
    if(prev)Object.assign(prev,record);else store.entitlements.push(record);audit(state,auth,'LEAVE_ENTITLEMENT_SET',`${e.id}:${input.year}`,input.reason,before,JSON.stringify(record),e,now);return record;
  }
  if(method==='createRosterReplacement'){
    supervisor(auth);const [id,date]=z.tuple([z.string(),daySchema]).parse(args),r=store.requests.find(r=>r.id===id);
    if(!r||r.status!=='APPROVED'||!r.dates.includes(date))fail('INVALID_STATE','Select an approved leave date.');
    const existing=state.replacements.find(x=>x.absentEmployeeId===r.employeeId&&x.date===date&&x.status!=='CANCELLED');if(existing)return existing;
    const e=employeeFor(state,r.employeeId),i=r.intervals.find(i=>i.date===date);if(Date.parse(i.absentStart)<=now.getTime())fail('SHIFT_STARTED','Replacement coverage must be arranged before the absence starts.');
    const rep={id:`REP-${randomUUID()}`,rosterRequestId:r.id,type:Date.parse(i.absentStart)-now.getTime()>=7*86400000?'PLANNED':'EMERGENCY',status:'PENDING',absentEmployeeId:e.id,absentEmployeeName:e.name,platformCode:r.platformCode,categoryCode:e.categoryCode,dept:r.dept,shift:i.shift,date,shiftStart:i.absentStart,shiftEnd:i.absentEnd,reason:`${r.kind.replaceAll('_',' ')}: ${r.reason}`,createdAt:now.toISOString(),initiatedAt:now.toISOString(),freelancerId:null,freelancerName:null,freelancerPriority:null,poolId:e.poolId,workstationId:null,candidates:[],failureReasons:[],timeline:[]};
    state.replacements.push(rep);audit(state,auth,'ROSTER_COVERAGE_REQUESTED',rep.id,r.reason,'UNCOVERED','PENDING',e,now);return rep;
  }
  fail('NOT_FOUND','Roster operation not found.',404);
}

// Approved requests reserve entitlement but do not fabricate actual attendance.
export function projectRosterProfile(state,result,id,end) {
  if(!result||result.role!=='EMPLOYEE')return result;
  const e=employeeFor(state,id);result.halfDays=halfAvailable(state,e,end,undefined,['APPROVED']);result.casualDays=Math.floor(result.halfDays/2);
  result.approvedLeave=moduleState(state).requests.filter(r=>r.employeeId===id&&r.status==='APPROVED'&&r.dates.some(d=>d<=end));
  for(const a of result.allowance??[])if(result.approvedLeave.some(r=>['CASUAL_LEAVE','INFORMED_ABSENCE'].includes(r.kind)&&r.dates.some(d=>d.startsWith(a.month))))a.eligible=false;
  return result;
}

