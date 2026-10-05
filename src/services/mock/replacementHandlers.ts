import { addDays, format, parseISO } from 'date-fns';
import { SERVER_NOW, TODAY } from '../../utils/clock';
import type { DeptCode, Employee, PoolSummary, Replacement, ReplacementStatus, ShiftCode } from '../../types/domain';
import { ApiError, currentAuth, requireRole, respond } from './core';
import { assignFreelancerToRep, db, poolIdOf, pushAudit, shiftWindow, wsIdOf } from './db';
import { PLANNED_LEAD_DAYS, buildTimeline, evaluateCandidates, summarizeFailures } from './rules';
import { poolSummary, textMatch, toEmployee } from './selectors';

const nowIso = () => format(SERVER_NOW, "yyyy-MM-dd'T'HH:mm:ss");

export interface ReplacementQuery {
  status?: ReplacementStatus | '';
  type?: 'PLANNED' | 'EMERGENCY' | '';
  category?: string;
  platform?: string;
  dept?: DeptCode | '';
  shift?: ShiftCode | '';
  date?: string;
  employee?: string;
  freelancer?: string;
  scope?: 'open' | 'all';
}

function notifyAssignment(rep: Replacement) {
  if (!rep.freelancerId) return;
  const when = format(parseISO(rep.shiftStart), 'MMM d HH:mm');
  db.notifications.unshift({ id: db.seq.ntf(), type: rep.type === 'EMERGENCY' ? 'EMERGENCY_REPLACEMENT' : 'REPLACEMENT_ASSIGNED', title: `${rep.type === 'EMERGENCY' ? 'Emergency' : 'Planned'} assignment · ${rep.platformCode} / ${rep.dept}`, body: `Replacing ${rep.absentEmployeeId} on the ${rep.shift.toLowerCase()} shift starting ${when}. Workstation ${rep.workstationId}.`, createdAt: nowIso(), read: false, emailStatus: 'SENT', link: '/my/assignments', recipientRoles: ['FREELANCER'], recipientId: rep.freelancerId });
  db.notifications.unshift({ id: db.seq.ntf(), type: 'REPLACEMENT_ASSIGNED', title: `${rep.freelancerId} assigned to ${rep.platformCode} / ${rep.dept}`, body: `${rep.id}: covering ${rep.absentEmployeeId} (${rep.shift.toLowerCase()}, ${format(parseISO(rep.date), 'MMM d')}).`, createdAt: nowIso(), read: false, emailStatus: 'SENT', link: `/replacements/${rep.id}`, recipientRoles: ['ADMIN', 'MANAGER'], recipientId: null });
}

function runSearch(rep: Replacement, actor: {userId: string;name: string;role: string;}) {
  assignFreelancerToRep(rep);
  rep.timeline = buildTimeline(rep);
  if (rep.status === 'ASSIGNED') {
    notifyAssignment(rep);
    pushAudit({ at: nowIso(), actorId: actor.userId, actorName: actor.name, role: actor.role as 'MANAGER', action: 'REPLACEMENT_ASSIGNMENT', entity: 'Replacement', entityId: rep.id, platformCode: rep.platformCode, dept: rep.dept, previous: `${rep.absentEmployeeId} absent · unassigned`, next: `${rep.freelancerId} assigned (priority ${rep.freelancerPriority})`, reason: rep.reason, isOverride: false });
  } else {
    db.notifications.unshift({ id: db.seq.ntf(), type: 'EMERGENCY_REPLACEMENT', title: `No eligible replacement · ${rep.platformCode} / ${rep.dept}`, body: `${rep.id} requires manual action for ${rep.shift.toLowerCase()} on ${format(parseISO(rep.date), 'MMM d')}.`, createdAt: nowIso(), read: false, emailStatus: 'SENT', link: `/replacements/${rep.id}`, recipientRoles: ['ADMIN', 'MANAGER'], recipientId: null });
  }
  return rep;
}

