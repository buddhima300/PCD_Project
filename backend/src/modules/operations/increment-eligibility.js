import { businessDate, scheduledWindow } from './roster.js';
import { addDays, fingerprint } from './attendance-schedule.js';

const approved = r=>['APPROVED','OVERRIDE_APPROVED'].includes(r.status);
export const INCREMENT_POLICY='JOINING_90_V1';

// Evidence is batch-loaded once per request. Maps avoid scanning attendance for
// every employee/date, and a date can never earn credit twice.
export function incrementEvidence(state,records) {
  const people=new Map();
  const entry=id=>{if(!people.has(id))people.set(id,{work:new Map(),leave:new Map(),off:new Set()});return people.get(id);};
  for(const r of records) {
    const p=entry(r.worker_number);
    if(!p.work.has(r.date))p.work.set(r.date,[]);
    p.work.get(r.date).push({status:r.status,end:new Date(r.effective_end).getTime()});
  }
  const newDates=new Set(records.map(r=>`${r.worker_number}|${r.date}|${r.shift}`));
  for(const h of state.handovers??[]) {
    if(!h.receivedAt||(!h.outgoingConfirmedAt&&!h.selfConfirmationReason)||h.equipmentOnly||h.attendanceTracked===false||!h.incomingId)continue;
    if(typeof h.scheduledAt!=='string')continue;
    const start=Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(h.scheduledAt)?h.scheduledAt:`${h.scheduledAt}+05:30`);
    if(!Number.isFinite(start))continue;
    const date=businessDate(new Date(start));
    if(newDates.has(`${h.incomingId}|${date}|${h.incomingShift}`))continue;
    const p=entry(h.incomingId);if(!p.work.has(date))p.work.set(date,[]);
    p.work.get(date).push({status:'CONFIRMED',end:start+12*3600000});
  }
  for(const e of state.profile?.events??[]) {
    const p=entry(e.workerId);
    if(e.kind==='OFF_DAY')p.off.add(e.date);
    else p.leave.set(e.date,e.kind);
  }
  for(const r of state.roster?.requests??[])if(r.status==='APPROVED')for(const date of r.dates)entry(r.employeeId).leave.set(date,r.kind);
  // The existing report-absence workflow creates a replacement record. Roster
  // replacements instead inherit their approved full/partial leave above.
  for(const r of state.replacements??[])if(r.status!=='CANCELLED'&&!r.rosterRequestId)entry(r.absentEmployeeId).leave.set(r.date,'REPORTED_ABSENCE');
  for(const off of state.offDays??[])if(approved(off))entry(off.employeeId).off.add(off.date);
  return people;
}

export function incrementProgress(employee,evidence,baseline,now=new Date(),scheduleState={rotationCycles:[]}) {
  const joined=employee.joinedAt?.slice(0,10),today=businessDate(now),at=now.getTime();
  const validJoin=/^\d{4}-\d{2}-\d{2}$/.test(joined??'')&&Number.isFinite(Date.parse(joined));
  const balanceDate=baseline?.through_date?.slice(0,10);
  const validBaseline=!!baseline&&validJoin&&balanceDate>=joined&&balanceDate<today
    &&Date.parse(`${addDays(balanceDate,1)}T07:30:00+05:30`)<=at
    &&Number(baseline.credited_days)<=Math.floor((Date.parse(balanceDate)-Date.parse(joined))/86400000)+1;
  const totals={opening:validBaseline?Number(baseline.credited_days):0,working:0,offDays:0,halfDays:0,excluded:0,unverified:0};
  let credited=totals.opening,eligibleSince=credited>=90?balanceDate:null;
  const p=evidence.get(employee.id)??{work:new Map(),leave:new Map(),off:new Set()};
  if(validJoin&&joined<=today){
    const start=validBaseline?addDays(balanceDate,1):joined;
    for(let date=start;date<=today;date=addDays(date,1)) {
      const work=p.work.get(date)??[],completed=work.some(w=>w.status==='CONFIRMED'&&w.end<=at);
      const end=['MORNING','NIGHT'].includes(employee.shift)?Date.parse(scheduledWindow(scheduleState,employee,date).end):Date.parse(`${addDays(date,1)}T00:00:00+05:30`);
      if(!completed&&(end>at||work.some(w=>w.end>at)))continue;
      const kind=p.leave.get(date);let credit=0;
      if(kind&& !['HALF_DAY','EIGHT_HOUR'].includes(kind))totals.excluded++;
      else if(kind==='HALF_DAY') {if(completed){credit=.5;totals.halfDays+=.5;}else totals.unverified++;}
      else if(p.off.has(date)){credit=1;totals.offDays++;}
      else if(completed){credit=1;totals.working++;}
      else totals.unverified++;
      credited+=credit;if(!eligibleSince&&credited>=90)eligibleSince=date;
    }
  }
  const active=['ACTIVE','ON_LEAVE'].includes(employee.status)&&employee.accountStatus==='ACTIVE';
  const verificationRequired=!validJoin||!!baseline&&!validBaseline;
  const eligible=active&&!verificationRequired&&credited>=90;
  const result={policy:INCREMENT_POLICY,threshold:90,joinedAt:joined??null,asOf:now.toISOString(),creditedDays:credited,
    remainingDays:Math.max(0,90-credited),percent:Math.min(100,Math.floor(credited/90*100)),eligible,eligibleSince,
    active,verificationRequired,breakdown:totals,
    baseline:baseline?{throughDate:balanceDate,creditedDays:Number(baseline.credited_days),reason:baseline.reason,revision:baseline.revision,valid:validBaseline}:null};
  result.eligibilityVersion=fingerprint({policy:result.policy,joined,credited,active,verificationRequired,breakdown:totals,baselineRevision:baseline?.revision??0});
  return result;
}
