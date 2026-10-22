import { businessDate, rosterProjection } from './roster.js';
import { addDays } from './attendance-schedule.js';

export function workforceDashboard(state,records,attendanceReady,now,current) {
  const today=businessDate(now),from=addDays(today,-29),nextDays=Array.from({length:7},(_,i)=>addDays(today,i+1));
  const activePlatforms=new Set(state.platforms.filter(p=>p.status==='ACTIVE'&&p.lifecycle!=='SETUP').map(p=>p.code));
  const employees=new Map(state.employees.map(e=>[e.id,e]));
  const projections=new Map();
  const roster=date=>{
    const month=date.slice(0,7);
    if(!projections.has(month))projections.set(month,rosterProjection(state,{user:{role:'SUPERVISOR'}},{month},now).rows);
    return projections.get(month);
  };
  const eligible=e=>e&&activePlatforms.has(e.platformCode)&&['ACTIVE','ON_LEAVE'].includes(e.status)&&e.accountStatus==='ACTIVE'&&e.qualifiedForProduction!==false
    && !['IN_PLATFORM_TRAINING','TRAINING_COMPLETED','TRAINING_EXTENDED','TRAINING_FAILED','PLATFORM_PLACEMENT_REQUIRED','RELEASED'].includes(e.lifecycle)
    && !state.trainingAssignments.some(t=>t.workerId===e.id&&!t.promotedAt&&t.trainingStatus!=='TRAINING_FAILED');
  const attendance=Object.fromEntries(['MORNING','NIGHT'].map(shift=>{
    const assigned=new Set(roster(current.date).filter(r=>eligible(employees.get(r.employeeId))&&r.cells.some(c=>c.date===current.date&&c.scheduled!==false&&c.shift===shift)).map(r=>r.employeeId));
    const confirmed=new Set(records.filter(r=>r.shift===shift&&r.status==='CONFIRMED'&&r.worker_type==='EMPLOYEE'&&assigned.has(r.operational_worker_id)).map(r=>r.operational_worker_id));
    return [shift,{assigned:assigned.size,confirmed:attendanceReady?confirmed.size:null}];
  }));
  const absenceDates=new Map();
  const recordAbsence=(id,date)=>{
    if(!employees.has(id)||date<from||date>today)return;
    if(!absenceDates.has(id))absenceDates.set(id,new Set());
    absenceDates.get(id).add(date);
  };
  for(const e of state.profile?.events??[])if(['INFORMED_ABSENCE','UNINFORMED_ABSENCE'].includes(e.kind))recordAbsence(e.workerId,e.date);
  for(const r of state.roster?.requests??[])if(r.kind==='INFORMED_ABSENCE'&&r.status==='APPROVED')for(const date of r.dates)recordAbsence(r.employeeId,date);
  const absences=[...absenceDates].map(([id,dates])=>({employeeId:id,name:employees.get(id).name,platformCode:employees.get(id).platformCode??'',dept:employees.get(id).dept,frequency:dates.size,dates:[...dates].sort()})).sort((a,b)=>b.frequency-a.frequency||a.name.localeCompare(b.name));
  const offDays=roster(today).flatMap(r=>{
    const c=r.cells.find(c=>c.date===today&&c.scheduled!==false&&(c.kind==='OFF_DAY'||c.state==='OFF'));
    return c?[{employeeId:r.employeeId,name:r.name,platformCode:r.platformCode,dept:r.dept,shift:c.shift}]:[];
  }).sort((a,b)=>a.name.localeCompare(b.name));
  const needs=new Map();
  const key=(id,date,shift)=>`${id}/${date}/${shift}`;
  for(const r of state.replacements)if(nextDays.includes(r.date)&&activePlatforms.has(r.platformCode)&&!['CANCELLED'].includes(r.status)&&!(r.freelancerId&&['ASSIGNED','CONFIRMED'].includes(r.status))){
    const hours=(Date.parse(r.shiftEnd)-Date.parse(r.shiftStart))/3600000;
    needs.set(key(r.absentEmployeeId,r.date,r.shift),{platformCode:r.platformCode,dept:r.dept,date:r.date,shift:r.shift,hours:Number.isFinite(hours)&&hours>0?hours:12});
  }
  for(const date of nextDays)for(const r of roster(date)){
    if(!activePlatforms.has(r.platformCode))continue;
    const c=r.cells.find(c=>c.date===date&&c.scheduled!==false);
    if(c?.uncoveredHours>0)needs.set(key(r.employeeId,date,c.shift),{platformCode:r.platformCode,dept:r.dept,date,shift:c.shift,hours:c.uncoveredHours});
  }
  const replacements=new Map();
  for(const need of needs.values()){
    if(!replacements.has(need.platformCode))replacements.set(need.platformCode,{platformCode:need.platformCode,slots:0,hours:0,dates:new Set(),departments:new Set()});
    const p=replacements.get(need.platformCode);p.slots++;p.hours+=need.hours;p.dates.add(need.date);p.departments.add(need.dept);
  }
  return {today,from,to:today,attendance,
    absences,absenceTrend:Array.from({length:30},(_,i)=>{const date=addDays(from,i);return {date,count:absences.filter(e=>e.dates.includes(date)).length};}),
    absenceHistogram:[1,2,3,4,5].map(n=>({label:n===5?'5+':String(n),count:absences.filter(e=>n===5?e.frequency>=5:e.frequency===n).length})),
    offDays,nextWeek:{from:nextDays[0],to:nextDays.at(-1),platforms:[...replacements.values()].map(p=>({...p,dates:[...p.dates].sort(),departments:[...p.departments].sort()})).sort((a,b)=>b.slots-a.slots||a.platformCode.localeCompare(b.platformCode)),
      trend:nextDays.map(date=>({date,count:[...needs.values()].filter(n=>n.date===date).length}))}};
}
