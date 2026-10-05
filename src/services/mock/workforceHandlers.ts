import { format, parseISO } from 'date-fns';
import { departmentSeeds, positionsByDept, shiftDefinitions } from '../../data/reference';
import { SERVER_NOW, TODAY } from '../../utils/clock';
import type {
  AuditEntry, AvailabilityDay, AvailabilityState, DepartmentSummary, DeptCode, Employee, Freelancer, Handover, OffDayRequest, Paged,
  PositionSummary, Replacement, RotationInfo, ShiftCode } from
'../../types/domain';
import { ApiError, currentAuth, requireRole, respond } from './core';
import { DEPT_ORDER, db, plusDays, pushAudit } from './db';
import { paginate, textMatch, toEmployee, toFreelancer } from './selectors';

export interface EmployeeQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
  platform?: string;
  dept?: DeptCode | '';
  shift?: ShiftCode | '';
  status?: string;
  sort?: keyof Employee;
  dir?: 'asc' | 'desc';
}

export interface FreelancerQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  dept?: DeptCode | '';
  status?: string;
  sort?: 'priority' | 'id' | 'name' | 'workloadUsed';
}

const nowIso = () => format(SERVER_NOW, "yyyy-MM-dd'T'HH:mm:ss");

export interface EmployeeDetail {
  employee: Employee;
  offDays: OffDayRequest[];
  replacements: Replacement[];
  handovers: Handover[];
  platformHistory: {platformCode: string;from: string;to: string | null;reason: string;}[];
  scheduleHistory: {cycle: string;start: string;end: string;shift: ShiftCode;}[];
  audit: AuditEntry[];
}

export interface FreelancerDetail {
  freelancer: Freelancer;
  availability: AvailabilityDay[];
  assignments: Replacement[];
  priorityHistory: AuditEntry[];
}

