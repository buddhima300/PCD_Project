import { format, parseISO } from 'date-fns';
import { demoUsers } from '../../data/reference';
import { SERVER_NOW, TODAY } from '../../utils/clock';
import type {
  AuditEntry, DeptCode, Handover, Incident, Laptop, NotificationItem, OffDayRequest, Paged, PlatformSummary, PoolSummary, Replacement,
  RotationCycle, SessionUser, ShiftCode } from
'../../types/domain';
import { ApiError, currentAuth, mockConfig, requireRole, respond } from './core';
import { db, plusDays, shiftWindow } from './db';
import { listPlatformSummaries } from './platformHandlers';
import { OFFDAY_GROUP_LIMIT, OFFDAY_MONTHLY_ALLOWANCE, PLANNED_LEAD_DAYS, WORKLOAD_LIMIT } from './rules';
import { allPools, groupCountMap, isApproved, paginate, poolSummary, summarizePlatform, textMatch, toEmployee, toFreelancer } from './selectors';

export interface DashboardFilters {
  category?: string;
  platform?: string;
  dept?: DeptCode | '';
  shift?: ShiftCode | '';
}

export interface OpsDashboard {
  currentShift: {code: ShiftCode;start: string;end: string;};
  kpis: {
    permanentEmployees: number;
    freelancers: number;
    totalPlatforms: number;
    activePlatforms: number;
    morningWorkforce: number;
    nightWorkforce: number;
    currentWorkforce: number;
    totalWorkstations: number;
    availableCapacity: number;
    availableFreelancers: number;
    pendingReplacements: number;
    failedReplacements: number;
    fullPools: number;
    laptopIncidents: number;
    pendingHandovers: number;
    offDayConflicts: number;
  };
  platforms: PlatformSummary[];
  urgentReplacements: Replacement[];
  incidents: Incident[];
  handoverByStatus: Record<string, number>;
  offDayHotspots: {platformCode: string;dept: DeptCode;date: string;approved: number;limit: number;}[];
  pools: PoolSummary[];
  rotation: {current: RotationCycle;next: RotationCycle;};
}

export interface MyWork {
  role: 'EMPLOYEE' | 'FREELANCER';
  person: {id: string;name: string;dept: DeptCode;position?: string;priority?: number;};
  platform: PlatformSummary | null;
  pool: PoolSummary | null;
  shift: ShiftCode | null;
  nextShift: ShiftCode | null;
  currentWindow: {start: string;end: string;} | null;
  nextWindow: {start: string;end: string;} | null;
  workstation: Laptop | null;
  handovers: {handover: Handover;direction: 'INCOMING' | 'OUTGOING';}[];
  upcomingOffDays: OffDayRequest[];
  offDaysRemaining: number;
  offDaysUsed: number;
  plannedCover: Replacement[];
  assignments: Replacement[];
  currentAssignment: Replacement | null;
  workloadUsed: number;
  workloadLimit: number;
  availability: {date: string;MORNING: string;NIGHT: string;}[];
  rotation: {current: RotationCycle;next: RotationCycle;};
}