export interface ReplacementDetail {
  replacement: Replacement;
  absentEmployee: Employee | null;
  pool: PoolSummary | null;
  excludedOtherDept: number;
}

export const replacementApi = {
  listReplacements: (q: ReplacementQuery) =>
  respond(() => {
    requireRole('ADMIN', 'MANAGER');
    const items = db.replacements.
    filter((r) => q.scope !== 'open' || !['CANCELLED'].includes(r.status)).
    filter((r) => !q.status || r.status === q.status).
    filter((r) => !q.type || r.type === q.type).
    filter((r) => !q.category || r.categoryCode === q.category).
    filter((r) => !q.platform || r.platformCode === q.platform).
    filter((r) => !q.dept || r.dept === q.dept).
    filter((r) => !q.shift || r.shift === q.shift).
    filter((r) => !q.date || r.date === q.date).
    filter((r) => textMatch(q.employee, r.absentEmployeeId, r.absentEmployeeName)).
    filter((r) => textMatch(q.freelancer, r.freelancerId, r.freelancerName)).
    sort((a, b) => {
      const urgency = (x: Replacement) => x.status === 'FAILED' ? 0 : x.status === 'SEARCHING' || x.status === 'PENDING' ? 1 : x.status === 'ASSIGNED' ? 2 : 3;
      return urgency(a) - urgency(b) || a.shiftStart.localeCompare(b.shiftStart);
    });
    const upcoming = db.replacements.filter((r) => r.date >= TODAY && r.status !== 'CANCELLED');
    return {
      items,
      counts: {
        required: upcoming.length,
        planned: upcoming.filter((r) => r.type === 'PLANNED').length,
        emergency: upcoming.filter((r) => r.type === 'EMERGENCY').length,
        unassigned: upcoming.filter((r) => !r.freelancerId).length,
        assigned: upcoming.filter((r) => r.status === 'ASSIGNED' || r.status === 'CONFIRMED').length,
        failed: upcoming.filter((r) => r.status === 'FAILED').length
      }
    };
  }),

  getReplacement: (id: string): Promise<ReplacementDetail> =>
  respond(() => {
    const a = currentAuth();
    const rep = db.replacements.find((r) => r.id === id);
    if (!rep) throw new ApiError('NOT_FOUND', `Replacement ${id} does not exist.`, 404);
    if (a.role === 'FREELANCER' && rep.freelancerId !== a.userId) throw new ApiError('FORBIDDEN', 'This assignment belongs to another freelancer.', 403);
    if (a.role === 'EMPLOYEE' && rep.absentEmployeeId !== a.userId) throw new ApiError('FORBIDDEN', 'You cannot view this replacement.', 403);
    const emp = db.employees.find((e) => e.id === rep.absentEmployeeId);
    const p = db.platforms.find((x) => x.code === rep.platformCode);
    return {
      replacement: rep,
      absentEmployee: emp ? toEmployee(emp) : null,
      pool: p ? poolSummary(p, rep.dept) : null,
      excludedOtherDept: db.freelancers.filter((f) => f.dept !== rep.dept).length
    };
  }),

  previewCandidates: (id: string) =>
  respond(() => {
    requireRole('ADMIN', 'MANAGER');
    const rep = db.replacements.find((r) => r.id === id);
    if (!rep) throw new ApiError('NOT_FOUND', `Replacement ${id} does not exist.`, 404);
    const c = evaluateCandidates(rep, db.freelancers, db.availability, db.replacements);
    return { candidates: c, failureReasons: c.some((x) => x.eligible) ? [] : summarizeFailures(c, db.freelancers.filter((f) => f.dept !== rep.dept).length) };
  }),

  reportAbsence: (input: {employeeId: string;date: string;reason: string;}) =>
  respond(() => {
    const actor = requireRole('ADMIN', 'MANAGER');
    const e = db.employees.find((x) => x.id === input.employeeId);
    if (!e) throw new ApiError('NOT_FOUND', `Employee ${input.employeeId} does not exist.`, 404);
    if (input.date < TODAY) throw new ApiError('PAST_DATE', 'Absences cannot be recorded for past shifts.', 422);
    if (!input.reason || input.reason.trim().length < 3) throw new ApiError('VALIDATION', 'Provide an absence reason.', 422);
    if (db.replacements.some((r) => r.absentEmployeeId === e.id && r.date === input.date && r.status !== 'CANCELLED')) throw new ApiError('DUPLICATE', `${e.id} already has an open replacement for this date.`, 409);
    if (db.offDays.some((o) => o.employeeId === e.id && o.date === input.date && (o.status === 'APPROVED' || o.status === 'OVERRIDE_APPROVED'))) throw new ApiError('OFF_DAY', `${e.id} has an approved off-day on this date — no replacement is required.`, 409);
    const w = shiftWindow(input.date, e.shift);
    const leadMs = parseISO(w.start).getTime() - SERVER_NOW.getTime();
    if (leadMs < 0) throw new ApiError('SHIFT_STARTED', 'This shift has already started. Record it as an incident with the shift manager.', 422);
    const planned = leadMs >= PLANNED_LEAD_DAYS * 24 * 3600e3;
    const initiatedAt = planned ? format(addDays(parseISO(w.start), -PLANNED_LEAD_DAYS), "yyyy-MM-dd'T'HH:mm:ss") : nowIso();
    const rep: Replacement = {
      id: db.seq.rep(), type: planned ? 'PLANNED' : 'EMERGENCY', status: 'PENDING', absentEmployeeId: e.id, absentEmployeeName: e.name,
      platformCode: e.platformCode, categoryCode: e.categoryCode, dept: e.dept, shift: e.shift, date: input.date, shiftStart: w.start, shiftEnd: w.end,
      reason: input.reason, createdAt: nowIso(), initiatedAt, freelancerId: null, freelancerName: null, freelancerPriority: null,
      poolId: poolIdOf(e.platformCode, e.dept), workstationId: null, candidates: [], failureReasons: [], timeline: []
    };
    db.replacements.push(rep);
    pushAudit({ at: nowIso(), actorId: actor.userId, actorName: actor.name, role: actor.role, action: 'ABSENCE_RECORDED', entity: 'Replacement', entityId: rep.id, platformCode: rep.platformCode, dept: rep.dept, previous: `${e.id} scheduled`, next: `${e.id} absent (${rep.type.toLowerCase()})`, reason: input.reason, isOverride: false });
    if (!planned || initiatedAt <= nowIso()) runSearch(rep, actor);else
    rep.timeline = buildTimeline(rep);
    return rep;
  }),

  runSearch: (id: string) =>
  respond(() => {
    const actor = requireRole('ADMIN', 'MANAGER');
    const rep = db.replacements.find((r) => r.id === id);
    if (!rep) throw new ApiError('NOT_FOUND', `Replacement ${id} does not exist.`, 404);
    if (!['PENDING', 'SEARCHING', 'FAILED'].includes(rep.status)) throw new ApiError('INVALID_STATE', `Search cannot run while the replacement is ${rep.status}.`, 409);
    return runSearch(rep, actor);
  }),

  assignFreelancer: (id: string, freelancerId: string) =>
  respond(() => {
    const actor = requireRole('ADMIN', 'MANAGER');
    const rep = db.replacements.find((r) => r.id === id);
    if (!rep) throw new ApiError('NOT_FOUND', `Replacement ${id} does not exist.`, 404);
    if (['CANCELLED', 'CONFIRMED'].includes(rep.status)) throw new ApiError('INVALID_STATE', `Replacement is already ${rep.status}.`, 409);
    const cands = evaluateCandidates(rep, db.freelancers, db.availability, db.replacements);
    const c = cands.find((x) => x.freelancerId === freelancerId);
    if (!c) throw new ApiError('DEPARTMENT_MISMATCH', `Freelancer must belong to the ${rep.dept} department.`, 422);
    if (!c.eligible) {
      const failed = c.checks.filter((k) => !k.passed).map((k) => k.label).join('; ');
      throw new ApiError('NOT_ELIGIBLE', `${freelancerId} is not eligible: ${failed}.`, 422);
    }
    if (rep.freelancerId && rep.freelancerId !== freelancerId) db.availability[rep.freelancerId][rep.date][rep.shift] = 'AVAILABLE';
    const emp = db.employees.find((e) => e.id === rep.absentEmployeeId)!;
    rep.freelancerId = freelancerId;
    rep.freelancerName = c.name;
    rep.freelancerPriority = c.priority;
    rep.status = 'ASSIGNED';
    rep.workstationId = wsIdOf(rep.platformCode, rep.dept, emp.slot);
    rep.failureReasons = [];
    rep.candidates = cands.map((x) => ({ ...x, selected: x.freelancerId === freelancerId }));
    db.availability[freelancerId][rep.date][rep.shift] = 'ASSIGNED';
    rep.timeline = buildTimeline(rep);
    notifyAssignment(rep);
    pushAudit({ at: nowIso(), actorId: actor.userId, actorName: actor.name, role: actor.role, action: 'REPLACEMENT_ASSIGNMENT', entity: 'Replacement', entityId: rep.id, platformCode: rep.platformCode, dept: rep.dept, previous: 'Unassigned', next: `${freelancerId} manually assigned (priority ${c.priority})`, reason: 'Manual assignment by manager', isOverride: c.priority !== Math.min(...cands.filter((x) => x.eligible).map((x) => x.priority)) });
    return rep;
  }),

  confirmReplacement: (id: string) =>
  respond(() => {
    const a = requireRole('ADMIN', 'MANAGER', 'FREELANCER');
    const rep = db.replacements.find((r) => r.id === id);
    if (!rep) throw new ApiError('NOT_FOUND', `Replacement ${id} does not exist.`, 404);
    if (a.role === 'FREELANCER' && rep.freelancerId !== a.userId) throw new ApiError('FORBIDDEN', 'This assignment belongs to another freelancer.', 403);
    if (rep.status !== 'ASSIGNED') throw new ApiError('INVALID_STATE', 'Only assigned replacements can be confirmed.', 409);
    rep.status = 'CONFIRMED';
    rep.timeline = buildTimeline(rep);
    return rep;
  }),

  cancelReplacement: (id: string, reason: string) =>
  respond(() => {
    const actor = requireRole('ADMIN', 'MANAGER');
    const rep = db.replacements.find((r) => r.id === id);
    if (!rep) throw new ApiError('NOT_FOUND', `Replacement ${id} does not exist.`, 404);
    if (rep.status === 'CANCELLED') throw new ApiError('INVALID_STATE', 'Replacement is already cancelled.', 409);
    if (!reason || reason.trim().length < 5) throw new ApiError('VALIDATION', 'Provide a cancellation reason (min 5 characters).', 422);
    if (rep.freelancerId) db.availability[rep.freelancerId][rep.date][rep.shift] = 'AVAILABLE';
    const prev = rep.status;
    rep.status = 'CANCELLED';
    rep.cancelReason = reason;
    rep.timeline = buildTimeline(rep);
    pushAudit({ at: nowIso(), actorId: actor.userId, actorName: actor.name, role: actor.role, action: 'REPLACEMENT_CANCELLED', entity: 'Replacement', entityId: rep.id, platformCode: rep.platformCode, dept: rep.dept, previous: prev, next: 'CANCELLED', reason, isOverride: false });
    return rep;
  }),

  listMyAssignments: () =>
  respond(() => {
    const a = requireRole('FREELANCER');
    return db.replacements.filter((r) => r.freelancerId === a.userId).sort((x, y) => x.shiftStart.localeCompare(y.shiftStart));
  })
};