export const workforceApi = {
  listEmployees: (q: EmployeeQuery): Promise<Paged<Employee>> =>
  respond(() => {
    requireRole('ADMIN', 'MANAGER');
    const list = db.employees.
    filter((e) => !q.category || e.categoryCode === q.category).
    filter((e) => !q.platform || e.platformCode === q.platform).
    filter((e) => !q.dept || e.dept === q.dept).
    filter((e) => !q.shift || e.shift === q.shift).
    filter((e) => !q.status || e.status === q.status || e.accountStatus === q.status).
    filter((e) => textMatch(q.search, e.id, e.name, e.email, e.platformCode)).
    map(toEmployee);
    const key = q.sort ?? 'id';
    const dir = q.dir === 'desc' ? -1 : 1;
    list.sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? ''), undefined, { numeric: true }) * dir);
    return paginate(list, q.page, q.pageSize);
  }),

  getEmployee: (id: string): Promise<EmployeeDetail> =>
  respond(() => {
    const a = currentAuth();
    if ((a.role === 'EMPLOYEE' || a.role === 'FREELANCER') && a.userId !== id) throw new ApiError('FORBIDDEN', 'You can only view your own employee record.', 403);
    const e = db.employees.find((x) => x.id === id);
    if (!e) throw new ApiError('NOT_FOUND', `Employee ${id} does not exist.`, 404);
    const seedNum = Number(id.slice(4));
    const moved = seedNum % 5 === 0;
    const prevPlatform = db.platforms.find((p) => p.categoryCode === e.categoryCode && p.code !== e.platformCode && p.departments[e.dept]);
    const platformHistory = moved && prevPlatform ?
    [
    { platformCode: e.platformCode, from: '2026-02-01', to: null, reason: 'Platform staffing rebalance' },
    { platformCode: prevPlatform.code, from: e.joinedAt, to: '2026-01-31', reason: 'Initial assignment' }] :

    [{ platformCode: e.platformCode, from: e.joinedAt, to: null, reason: 'Initial assignment' }];
    const cycles = db.rotationCycles.filter((c) => c.status !== 'SCHEDULED' && c.start >= e.joinedAt.slice(0, 7));
    const scheduleHistory = [
    { cycle: 'Q4 2026', start: '2026-10-01', end: '2026-12-31', shift: e.nextShift },
    ...cycles.map((c, i) => ({ cycle: c.label, start: c.start, end: c.end, shift: (i % 2 === 0 ? e.shift : e.nextShift) as ShiftCode }))];

    return {
      employee: toEmployee(e),
      offDays: db.offDays.filter((o) => o.employeeId === id).sort((x, y) => y.date.localeCompare(x.date)),
      replacements: db.replacements.filter((r) => r.absentEmployeeId === id),
      handovers: db.handovers.filter((h) => h.outgoingId === id || h.incomingId === id).sort((x, y) => y.scheduledAt.localeCompare(x.scheduledAt)),
      platformHistory,
      scheduleHistory,
      audit: a.role === 'ADMIN' || a.role === 'MANAGER' ? db.audit.filter((x) => x.entityId === id || x.actorId === id) : []
    };
  }),

  listFreelancers: (q: FreelancerQuery): Promise<Paged<Freelancer>> =>
  respond(() => {
    requireRole('ADMIN', 'MANAGER');
    const list = db.freelancers.
    filter((f) => !q.dept || f.dept === q.dept).
    filter((f) => !q.status || f.status === q.status).
    filter((f) => textMatch(q.search, f.id, f.name, f.email)).
    map(toFreelancer);
    const s = q.sort ?? 'priority';
    list.sort((a, b) =>
    s === 'priority' ?
    DEPT_ORDER.indexOf(a.dept) - DEPT_ORDER.indexOf(b.dept) || a.priority - b.priority :
    s === 'workloadUsed' ?
    b.workloadUsed - a.workloadUsed :
    String(a[s]).localeCompare(String(b[s]))
    );
    return paginate(list, q.page, q.pageSize ?? 50);
  }),

  getFreelancer: (id: string, month = TODAY.slice(0, 7)): Promise<FreelancerDetail> =>
  respond(() => {
    const a = currentAuth();
    if (a.role === 'EMPLOYEE' || a.role === 'FREELANCER' && a.userId !== id) throw new ApiError('FORBIDDEN', 'You can only view your own freelancer record.', 403);
    const f = db.freelancers.find((x) => x.id === id);
    if (!f) throw new ApiError('NOT_FOUND', `Freelancer ${id} does not exist.`, 404);
    const days = Object.keys(db.availability[id] ?? {}).filter((d) => d.startsWith(month)).sort();
    return {
      freelancer: toFreelancer(f),
      availability: days.map((d) => ({ date: d, ...db.availability[id][d] })),
      assignments: db.replacements.filter((r) => r.freelancerId === id).sort((x, y) => y.shiftStart.localeCompare(x.shiftStart)),
      priorityHistory: db.audit.filter((x) => x.entity === 'FreelancerPriority' && x.dept === f.dept)
    };
  }),

  getAvailabilityBoard: (dept: DeptCode, start: string, days = 14) =>
  respond(() => {
    requireRole('ADMIN', 'MANAGER');
    const dates = Array.from({ length: days }, (_, i) => plusDays(start, i));
    return {
      dates,
      rows: db.freelancers.
      filter((f) => f.dept === dept).
      sort((a, b) => a.priority - b.priority).
      map((f) => ({
        freelancer: toFreelancer(f),
        days: dates.map((d) => ({ date: d, MORNING: db.availability[f.id]?.[d]?.MORNING ?? 'UNAVAILABLE', NIGHT: db.availability[f.id]?.[d]?.NIGHT ?? 'UNAVAILABLE' }))
      }))
    };
  }),

  setAvailability: (freelancerId: string, date: string, shift: ShiftCode, state: AvailabilityState) =>
  respond(() => {
    const a = currentAuth();
    if (a.role === 'EMPLOYEE' || a.role === 'FREELANCER' && a.userId !== freelancerId) throw new ApiError('FORBIDDEN', 'You cannot change another freelancer’s availability.', 403);
    if (date < TODAY) throw new ApiError('PAST_DATE', 'Availability cannot be changed for past dates.', 422);
    const cur = db.availability[freelancerId]?.[date];
    if (!cur) throw new ApiError('OUT_OF_RANGE', 'Availability can be managed up to 60 days ahead.', 422);
    if (cur[shift] === 'ASSIGNED') {
      const rep = db.replacements.find((r) => r.freelancerId === freelancerId && r.date === date && r.shift === shift && r.status !== 'CANCELLED');
      throw new ApiError('ASSIGNED_SHIFT', `You are assigned to ${rep?.platformCode ?? 'a platform'} on this shift (${rep?.id ?? ''}). Ask a manager to cancel the assignment first.`, 409);
    }
    if (state !== 'AVAILABLE' && state !== 'UNAVAILABLE' && state !== 'OFF') throw new ApiError('VALIDATION', 'Only Available, Unavailable or Off can be set.', 422);
    cur[shift] = state;
    return { date, ...cur };
  }),

  updatePriority: (dept: DeptCode, orderedIds: string[], reason: string) =>
  respond(() => {
    const actor = requireRole('ADMIN', 'MANAGER');
    if (!reason || reason.trim().length < 5) throw new ApiError('VALIDATION', 'Provide a reason (min 5 characters) for the priority change.', 422);
    const list = db.freelancers.filter((f) => f.dept === dept);
    if (orderedIds.length !== list.length || !list.every((f) => orderedIds.includes(f.id))) throw new ApiError('VALIDATION', 'Priority list must include every freelancer in the department exactly once.', 422);
    const before = [...list].sort((a, b) => a.priority - b.priority).slice(0, 3).map((f) => `${f.id} #${f.priority}`).join(', ');
    orderedIds.forEach((id, i) => {
      const f = list.find((x) => x.id === id)!;
      f.priority = i + 1;
    });
    pushAudit({ at: nowIso(), actorId: actor.userId, actorName: actor.name, role: actor.role, action: 'FREELANCER_PRIORITY_CHANGE', entity: 'FreelancerPriority', entityId: dept, platformCode: null, dept, previous: before, next: orderedIds.slice(0, 3).map((id, i) => `${id} #${i + 1}`).join(', '), reason, isOverride: false });
    return list.map(toFreelancer).sort((a, b) => a.priority - b.priority);
  }),

  getPriorityHistory: (dept: DeptCode): Promise<AuditEntry[]> =>
  respond(() => {
    requireRole('ADMIN', 'MANAGER');
    return db.audit.filter((x) => x.entity === 'FreelancerPriority' && x.dept === dept);
  }),

  listDepartments: (): Promise<DepartmentSummary[]> =>
  respond(() =>
  departmentSeeds.map((d) => ({
    ...d,
    platforms: db.platforms.filter((p) => p.departments[d.code]).length,
    workstations: db.platforms.reduce((s, p) => s + (p.departments[d.code] ?? 0), 0),
    employees: db.employees.filter((e) => e.dept === d.code).length,
    freelancers: db.freelancers.filter((f) => f.dept === d.code).length,
    positions: [...positionsByDept[d.code]]
  }))
  ),

  listPositions: (): Promise<PositionSummary[]> =>
  respond(() =>
  DEPT_ORDER.flatMap((d) =>
  positionsByDept[d].map((title, i) => ({ title, dept: d, level: (i === 0 ? 'Agent' : 'Senior') as PositionSummary['level'], employees: db.employees.filter((e) => e.position === title).length }))
  )
  ),

  getShifts: () =>
  respond(() =>
  shiftDefinitions.map((s) => ({
    ...s,
    employees: db.employees.filter((e) => e.shift === s.code).length,
    freelancersAvailableToday: db.freelancers.filter((f) => f.status === 'ACTIVE' && db.availability[f.id]?.[TODAY]?.[s.code] === 'AVAILABLE').length,
    replacementsToday: db.replacements.filter((r) => r.date === TODAY && r.shift === s.code && r.status !== 'CANCELLED').length,
    today: s.code === 'MORNING' ? { start: `${TODAY}T07:30:00`, end: `${TODAY}T19:30:00` } : { start: `${TODAY}T19:30:00`, end: `${plusDays(TODAY, 1)}T07:30:00` }
  }))
  ),

  getRotation: (): Promise<RotationInfo> =>
  respond(() => {
    const current = db.rotationCycles.find((c) => c.status === 'CURRENT')!;
    const next = db.rotationCycles.find((c) => c.status === 'SCHEDULED')!;
    const platforms = db.platforms.
    filter((p) => p.status === 'ACTIVE').
    map((p) => {
      const m = db.employees.filter((e) => e.platformCode === p.code && e.shift === 'MORNING').length;
      const n = db.employees.filter((e) => e.platformCode === p.code && e.shift === 'NIGHT').length;
      return { platformCode: p.code, categoryCode: p.categoryCode, morningNow: m, nightNow: n, morningNext: n, nightNext: m };
    });
    const departments = DEPT_ORDER.map((d) => {
      const m = db.employees.filter((e) => e.dept === d && e.shift === 'MORNING').length;
      const n = db.employees.filter((e) => e.dept === d && e.shift === 'NIGHT').length;
      return { dept: d, morningNow: m, nightNow: n, morningNext: n, nightNext: m };
    });
    return { current, next, history: db.rotationCycles.filter((c) => c.status === 'COMPLETED'), platforms, departments };
  }),

  getWorkforceOverview: () =>
  respond(() => {
    requireRole('ADMIN', 'MANAGER');
    const byCategory = db.categories.map((c) => ({
      code: c.code,
      employees: db.employees.filter((e) => e.categoryCode === c.code).length,
      morning: db.employees.filter((e) => e.categoryCode === c.code && e.shift === 'MORNING').length,
      night: db.employees.filter((e) => e.categoryCode === c.code && e.shift === 'NIGHT').length,
      required: db.platforms.filter((p) => p.categoryCode === c.code && p.status === 'ACTIVE').reduce((s, p) => s + Object.values(p.departments).reduce((a, b) => a + (b ?? 0), 0) * 2, 0)
    }));
    const byDept = DEPT_ORDER.map((d) => ({
      dept: d,
      employees: db.employees.filter((e) => e.dept === d).length,
      freelancers: db.freelancers.filter((f) => f.dept === d && f.status === 'ACTIVE').length,
      availableTonight: db.freelancers.filter((f) => f.dept === d && f.status === 'ACTIVE' && db.availability[f.id]?.[TODAY]?.NIGHT === 'AVAILABLE').length
    }));
    return {
      totals: {
        permanent: db.employees.length,
        freelancers: db.freelancers.length,
        activeFreelancers: db.freelancers.filter((f) => f.status === 'ACTIVE').length,
        onLeave: db.employees.filter((e) => e.status === 'ON_LEAVE').length,
        locked: db.employees.filter((e) => e.accountStatus !== 'ACTIVE').length,
        required: byCategory.reduce((s, c) => s + c.required, 0)
      },
      byCategory,
      byDept
    };
  }),

  getProfile: () =>
  respond(() => {
    const a = currentAuth();
    const emp = db.employees.find((e) => e.id === a.userId);
    const fl = db.freelancers.find((f) => f.id === a.userId);
    return { userId: a.userId, role: a.role, name: a.name, employee: emp ? toEmployee(emp) : null, freelancer: fl ? toFreelancer(fl) : null };
  })
};

export const _parse = parseISO;