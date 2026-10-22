import { createHash } from 'node:crypto';
import { businessDate, rosterProjection } from './roster.js';

export const addDays = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export const asInstant = value => new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}+05:30`).toISOString();
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function productionEligible(state, worker) {
  return !!worker && ['ACTIVE', 'ON_LEAVE'].includes(worker.status) && worker.accountStatus === 'ACTIVE'
    && worker.qualifiedForProduction !== false && !worker.id.startsWith('CND-')
    && !['IN_PLATFORM_TRAINING','TRAINING_COMPLETED','TRAINING_EXTENDED','TRAINING_FAILED','PLATFORM_PLACEMENT_REQUIRED','RELEASED'].includes(worker.lifecycle)
    && !state.trainingAssignments.some(t => t.workerId === worker.id && !t.promotedAt && t.trainingStatus !== 'TRAINING_FAILED');
}

function schedule(worker, type, date, shift, platform, start, end, sourceKey) {
  const scheduledStart = `${date}T${shift === 'MORNING' ? '07:30' : '19:30'}:00+05:30`;
  const scheduledEnd = new Date(Date.parse(scheduledStart) + 12 * 3600000).toISOString();
  const result = {workerId:worker.id, workerName:worker.name, workerType:type, platformCode:platform,
    department:worker.dept, rosterDate:date, shift, scheduledStart:asInstant(scheduledStart), scheduledEnd,
    effectiveStart:asInstant(start), effectiveEnd:asInstant(end), sourceKey};
  result.sourceVersion = fingerprint(result);
  return result;
}

// The same roster projection used by supervisors resolves approved leave, rotations,
// off-days and partial shifts. A pending request never removes scheduled work.
export function attendanceSchedules(state, dates, now = new Date()) {
  const results = [];
  const wanted = new Set(dates);
  for (const month of new Set(dates.map(d => d.slice(0,7)))) {
    const roster = rosterProjection(state, {user:{role:'SUPERVISOR'}}, {month}, now);
    for (const row of roster.rows) {
      const worker = state.employees.find(w => w.id === row.employeeId);
      if (!productionEligible(state, worker)) continue;
      for (const day of row.cells.filter(d => wanted.has(d.date) && d.scheduled !== false && d.workingHours > 0)) {
        let start = day.shiftStart, end = day.shiftEnd;
        if (day.absenceStart && day.absenceEnd) {
          if (Date.parse(day.absenceStart) === Date.parse(start)) start = day.absenceEnd;
          else end = day.absenceStart;
        }
        results.push(schedule(worker,'EMPLOYEE',day.date,day.shift,row.platformCode,start,end,`employee:${worker.id}`));
      }
    }
  }
  for (const worker of state.freelancers.filter(w => productionEligible(state,w))) {
    for (const date of dates) {
      const replacements = state.replacements.filter(r => r.freelancerId === worker.id && r.date === date && ['ASSIGNED','CONFIRMED'].includes(r.status));
      for (const replacement of replacements) {
        if (replacement.dept !== worker.dept) continue;
        results.push(schedule(worker,'FREELANCER',date,replacement.shift,replacement.platformCode,replacement.shiftStart,replacement.shiftEnd,`replacement:${replacement.id}`));
      }
      const production = state.trainingAssignments.filter(t => t.workerId === worker.id && t.promotedAt
        && (t.productionPlatformCode ?? t.platformCode) === worker.currentPlatform
        && businessDate(new Date(t.promotedAt)) <= date).sort((a,b) => b.promotedAt.localeCompare(a.promotedAt))[0];
      const shift = production?.productionShift ?? worker.shift;
      if (!worker.currentPlatform || !['MORNING','NIGHT'].includes(shift) || date < (worker.joinedAt ?? '').slice(0,10)) continue;
      // A dated replacement is authoritative for this shift. Availability alone
      // never creates a scheduled work occurrence.
      if (replacements.some(r => r.shift === shift)) continue;
      const start = `${date}T${shift === 'MORNING' ? '07:30' : '19:30'}:00+05:30`;
      results.push(schedule(worker,'FREELANCER',date,shift,worker.currentPlatform,start,
        new Date(Date.parse(start)+12*3600000).toISOString(),`production:${production?.id ?? worker.id}`));
    }
  }
  return results.filter(s => state.platforms.some(p => p.code === s.platformCode && p.status === 'ACTIVE'
    && p.lifecycle !== 'SETUP' && p.departments[s.department] > 0));
}
