import { z } from 'zod';
import { ApiError } from '../../shared/errors.js';
import { workforceVacancies } from './workforce-vacancies.js';
import { recordSelect, attendanceRecord, requireAttendanceSchema } from './attendance-store.js';
import { shiftAttendanceOperation } from './attendance-confirmations.js';
import { offDayBalance } from './employee-platform.js';

export const databaseReports = new Set(['platform-vacancies','employee-directory','employee-detail','attendance-confirmations','break-summary','break-history','break-exceeded','platform-categories','platform-configuration','platform-operations','equipment-inventory','replacement-summary']);
const date = z.union([z.literal(''),z.iso.date()]).optional();
const text = z.string().max(200).optional();
const schema = z.object({category:text,platform:text,dept:text,department:text,shift:text,from:date,to:date,month:z.union([z.literal(''),z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)]).optional(),employeeId:text,workerId:text,search:text,status:text,workerType:text,
  attendance:z.object({date:z.iso.date(),shift:z.string(),status:z.string()}).optional(),
  overrun:text,review:text,assignment:z.enum(['historical','current']).optional(),unreviewed:z.boolean().optional(),type:text,freelancer:text,eventDate:date,approval:text,pending:z.boolean().optional()});

export async function databaseReport(client,auth,state,key,input={}) {
  if(auth.user.role!=='SUPERVISOR')throw new ApiError(403,'FORBIDDEN','Supervisor access is required.');
  const parsed=schema.safeParse(input);
  if(!parsed.success)throw new ApiError(422,'VALIDATION','Invalid report filters.');
  const f=parsed.data;
  if(f.from&&f.to&&f.from>f.to)throw new ApiError(422,'VALIDATION','From date must be on or before the end date.');
  const range=d=>(!f.from||d>=f.from)&&(!f.to||d<=f.to)&&(!f.month||d.startsWith(f.month));
  const scope=(p,d,s)=>(!f.platform||p===f.platform)&&(!f.category||state.platforms.find(x=>x.code===p)?.categoryCode===f.category)&&(!(f.dept||f.department)||d===(f.dept||f.department))&&(!f.shift||s===f.shift);
  const matches=(...v)=>!f.search||v.join(' ').toLowerCase().includes(f.search.toLowerCase());
  const table=(columns,rows,summary=[],sections=[])=>({columns,rows:rows.map(r=>r.map(v=>v==null?'':typeof v==='object'?JSON.stringify(v):v)),summary,sections,generatedAt:new Date().toISOString(),filters:f});
  const metric=(label,value)=>({label,value});
  if(key==='platform-vacancies'||key==='platform-configuration'||key==='platform-operations') {
    const vacancies=workforceVacancies(auth,state);
    const rows=state.platforms.filter(p=>(!f.category||p.categoryCode===f.category)&&(!f.platform||p.code===f.platform)&&matches(p.code,p.name,p.categoryCode)).flatMap(p=>Object.entries(p.departments).flatMap(([dept,capacity])=>['MORNING','NIGHT'].filter(shift=>scope(p.code,dept,shift)).map(shift=>{
      const v=vacancies.find(v=>v.code===p.code)?.departments.find(d=>d.dept===dept)?.shifts[shift];
      const held=state.laptops.filter(l=>l.platformCode===p.code&&l.dept===dept&&l.currentUserId).length;
      return [p.code,p.name??p.code,p.categoryCode,dept,shift,capacity,p.staffingTargets?.[dept]?.[shift]??capacity,v?.production??0,v?.training??0,v?.available??0,p.lifecycle??'OPERATIONAL',p.status,held,state.incidents.filter(i=>i.platformCode===p.code&&i.dept===dept&&i.status!=='RESOLVED').length];
    }))).filter(r=>key!=='platform-vacancies'||r[9]>0);
    return table(['Platform','Name','Category','Department','Shift','Seat capacity','Staffing target','Production staff','Trainees','Vacancies','Lifecycle','Status','Devices held now','Open incidents'],rows,[metric('Shift / department rows',rows.length),metric('Vacant shift seats',rows.reduce((n,r)=>n+r[9],0))]);
  }
  if(key==='platform-categories')return table(['Code','Name','Description','Status','Platforms','Configured seats'],state.categories.filter(c=>(!f.category||c.code===f.category)&&(!f.status||c.status===f.status)&&matches(c.code,c.name,c.description)).map(c=>{
    const ps=state.platforms.filter(p=>p.categoryCode===c.code&&(!f.platform||p.code===f.platform));
    return [c.code,c.name,c.description,c.status,ps.length,ps.reduce((n,p)=>n+Object.entries(p.departments).filter(([d])=>!f.dept||f.dept===d).reduce((n,[,v])=>n+v,0),0)];
  }));
  if(key==='employee-directory'||key==='employee-detail') {
    let people=state.employees.filter(e=>scope(e.platformCode,e.dept,e.shift)&&(!f.employeeId||e.id===f.employeeId)&&(!f.workerId||e.id===f.workerId)&&(!f.status||(f.status==='LOCKED'||f.status==='INVITED'?e.accountStatus===f.status:e.status===f.status))&&matches(e.id,e.name,e.email));
    if(key==='employee-detail'&&!f.employeeId)throw new ApiError(422,'VALIDATION','Select an employee to download an individual report.');
    let attendance={};
    if(f.attendance){for(let start=0;start<people.length;start+=1000)Object.assign(attendance,await shiftAttendanceOperation(client,auth,state,'getDirectoryAttendance',[{date:f.attendance.date,shift:f.attendance.shift,workerIds:people.slice(start,start+1000).map(e=>e.id)}]));people=people.filter(e=>!f.attendance.status||attendance[e.id]?.status===f.attendance.status);}
    const columns=['Staff number','Name','Email','Phone','Department','Category','Platform','Position','Career level','Shift','Next shift','Employment status','Account status','Joined','Lifecycle','Production qualified','Device held','Pool','Off days used','Off days allowance','Candidate reference','Attendance'];
    const rows=people.map(e=>{const balance=offDayBalance(state,e);return [e.id,e.name,e.email,e.phone,e.dept,e.categoryCode,e.platformCode,e.position,e.careerLevel,e.shift,e.nextShift,e.status,e.accountStatus,e.joinedAt,e.lifecycle,e.qualifiedForProduction===false?'No':'Yes',state.laptops.find(l=>l.currentUserId===e.id)?.assetId??'',e.poolId,balance.used,balance.allowance??e.offDaysAllowance,e.candidateReference,attendance[e.id]?.status??''];});
    if(key==='employee-directory')return table(columns,rows,[metric('Employees',rows.length)]);
    if(!people.length)throw new ApiError(404,'NOT_FOUND','Employee not found within the selected scope.');
    const e=people[0];
    const history=(title,records)=>({title,columns:['Record','Details'],rows:records.map((r,i)=>[String(i+1),JSON.stringify(r)])});
    return table(['Field','Details'],columns.map((c,i)=>[c,rows[0][i]]),[metric('Employee',e.name),metric('Staff number',e.id)],[history('Career history',e.careerHistory??[]),history('Platform history',e.platformHistory??[])]);
  }
  if(key==='attendance-confirmations') {
    await requireAttendanceSchema(client);
    const rows=(await client.query(`${recordSelect} WHERE ($1::date IS NULL OR o.roster_date >= $1::date) AND ($2::date IS NULL OR o.roster_date <= $2::date) ORDER BY o.roster_date,o.operational_worker_id,c.id`,[f.from||null,f.to||null])).rows.map(attendanceRecord).filter(r=>range(r.rosterDate)&&scope(r.platformCode,r.department,r.shift)&&(!f.status||r.status===f.status)&&(!f.workerType||r.workerType===f.workerType)&&(!f.workerId||r.workerId===f.workerId||r.staffNumber===f.workerId)&&matches(r.workerName,r.staffNumber));
    return table(['Staff number','Worker','Type','Roster date','Shift','Platform','Department','Status','Punctuality','Verification','Device timestamp (UTC)','Server received (UTC)','Effective start (UTC)','Effective end (UTC)','Asset','Received (UTC)','Returned (UTC)','Notes','Equipment issue','Exception reason'],rows.map(r=>[r.staffNumber,r.workerName,r.workerType,r.rosterDate,r.shift,r.platformCode,r.department,r.status,r.punctuality,r.verification,r.deviceTimestamp,r.acceptedAt,r.effectiveStart,r.effectiveEnd,r.assetId,r.custody?.receivedAt,r.custody?.releasedAt,r.notes,r.equipmentIssue,r.exceptionReason]),[metric('Submissions',rows.length),metric('Confirmed',rows.filter(r=>r.status==='CONFIRMED').length),metric('Needs review',rows.filter(r=>r.status==='NEEDS_REVIEW').length)]);
  }
  if(key.startsWith('break-')) {
    if(!auth.permissions.includes('reports.export'))throw new ApiError(403,'FORBIDDEN','Report export permission is required for break reports.');
    const sessions=(state.breaks?.sessions??[]).filter(s=>range(s.shiftDate)&&(!f.eventDate||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Colombo'}).format(new Date(s.startedAt))===f.eventDate)&&scope(f.assignment==='current'?s.currentPlatform:s.platform,f.assignment==='current'?s.currentDepartment:s.department,s.shift)&&(!f.employeeId||s.workerId===f.employeeId)&&(!f.status||s.status===f.status)&&matches(s.workerId,s.workerName)&&(!f.review||s.review?.outcome===f.review)&&(!f.unreviewed||!s.review)&&(!f.approval||(state.breaks.requests??[]).some(r=>r.workerId===s.workerId&&r.status===f.approval))&&(!f.pending||(state.breaks.requests??[]).some(r=>r.workerId===s.workerId&&r.status==='Pending')));
    const elapsed=s=>Math.max(0,Math.floor((Math.min(Date.parse(s.endedAt??new Date().toISOString()),Date.parse(s.shiftEnd))-Date.parse(s.startedAt))/1000));
    // Evaluate the whole shift before applying session filters; splitting a break cannot reset the allowance.
    const groups=new Map();
    for(const s of state.breaks?.sessions??[]){const id=`${s.workerId}|${s.shiftDate}|${s.shift}`;const g=groups.get(id)??{seconds:0,session:s};g.seconds+=elapsed(s);groups.set(id,g);}
    const exceeded=g=>{
      const s=g.session;
      const policy=[...(state.breaks?.policies??[])].filter(p=>Date.parse(p.effectiveAt)<=Date.parse(s.shiftStart)).sort((a,b)=>Date.parse(b.effectiveAt)-Date.parse(a.effectiveAt))[0];
      const extra=(state.breaks?.requests??[]).filter(r=>r.workerId===s.workerId&&r.shiftDate===s.shiftDate&&r.context.shift===s.shift&&r.status==='Approved').reduce((n,r)=>n+(r.approvedMinutes??0),0);
      const allowance=(policy?.allowanceMinutes??60)+extra;
      return {allowance,excess:Math.max(0,g.seconds-allowance*60)};
    };
    const filtered=sessions.filter(s=>{const over=exceeded(groups.get(`${s.workerId}|${s.shiftDate}|${s.shift}`)).excess>0;return (!f.overrun||(['true','yes'].includes(f.overrun)?over:!over))&&(!f.unreviewed||over)&&(key!=='break-exceeded'||over);});
    if(key==='break-history')return table(['Staff number','Employee','Type','Roster date','Shift','Platform','Department','Started (UTC)','Ended (UTC)','Minutes','Status','Shift exceeded','Review'],filtered.map(s=>[s.workerId,s.workerName,s.workerType,s.shiftDate,s.shift,s.platform,s.department,s.startedAt,s.endedAt,(elapsed(s)/60).toFixed(2),s.status,exceeded(groups.get(`${s.workerId}|${s.shiftDate}|${s.shift}`)).excess>0?'Yes':'No',s.review?.outcome??'Unreviewed']),[metric('Break sessions',filtered.length)]);
    const selected=new Set(filtered.map(s=>`${s.workerId}|${s.shiftDate}|${s.shift}`));
    const rows=[...groups].filter(([id])=>selected.has(id)).map(([,g])=>{const s=g.session,v=exceeded(g);return [s.workerId,s.workerName,s.shiftDate,s.shift,s.platform,s.department,(g.seconds/60).toFixed(2),v.allowance,(v.excess/60).toFixed(2),v.excess?'Exceeded':'Within allowance'];});
    return table(['Staff number','Employee','Roster date','Shift','Platform','Department','Total minutes','Allowed minutes (including approved extra)','Exceeded minutes','Result'],rows,[metric('Employee shifts',rows.length),metric('Exceeded shifts',rows.filter(r=>r[9]==='Exceeded').length)]);
  }
  if(key==='replacement-summary') {
    const rows=state.replacements.filter(r=>range(r.date)&&scope(r.platformCode,r.dept,r.shift)&&(!f.status||r.status===f.status)&&(!f.type||r.type===f.type)&&(!f.employeeId||r.absentEmployeeId===f.employeeId)&&matches(r.absentEmployeeId,state.employees.find(e=>e.id===r.absentEmployeeId)?.name)&&(!f.freelancer||`${r.freelancerId??''} ${state.freelancers.find(e=>e.id===r.freelancerId)?.name??''}`.toLowerCase().includes(f.freelancer.toLowerCase())));
    return table(['Reference','Date','Shift','Platform','Department','Absent staff','Absent employee','Replacement staff','Replacement name','Type','Status'],rows.map(r=>[r.id,r.date,r.shift,r.platformCode,r.dept,r.absentEmployeeId,state.employees.find(e=>e.id===r.absentEmployeeId)?.name,r.freelancerId,state.freelancers.find(e=>e.id===r.freelancerId)?.name,r.type,r.status]),[metric('Replacements',rows.length),metric('Assigned',rows.filter(r=>r.freelancerId&&r.status!=='CANCELLED').length),metric('Cancelled',rows.filter(r=>r.status==='CANCELLED').length)]);
  }
  if(key==='equipment-inventory') {
    const assets=state.laptops.filter(l=>scope(l.platformCode,l.dept)&&(!f.status||l.status===f.status)&&matches(l.assetId,l.serial,l.model,l.workstationId,l.currentUserId,l.currentUserName));
    const counts=new Map();for(const l of assets){const k=`${l.platformCode}|${l.dept}|${l.status}|${l.condition}`;counts.set(k,(counts.get(k)??0)+1);}
    return table(['Asset','Serial','Model','Workstation','Platform','Department','Status','Condition','Current staff','Current employee'],assets.map(l=>[l.assetId,l.serial,l.model,l.workstationId,l.platformCode,l.dept,l.status,l.condition,l.currentUserId,l.currentUserName]),[metric('Devices',assets.length),metric('Held',assets.filter(l=>l.currentUserId).length),metric('Available',assets.filter(l=>l.status==='AVAILABLE'&&!l.currentUserId).length)],[{title:'Inventory summary',columns:['Platform','Department','Status','Condition','Count'],rows:[...counts].map(([k,n])=>[...k.split('|'),n])}]);
  }
  throw new ApiError(404,'NOT_FOUND','Unknown report.');
}
