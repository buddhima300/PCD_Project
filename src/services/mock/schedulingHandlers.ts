import { format, getDaysInMonth, parseISO } from 'date-fns';
import { SERVER_NOW, TODAY } from '../../utils/clock';
import type {
  CapacityCell, DailyRosterRow, DeptCode, OffDayCalendar, OffDayRequest, OffDayRequestResult, Paged, PlatformRoster, RosterCell, RosterRow,
  RosterState, ShiftCode } from
'../../types/domain';
import { ApiError, currentAuth, requireRole, respond } from './core';
import { DEPT_ORDER, EmployeeRecord, SHIFTS, db, plusDays, pushAudit, rejectionReason, shiftWindow } from './db';
import { OFFDAY_GROUP_LIMIT, OFFDAY_MONTHLY_ALLOWANCE } from './rules';
import { capacityState, groupCountMap, isApproved, paginate, textMatch } from './selectors';

const nowIso = () => format(SERVER_NOW, "yyyy-MM-dd'T'HH:mm:ss");

export interface RosterQuery {
  month: string;
  category?: string;
  platform?: string;
  dept?: DeptCode | '';
  shift?: ShiftCode | '';
  state?: RosterState | '';
  search?: string;
  employeeId?: string;
}

function monthDays(month: string): string[] {
  const n = getDaysInMonth(parseISO(`${month}-01`));
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

function stateFor(e: EmployeeRecord, date: string, offSet: Set<string>): RosterCell {
  if (offSet.has(`${e.id}|${date}`)) return { date, state: 'OFF' };
  const rep = db.replacements.find((r) => r.absentEmployeeId === e.id && r.date === date && r.status !== 'CANCELLED');
  if (rep) {
    if (rep.freelancerId && (rep.status === 'ASSIGNED' || rep.status === 'CONFIRMED')) return { date, state: 'REPLACED', note: rep.freelancerId };
    return { date, state: 'ABSENT', note: rep.id };
  }
  if (e.status === 'ON_LEAVE' && date >= plusDays(TODAY, -10) && date <= plusDays(TODAY, 20)) return { date, state: 'LEAVE' };
  return { date, state: 'WORKING' };
}

function filterEmployees(q: Omit<RosterQuery, 'month'>) {
  return db.employees.
  filter((e) => !q.employeeId || e.id === q.employeeId).
  filter((e) => !q.category || e.categoryCode === q.category).
  filter((e) => !q.platform || e.platformCode === q.platform).
  filter((e) => !q.dept || e.dept === q.dept).
  filter((e) => !q.shift || e.shift === q.shift).
  filter((e) => textMatch(q.search, e.id, e.name));
}

function approvedOffSet(): Set<string> {
  return new Set(db.offDays.filter((o) => isApproved(o.status)).map((o) => `${o.employeeId}|${o.date}`));
}

export const schedulingApi = {
  getRoster: (q: RosterQuery): Promise<{days: string[];rows: RosterRow[];totals: Record<RosterState, number>;}> =>
  respond(() => {
    const a = currentAuth();
    if (a.role === 'EMPLOYEE') q = { ...q, employeeId: a.userId };
    if (a.role === 'FREELANCER') throw new ApiError('FORBIDDEN', 'Freelancers view assignments instead of the permanent roster.', 403);
    const days = monthDays(q.month);
    const offSet = approvedOffSet();
    const totals: Record<RosterState, number> = { WORKING: 0, OFF: 0, ABSENT: 0, REPLACED: 0, LEAVE: 0 };
    let rows: RosterRow[] = filterEmployees(q).map((e) => {
      const cells = days.map((d) => stateFor(e, d, offSet));
      cells.forEach((c) => totals[c.state]++);
      return { employeeId: e.id, name: e.name, platformCode: e.platformCode, dept: e.dept, shift: e.shift, cells };
    });
    if (q.state) rows = rows.filter((r) => r.cells.some((c) => c.state === q.state));
    return { days, rows, totals };
  }),

  getDailyRoster: (date: string, q: Omit<RosterQuery, 'month'>): Promise<DailyRosterRow[]> =>
  respond(() => {
    requireRole('ADMIN', 'MANAGER');
    const offSet = approvedOffSet();
    return filterEmployees(q).
    map((e) => {
      const cell = stateFor(e, date, offSet);
      const rep = db.replacements.find((r) => r.absentEmployeeId === e.id && r.date === date && r.status !== 'CANCELLED');
      const w = shiftWindow(date, e.shift);
      return {
        employeeId: e.id, name: e.name, platformCode: e.platformCode, dept: e.dept, shift: e.shift, state: cell.state,
        shiftStart: w.start, shiftEnd: w.end,
        replacement: rep ? { id: rep.id, freelancerId: rep.freelancerId, freelancerName: rep.freelancerName, status: rep.status } : null
      };
    }).
    filter((r) => !q.state || r.state === q.state);
  }),

  getPlatformRoster: (code: string, date: string): Promise<PlatformRoster> =>
  respond(() => {
    requireRole('ADMIN', 'MANAGER', 'EMPLOYEE', 'FREELANCER');
    const p = db.platforms.find((x) => x.code === code);
    if (!p) throw new ApiError('NOT_FOUND', `Platform ${code} does not exist.`, 404);
    const offSet = approvedOffSet();
    return {
      platformCode: code,
      date,
      depts: DEPT_ORDER.filter((d) => p.departments[d]).map((d) => ({
        dept: d,
        capacity: p.departments[d]!,
        shifts: SHIFTS.map((s) => {
          const w = shiftWindow(date, s);
          const entries = db.employees.
          filter((e) => e.platformCode === code && e.dept === d && e.shift === s).
          sort((a, b) => a.slot - b.slot).
          flatMap((e) => {
            const c = stateFor(e, date, offSet);
            const base = [{ id: e.id, name: e.name, state: c.state, isFreelancer: false }];
            const rep = db.replacements.find((r) => r.absentEmployeeId === e.id && r.date === date && r.freelancerId && (r.status === 'ASSIGNED' || r.status === 'CONFIRMED'));
            if (rep) base.push({ id: rep.freelancerId!, name: rep.freelancerName!, state: 'WORKING' as RosterState, isFreelancer: true, replacing: e.id } as never);
            return base;
          });
          return { shift: s, shiftStart: w.start, shiftEnd: w.end, working: entries.filter((x) => x.state === 'WORKING').length, entries };
        })
      }))
    };
  }),

  getOffDayCalendar: (employeeId: string, month: string): Promise<OffDayCalendar> =>
  respond(() => {
    const a = currentAuth();
    if (a.role === 'EMPLOYEE' && a.userId !== employeeId) throw new ApiError('FORBIDDEN', 'You can only view your own off-day calendar.', 403);
    if (a.role === 'FREELANCER') throw new ApiError('FORBIDDEN', 'Off-day allowance applies to permanent employees only.', 403);
    const e = db.employees.find((x) => x.id === employeeId);
    if (!e) throw new ApiError('NOT_FOUND', `Employee ${employeeId} does not exist.`, 404);
    const counts = groupCountMap();
    const mine = db.offDays.filter((o) => o.employeeId === e.id && o.status !== 'CANCELLED');
    const used = mine.filter((o) => o.date.startsWith(month) && isApproved(o.status)).length;
    const remaining = Math.max(0, OFFDAY_MONTHLY_ALLOWANCE - used);
    return {
      employeeId, platformCode: e.platformCode, dept: e.dept, month, allowance: OFFDAY_MONTHLY_ALLOWANCE, used, remaining,
      cells: monthDays(month).map((date) => {
        const approved = counts.get(`${e.platformCode}|${e.dept}|${date}`) ?? 0;
        const req = [...mine].reverse().find((o) => o.date === date) ?? null;
        const isPast = date <= TODAY;
        const full = approved >= OFFDAY_GROUP_LIMIT;
        let unavailableReason: string | null = null;
        if (isPast) unavailableReason = 'Date has passed';else
        if (req && req.status !== 'REJECTED') unavailableReason = 'You already have a request for this date';else
        if (full) unavailableReason = rejectionReason(e.platformCode, e.dept, date);else
        if (remaining === 0) unavailableReason = `All ${OFFDAY_MONTHLY_ALLOWANCE} off-days for this month are used`;
        return {
          date, approvedInGroup: approved, limit: OFFDAY_GROUP_LIMIT, groupState: capacityState(approved),
          myRequest: req ? { id: req.id, status: req.status, reason: req.reason } : null,
          selectable: unavailableReason === null, unavailableReason, isPast
        };
      })
    };
  }),

  requestOffDay: (employeeId: string, date: string): Promise<OffDayRequestResult> =>
  respond(() => {
    const a = requireRole('EMPLOYEE', 'MANAGER', 'ADMIN');
    if (a.role === 'EMPLOYEE' && a.userId !== employeeId) throw new ApiError('FORBIDDEN', 'You can only request off-days for yourself.', 403);
    const e = db.employees.find((x) => x.id === employeeId);
    if (!e) throw new ApiError('NOT_FOUND', `Employee ${employeeId} does not exist.`, 404);
    if (date <= TODAY) throw new ApiError('PAST_DATE', 'Off-days must be requested for a future date.', 422);
    if (db.offDays.some((o) => o.employeeId === e.id && o.date === date && (isApproved(o.status) || o.status === 'REQUESTED'))) throw new ApiError('DUPLICATE', 'You already have an off-day on this date.', 409);
    const used = db.offDays.filter((o) => o.employeeId === e.id && o.date.startsWith(date.slice(0, 7)) && isApproved(o.status)).length;
    if (used >= OFFDAY_MONTHLY_ALLOWANCE) throw new ApiError('ALLOWANCE_EXHAUSTED', `All ${OFFDAY_MONTHLY_ALLOWANCE} off-days for ${format(parseISO(date), 'MMMM')} have been used.`, 409);
    const approved = db.offDays.filter((o) => o.platformCode === e.platformCode && o.dept === e.dept && o.date === date && isApproved(o.status)).length;
    const req: OffDayRequest = { id: db.seq.off(), employeeId: e.id, employeeName: e.name, platformCode: e.platformCode, dept: e.dept, shift: e.shift, date, status: 'APPROVED', createdAt: nowIso() };
    const nice = format(parseISO(date), 'MMM d');
    if (approved >= OFFDAY_GROUP_LIMIT) {
      req.status = 'REJECTED';
      req.reason = rejectionReason(e.platformCode, e.dept, date);
      db.offDays.push(req);
      db.notifications.unshift({ id: db.seq.ntf(), type: 'OFFDAY_REJECTED', title: `Off-day rejected · ${nice}`, body: req.reason, createdAt: nowIso(), read: false, emailStatus: 'SENT', link: '/my/off-days', recipientRoles: ['EMPLOYEE'], recipientId: e.id });
      return { outcome: 'REJECTED', request: req, capacity: { approved, limit: OFFDAY_GROUP_LIMIT }, message: req.reason };
    }
    db.offDays.push(req);
    e.offDaysUsed = db.offDays.filter((o) => o.employeeId === e.id && o.date.startsWith(TODAY.slice(0, 7)) && isApproved(o.status)).length;
    db.notifications.unshift({ id: db.seq.ntf(), type: 'OFFDAY_APPROVED', title: `Off-day approved · ${nice}`, body: `Approved automatically. ${e.platformCode} / ${e.dept} now at ${approved + 1} / ${OFFDAY_GROUP_LIMIT} off on ${nice}.`, createdAt: nowIso(), read: false, emailStatus: 'SENT', link: '/my/off-days', recipientRoles: ['EMPLOYEE'], recipientId: e.id });
    return { outcome: 'APPROVED', request: req, capacity: { approved: approved + 1, limit: OFFDAY_GROUP_LIMIT }, message: `Approved. ${approved + 1} / ${OFFDAY_GROUP_LIMIT} off for ${e.dept} on ${e.platformCode}.` };
  }),

  cancelOffDay: (requestId: string) =>
  respond(() => {
    const a = currentAuth();
    const o = db.offDays.find((x) => x.id === requestId);
    if (!o) throw new ApiError('NOT_FOUND', 'Off-day request not found.', 404);
    if (a.role === 'EMPLOYEE' && o.employeeId !== a.userId) throw new ApiError('FORBIDDEN', 'You can only cancel your own requests.', 403);
    if (o.date <= TODAY) throw new ApiError('PAST_DATE', 'Past or same-day off-days cannot be cancelled.', 422);
    o.status = 'CANCELLED';
    return o;
  }),

  listOffDayRequests: (q: {status?: string;platform?: string;category?: string;dept?: DeptCode | '';search?: string;month?: string;page?: number;pageSize?: number;}): Promise<Paged<OffDayRequest>> =>
  respond(() => {
    requireRole('ADMIN', 'MANAGER');
    const list = db.offDays.
    filter((o) => !q.status || o.status === q.status).
    filter((o) => !q.platform || o.platformCode === q.platform).
    filter((o) => !q.category || o.platformCode.startsWith(`${q.category}-`)).
    filter((o) => !q.dept || o.dept === q.dept).
    filter((o) => !q.month || o.date.startsWith(q.month)).
    filter((o) => textMatch(q.search, o.employeeId, o.employeeName, o.platformCode)).
    sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return paginate(list, q.page, q.pageSize ?? 25);
  }),

  getOffDayCapacity: (q: {category?: string;platform?: string;dept?: DeptCode | '';start: string;days?: number;onlyAlerts?: boolean;}) =>
  respond(() => {
    requireRole('ADMIN', 'MANAGER');
    const dates = Array.from({ length: q.days ?? 14 }, (_, i) => plusDays(q.start, i));
    const byGroup = new Map<string, OffDayRequest[]>();
    for (const o of db.offDays) {
      if (!isApproved(o.status)) continue;
      const k = `${o.platformCode}|${o.dept}|${o.date}`;
      const arr = byGroup.get(k) ?? [];
      arr.push(o);
      byGroup.set(k, arr);
    }
    const rows = db.platforms.
    filter((p) => p.status === 'ACTIVE').
    filter((p) => !q.category || p.categoryCode === q.category).
    filter((p) => !q.platform || p.code === q.platform).
    flatMap((p) =>
    DEPT_ORDER.filter((d) => p.departments[d] && (!q.dept || q.dept === d)).map((d) => {
      const cells: CapacityCell[] = dates.map((date) => {
        const list = byGroup.get(`${p.code}|${d}|${date}`) ?? [];
        return { date, approved: list.length, limit: OFFDAY_GROUP_LIMIT, state: capacityState(list.length), employees: list.map((o) => ({ id: o.employeeId, name: o.employeeName, status: o.status })) };
      });
      return { platformCode: p.code, categoryCode: p.categoryCode, dept: d, cells, fullDays: cells.filter((c) => c.state === 'FULL' || c.state === 'CONFLICT').length };
    })
    ).
    filter((r) => !q.onlyAlerts || r.fullDays > 0);
    return { dates, rows };
  }),

  overrideOffDay: (requestId: string, reason: string) =>
  respond(() => {
    const actor = requireRole('ADMIN', 'MANAGER');
    const o = db.offDays.find((x) => x.id === requestId);
    if (!o) throw new ApiError('NOT_FOUND', 'Off-day request not found.', 404);
    if (o.status !== 'REJECTED') throw new ApiError('INVALID_STATE', 'Only rejected requests can be overridden.', 409);
    if (o.date <= TODAY) throw new ApiError('PAST_DATE', 'Overrides cannot be applied to past dates.', 422);
    if (!reason || reason.trim().length < 10) throw new ApiError('VALIDATION', 'Override reason must be at least 10 characters — it is recorded in the audit log.', 422);
    const approved = db.offDays.filter((x) => x.platformCode === o.platformCode && x.dept === o.dept && x.date === o.date && isApproved(x.status)).length;
    o.status = 'OVERRIDE_APPROVED';
    o.override = { managerId: actor.userId, managerName: actor.name, reason, at: nowIso(), previousApproved: approved };
    pushAudit({ at: nowIso(), actorId: actor.userId, actorName: actor.name, role: actor.role, action: 'OFFDAY_OVERRIDE', entity: 'OffDayRequest', entityId: o.id, platformCode: o.platformCode, dept: o.dept, previous: `REJECTED · capacity ${approved} / ${OFFDAY_GROUP_LIMIT}`, next: `OVERRIDE_APPROVED · capacity ${approved + 1} / ${OFFDAY_GROUP_LIMIT}`, reason, isOverride: true });
    db.notifications.unshift({ id: db.seq.ntf(), type: 'OFFDAY_OVERRIDE', title: `Off-day approved by manager override · ${format(parseISO(o.date), 'MMM d')}`, body: `${actor.name} approved your request as an exception: ${reason}`, createdAt: nowIso(), read: false, emailStatus: 'SENT', link: '/my/off-days', recipientRoles: ['EMPLOYEE'], recipientId: o.employeeId });
    return o;
  })
};