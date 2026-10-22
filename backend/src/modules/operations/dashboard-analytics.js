import { attendanceSchedules } from './attendance-schedule.js';
import { shiftContext } from './equipment.js';
import { workforceDashboard } from './workforce-dashboard.js';

export async function dashboardAnalytics(client,state,now=new Date()) {
  const current=shiftContext(now);
  const platforms=state.platforms.filter(p=>p.status==='ACTIVE'&&p.lifecycle!=='SETUP');
  const schedules=attendanceSchedules(state,[current.date],now);
  const ready=(await client.query("SELECT to_regclass('attendance_confirmations') AS name")).rows[0].name;
  const records=ready?(await client.query(`SELECT o.shift,o.worker_type,o.operational_worker_id,c.status,c.asset_id,s.released_at,s.id AS custody_id
    FROM attendance_confirmations c JOIN work_occurrences o ON o.id=c.occurrence_id
    LEFT JOIN equipment_custody_sessions s ON s.confirmation_id=c.id WHERE o.roster_date=$1`,[current.date])).rows:[];
  const capacity=platforms.reduce((sum,p)=>sum+Object.values(p.departments).reduce((n,v)=>n+v,0),0);
  const shifts=Object.fromEntries(['MORNING','NIGHT'].map(shift=>{
    const scheduled=new Set(schedules.filter(w=>w.shift===shift).map(w=>w.workerId)).size;
    const target=platforms.reduce((n,p)=>n+Object.entries(p.departments).reduce((sum,[dept,seats])=>sum+(p.staffingTargets?.[dept]?.[shift]??seats),0),0);
    const rows=records.filter(r=>r.shift===shift);
    const held=rows.filter(r=>r.custody_id&&!r.released_at).length;
    return [shift,{scheduled,target,confirmed:ready?rows.filter(r=>r.status==='CONFIRMED').length:null,
      needsReview:ready?rows.filter(r=>r.status==='NEEDS_REVIEW').length:null,
      devicesHeld:ready?held:null,capacity,vacancies:Math.max(0,target-scheduled)}];
  }));
  return {date:current.date,currentShift:current.shift,serverNow:now.toISOString(),shifts,workforce:workforceDashboard(state,records,!!ready,now,current)};
}