export const systemApi = {
  login: (email: string, _password: string): Promise<SessionUser> =>
  respond(() => {
    const u = demoUsers.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!u) throw new ApiError('INVALID_CREDENTIALS', 'Email or password is incorrect. Accounts lock after 5 failed attempts.', 401);
    return u;
  }),

  getDashboard: (f: DashboardFilters): Promise<OpsDashboard> =>
  respond(() => {
    requireRole('ADMIN', 'MANAGER');
    const platforms = listPlatformSummaries({ category: f.category, dept: f.dept || undefined }).filter((p) => !f.platform || p.code === f.platform);
    const codes = new Set(platforms.map((p) => p.code));
    const emps = db.employees.filter((e) => codes.has(e.platformCode) && (!f.dept || e.dept === f.dept));
    const pools = allPools().filter((p) => codes.has(p.platformCode) && (!f.dept || p.dept === f.dept));
    const reps = db.replacements.filter((r) => codes.has(r.platformCode) && r.date >= TODAY && (!f.dept || r.dept === f.dept) && (!f.shift || r.shift === f.shift));
    const incs = db.incidents.filter((i) => codes.has(i.platformCode) && i.status !== 'RESOLVED' && (!f.dept || i.dept === f.dept));
    const hos = db.handovers.filter((h) => codes.has(h.platformCode) && h.scheduledAt.startsWith(`${TODAY}T19`) && (!f.dept || h.dept === f.dept));
    const counts = groupCountMap();
    const hotspots: OpsDashboard['offDayHotspots'] = [];
    for (let i = 1; i <= 7; i++) {
      const date = plusDays(TODAY, i);
      for (const p of platforms) for (const o of p.occupancy) {
        if (f.dept && o.dept !== f.dept) continue;
        const n = counts.get(`${p.code}|${o.dept}|${date}`) ?? 0;
        if (n >= OFFDAY_GROUP_LIMIT) hotspots.push({ platformCode: p.code, dept: o.dept, date, approved: n, limit: OFFDAY_GROUP_LIMIT });
      }
    }
    const active = pools.filter((p) => p.platformStatus === 'ACTIVE');
    return {
      currentShift: { code: 'MORNING', ...shiftWindow(TODAY, 'MORNING') },
      kpis: {
        permanentEmployees: emps.length,
        freelancers: db.freelancers.filter((x) => !f.dept || x.dept === f.dept).length,
        totalPlatforms: platforms.length,
        activePlatforms: platforms.filter((p) => p.status === 'ACTIVE').length,
        morningWorkforce: emps.filter((e) => e.shift === 'MORNING').length,
        nightWorkforce: emps.filter((e) => e.shift === 'NIGHT').length,
        currentWorkforce: active.reduce((s, p) => s + p.occupied, 0),
        totalWorkstations: active.reduce((s, p) => s + p.capacity, 0),
        availableCapacity: active.reduce((s, p) => s + p.available, 0),
        availableFreelancers: db.freelancers.filter((x) => x.status === 'ACTIVE' && (!f.dept || x.dept === f.dept) && db.availability[x.id]?.[TODAY]?.NIGHT === 'AVAILABLE').length,
        pendingReplacements: reps.filter((r) => ['PENDING', 'SEARCHING', 'FAILED'].includes(r.status)).length,
        failedReplacements: reps.filter((r) => r.status === 'FAILED').length,
        fullPools: active.filter((p) => p.occupied >= p.capacity).length,
        laptopIncidents: incs.length,
        pendingHandovers: hos.filter((h) => h.status !== 'COMPLETED').length,
        offDayConflicts: hotspots.length
      },
      platforms,
      urgentReplacements: reps.filter((r) => r.status !== 'CANCELLED' && r.status !== 'CONFIRMED').sort((a, b) => a.shiftStart.localeCompare(b.shiftStart)).slice(0, 6),
      incidents: incs.slice(0, 6),
      handoverByStatus: hos.reduce<Record<string, number>>((acc, h) => ({ ...acc, [h.status]: (acc[h.status] ?? 0) + 1 }), {}),
      offDayHotspots: hotspots.slice(0, 8),
      pools: active,
      rotation: { current: db.rotationCycles.find((c) => c.status === 'CURRENT')!, next: db.rotationCycles.find((c) => c.status === 'SCHEDULED')! }
    };
  }),

  getMyWork: (): Promise<MyWork> =>
  respond(() => {
    const a = requireRole('EMPLOYEE', 'FREELANCER');
    const rotation = { current: db.rotationCycles.find((c) => c.status === 'CURRENT')!, next: db.rotationCycles.find((c) => c.status === 'SCHEDULED')! };
    const myHandovers = db.handovers.
    filter((h) => (h.incomingId === a.userId || h.outgoingId === a.userId) && h.scheduledAt >= `${TODAY}T12:00:00`).
    sort((x, y) => x.scheduledAt.localeCompare(y.scheduledAt)).
    map((h) => ({ handover: h, direction: h.incomingId === a.userId ? 'INCOMING' as const : 'OUTGOING' as const }));
    if (a.role === 'EMPLOYEE') {
      const e = db.employees.find((x) => x.id === a.userId);
      if (!e) throw new ApiError('NOT_FOUND', 'Employee record not linked to this account.', 404);
      const p = db.platforms.find((x) => x.code === e.platformCode)!;
      const offs = db.offDays.filter((o) => o.employeeId === e.id && isApproved(o.status));
      let next = plusDays(TODAY, 1);
      while (offs.some((o) => o.date === next) || db.replacements.some((r) => r.absentEmployeeId === e.id && r.date === next && r.status !== 'CANCELLED')) next = plusDays(next, 1);
      const nextShift: ShiftCode = next >= '2026-10-01' ? e.nextShift : e.shift;
      const used = offs.filter((o) => o.date.startsWith(TODAY.slice(0, 7))).length;
      const lap = db.laptops.find((l) => l.currentUserId === e.id || l.nextUserId === e.id) ?? null;
      return {
        role: 'EMPLOYEE', person: { id: e.id, name: e.name, dept: e.dept, position: e.position }, platform: summarizePlatform(p), pool: poolSummary(p, e.dept),
        shift: e.shift, nextShift, currentWindow: shiftWindow(TODAY, e.shift), nextWindow: shiftWindow(next, nextShift), workstation: lap, handovers: myHandovers,
        upcomingOffDays: offs.filter((o) => o.date > TODAY).sort((x, y) => x.date.localeCompare(y.date)), offDaysRemaining: Math.max(0, OFFDAY_MONTHLY_ALLOWANCE - used), offDaysUsed: used,
        plannedCover: db.replacements.filter((r) => r.absentEmployeeId === e.id && r.date >= TODAY && r.status !== 'CANCELLED'), assignments: [], currentAssignment: null,
        workloadUsed: 0, workloadLimit: 0, availability: [], rotation
      };
    }
    const f = db.freelancers.find((x) => x.id === a.userId);
    if (!f) throw new ApiError('NOT_FOUND', 'Freelancer record not linked to this account.', 404);
    const fl = toFreelancer(f);
    const assignments = db.replacements.filter((r) => r.freelancerId === f.id && r.status !== 'CANCELLED' && r.shiftEnd >= format(SERVER_NOW, "yyyy-MM-dd'T'HH:mm:ss")).sort((x, y) => x.shiftStart.localeCompare(y.shiftStart));
    const current = assignments[0] ?? null;
    const p = current ? db.platforms.find((x) => x.code === current.platformCode)! : null;
    const lap = db.laptops.find((l) => l.nextUserId === f.id || l.currentUserId === f.id) ?? null;
    return {
      role: 'FREELANCER', person: { id: f.id, name: f.name, dept: f.dept, priority: f.priority }, platform: p ? summarizePlatform(p) : null, pool: p && current ? poolSummary(p, current.dept) : null,
      shift: current?.shift ?? null, nextShift: assignments[1]?.shift ?? null, currentWindow: current ? { start: current.shiftStart, end: current.shiftEnd } : null,
      nextWindow: assignments[1] ? { start: assignments[1].shiftStart, end: assignments[1].shiftEnd } : null, workstation: lap, handovers: myHandovers,
      upcomingOffDays: [], offDaysRemaining: 0, offDaysUsed: 0, plannedCover: [], assignments, currentAssignment: current, workloadUsed: fl.workloadUsed, workloadLimit: WORKLOAD_LIMIT,
      availability: Array.from({ length: 7 }, (_, i) => plusDays(TODAY, i)).map((d) => ({ date: d, ...db.availability[f.id][d] })), rotation
    };
  }),

  listNotifications: (q: {unreadOnly?: boolean;type?: string;}): Promise<{items: NotificationItem[];unread: number;}> =>
  respond(() => {
    const a = currentAuth();
    const mine = db.notifications.filter((n) => n.recipientRoles.includes(a.role) && (!n.recipientId || n.recipientId === a.userId));
    const items = mine.filter((n) => (!q.unreadOnly || !n.read) && (!q.type || n.type === q.type)).sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    return { items, unread: mine.filter((n) => !n.read).length };
  }),

  markNotificationRead: (id: string, read = true) =>
  respond(() => {
    const n = db.notifications.find((x) => x.id === id);
    if (!n) throw new ApiError('NOT_FOUND', 'Notification not found.', 404);
    n.read = read;
    return n;
  }),

  markAllNotificationsRead: () =>
  respond(() => {
    const a = currentAuth();
    db.notifications.filter((n) => n.recipientRoles.includes(a.role) && (!n.recipientId || n.recipientId === a.userId)).forEach((n) => n.read = true);
    return true;
  }),

  listAudit: (q: {page?: number;pageSize?: number;actor?: string;platform?: string;dept?: DeptCode | '';action?: string;entity?: string;from?: string;to?: string;overridesOnly?: boolean;}): Promise<Paged<AuditEntry> & {actions: string[];entities: string[];}> =>
  respond(() => {
    requireRole('ADMIN');
    const list = db.audit.
    filter((x) => textMatch(q.actor, x.actorId, x.actorName)).
    filter((x) => !q.platform || x.platformCode === q.platform).
    filter((x) => !q.dept || x.dept === q.dept).
    filter((x) => !q.action || x.action === q.action).
    filter((x) => !q.entity || x.entity === q.entity).
    filter((x) => !q.from || x.at >= q.from).
    filter((x) => !q.to || x.at <= `${q.to}T23:59:59`).
    filter((x) => !q.overridesOnly || x.isOverride);
    return { ...paginate(list, q.page, q.pageSize ?? 25), actions: [...new Set(db.audit.map((x) => x.action))].sort(), entities: [...new Set(db.audit.map((x) => x.entity))].sort() };
  }),

  getSettings: () =>
  respond(() => {
    requireRole('ADMIN');
    return {
      rules: [
      { key: 'offday.groupLimit', label: 'Max approved off-days per Platform + Department + Date', value: String(OFFDAY_GROUP_LIMIT) },
      { key: 'offday.monthlyAllowance', label: 'Off-days per permanent employee per month', value: String(OFFDAY_MONTHLY_ALLOWANCE) },
      { key: 'offday.processing', label: 'Off-day processing', value: 'First-come-first-served · auto approve/reject' },
      { key: 'replacement.plannedLead', label: 'Planned replacement search lead time', value: `${PLANNED_LEAD_DAYS} days before shift` },
      { key: 'replacement.emergency', label: 'Emergency replacement search', value: 'Immediate' },
      { key: 'freelancer.workload', label: 'Max freelancer shifts in rolling 24h', value: String(WORKLOAD_LIMIT) },
      { key: 'rotation.period', label: 'Permanent shift rotation', value: 'Every 3 months (Jan · Apr · Jul · Oct)' },
      { key: 'shift.morning', label: 'Morning shift', value: '07:30 → 19:30' },
      { key: 'shift.night', label: 'Night shift', value: '19:30 → 07:30 (+1 day)' }],

      integrations: [
      { key: 'email', label: 'Email notifications (SMTP relay)', status: 'CONNECTED' },
      { key: 'sso', label: 'Single sign-on (SAML)', status: 'CONNECTED' },
      { key: 'itsm', label: 'IT service desk (incident sync)', status: 'DEGRADED' }]

    };
  }),

  globalSearch: (q: string) =>
  respond(() => {
    const a = currentAuth();
    if (!q || q.length < 2) return [];
    const out: {kind: string;id: string;label: string;to: string;}[] = [];
    for (const p of db.platforms) if (textMatch(q, p.code, p.id)) out.push({ kind: 'Platform', id: p.code, label: `${p.code} · ${p.categoryCode}`, to: `/platforms/${p.code}` });
    if (a.role === 'ADMIN' || a.role === 'MANAGER') {
      for (const e of db.employees) if (textMatch(q, e.id, e.name)) out.push({ kind: 'Employee', id: e.id, label: `${e.name} · ${e.platformCode} / ${e.dept}`, to: `/employees/${e.id}` });
      for (const f of db.freelancers) if (textMatch(q, f.id, f.name)) out.push({ kind: 'Freelancer', id: f.id, label: `${f.name} · ${f.dept}`, to: `/freelancers/${f.id}` });
      for (const l of db.laptops) if (textMatch(q, l.assetId, l.workstationId)) out.push({ kind: 'Laptop', id: l.assetId, label: `${l.workstationId ?? 'Unpooled'} · ${l.status}`, to: `/laptops/${l.assetId}` });
      for (const r of db.replacements) if (textMatch(q, r.id)) out.push({ kind: 'Replacement', id: r.id, label: `${r.platformCode} / ${r.dept} · ${r.status}`, to: `/replacements/${r.id}` });
    }
    return out.slice(0, 12);
  }),

  getMockConfig: () => Promise.resolve({ ...mockConfig }),
  setMockConfig: (c: Partial<typeof mockConfig>) => {
    Object.assign(mockConfig, c);
    return Promise.resolve({ ...mockConfig });
  }
};

export const _unused = { parseISO, toEmployee };