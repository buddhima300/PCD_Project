import { format } from 'date-fns';
import { SERVER_NOW, TODAY } from '../../utils/clock';
import type {
  ChecklistResult, DeptCode, Handover, HandoverStatus, Incident, IncidentStatus, Laptop, LaptopStatus, Paged, PoolSummary, Severity } from
'../../types/domain';
import { ApiError, currentAuth, requireRole, respond } from './core';
import { db, pushAudit } from './db';
import { allPools, paginate, poolSummary, textMatch } from './selectors';

const nowIso = () => format(SERVER_NOW, "yyyy-MM-dd'T'HH:mm:ss");

export interface PoolQuery {
  category?: string;
  platform?: string;
  dept?: DeptCode | '';
  state?: 'full' | 'available' | 'handover' | 'incident' | '';
  search?: string;
}

export interface LaptopQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: LaptopStatus | '';
  platform?: string;
  category?: string;
  dept?: DeptCode | '';
}

export interface LaptopHistoryEntry {
  at: string;
  kind: 'HANDOVER' | 'INCIDENT' | 'ASSIGNMENT';
  title: string;
  detail: string;
  status: string;
}

function hasIssue(c: ChecklistResult): boolean {
  return c.laptopCondition === 'DAMAGED' || !c.chargerPresent || !c.mousePresent || c.physicalDamage || !c.screenOk || !c.keyboardOk;
}

function issueSummary(c: ChecklistResult): string {
  const parts: string[] = [];
  if (c.laptopCondition === 'DAMAGED') parts.push('laptop damaged');
  if (!c.chargerPresent) parts.push('charger missing');
  if (!c.mousePresent) parts.push('mouse missing');
  if (c.physicalDamage) parts.push('physical damage');
  if (!c.screenOk) parts.push('screen issue');
  if (!c.keyboardOk) parts.push('keyboard issue');
  return parts.join(', ');
}

function createIncidentFromHandover(h: Handover, c: ChecklistResult, reporterId: string, reporterName: string): Incident {
  const severe = c.laptopCondition === 'DAMAGED' || c.physicalDamage || !c.screenOk || !c.keyboardOk;
  const inc: Incident = {
    id: db.seq.inc(), assetId: h.assetId, workstationId: h.workstationId, platformCode: h.platformCode, dept: h.dept,
    severity: severe ? 'HIGH' : 'LOW', status: 'OPEN', category: severe ? 'Physical damage' : 'Missing peripheral',
    title: `Handover issue on ${h.assetId}: ${issueSummary(c)}`, description: c.notes || `Reported during ${h.outgoingShift.toLowerCase()} → ${h.incomingShift.toLowerCase()} handover.`,
    reportedById: reporterId, reportedByName: reporterName, createdAt: nowIso(), updatedAt: nowIso(), handoverId: h.id
  };
  db.incidents.unshift(inc);
  const lap = db.laptops.find((l) => l.assetId === h.assetId);
  if (lap) {
    lap.openIncidentId = inc.id;
    if (severe) {
      lap.status = 'INCIDENT';
      lap.condition = 'DAMAGED';
    }
  }
  db.notifications.unshift({ id: db.seq.ntf(), type: 'LAPTOP_INCIDENT', title: `Incident ${inc.id} · ${h.platformCode} / ${h.dept}`, body: inc.title, createdAt: nowIso(), read: false, emailStatus: 'SENT', link: '/incidents', recipientRoles: ['SUPERVISOR'], recipientId: null });
  pushAudit({ at: nowIso(), actorId: reporterId, actorName: reporterName, role: reporterId.startsWith('FL') ? 'FREELANCER' : 'EMPLOYEE', action: 'INCIDENT_CREATED', entity: 'Incident', entityId: inc.id, platformCode: h.platformCode, dept: h.dept, previous: '—', next: `${inc.status} · ${inc.severity}`, reason: inc.title, isOverride: false });
  return inc;
}

export const resourceApi = {
  listPools: (q: PoolQuery): Promise<PoolSummary[]> =>
  respond(() => {
    requireRole('SUPERVISOR');
    return allPools().
    filter((p) => !q.category || p.categoryCode === q.category).
    filter((p) => !q.platform || p.platformCode === q.platform).
    filter((p) => !q.dept || p.dept === q.dept).
    filter((p) => textMatch(q.search, p.id, p.platformCode)).
    filter((p) => {
      if (q.state === 'full') return p.platformStatus === 'ACTIVE' && p.occupied >= p.capacity;
      if (q.state === 'available') return p.available > 0;
      if (q.state === 'handover') return p.handoverPending > 0;
      if (q.state === 'incident') return p.incidents > 0;
      return true;
    });
  }),

  getPool: (id: string) =>
  respond(() => {
    requireRole('SUPERVISOR', 'EMPLOYEE', 'FREELANCER');
    const lap = db.laptops.find((l) => l.poolId === id);
    if (!lap) throw new ApiError('NOT_FOUND', `Workstation pool ${id} does not exist.`, 404);
    const p = db.platforms.find((x) => x.code === lap.platformCode)!;
    return {
      pool: poolSummary(p, lap.dept),
      laptops: db.laptops.filter((l) => l.poolId === id).sort((a, b) => String(a.workstationId ?? 'ZZ').localeCompare(String(b.workstationId ?? 'ZZ'))),
      handovers: db.handovers.filter((h) => h.poolId === id).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)),
      incidents: db.incidents.filter((i) => i.platformCode === p.code && i.dept === lap.dept)
    };
  }),

  listLaptops: (q: LaptopQuery): Promise<Paged<Laptop>> =>
  respond(() => {
    requireRole('SUPERVISOR');
    const list = db.laptops.
    filter((l) => !q.status || l.status === q.status).
    filter((l) => !q.platform || l.platformCode === q.platform).
    filter((l) => !q.category || l.platformCode.startsWith(`${q.category}-`)).
    filter((l) => !q.dept || l.dept === q.dept).
    filter((l) => textMatch(q.search, l.assetId, l.serial, l.workstationId, l.currentUserId, l.currentUserName));
    const counts = db.laptops.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.status]: (acc[l.status] ?? 0) + 1 }), {});
    return { ...paginate(list, q.page, q.pageSize ?? 25), counts } as Paged<Laptop> & {counts: Record<string, number>;};
  }),

  getLaptop: (assetId: string) =>
  respond(() => {
    requireRole('SUPERVISOR', 'EMPLOYEE', 'FREELANCER');
    const lap = db.laptops.find((l) => l.assetId === assetId);
    if (!lap) throw new ApiError('NOT_FOUND', `Laptop ${assetId} does not exist.`, 404);
    const hos = db.handovers.filter((h) => h.assetId === assetId);
    const incs = db.incidents.filter((i) => i.assetId === assetId);
    const history: LaptopHistoryEntry[] = [
    ...hos.map((h) => ({ at: h.receivedAt ?? h.outgoingConfirmedAt ?? h.scheduledAt, kind: 'HANDOVER' as const, title: `${h.outgoingId} → ${h.incomingId}`, detail: `${h.outgoingShift.toLowerCase()} → ${h.incomingShift.toLowerCase()} · ${h.scheduledAt.slice(0, 16).replace('T', ' ')}`, status: h.status })),
    ...incs.map((i) => ({ at: i.createdAt, kind: 'INCIDENT' as const, title: i.title, detail: `${i.id} · ${i.severity}`, status: i.status }))].
    sort((a, b) => b.at.localeCompare(a.at));
    return { laptop: lap, history, handovers: hos, incidents: incs };
  }),

  assignLaptop: (assetId: string, userId: string) =>
  respond(() => {
    const actor = requireRole('SUPERVISOR');
    const lap = db.laptops.find((l) => l.assetId === assetId);
    if (!lap) throw new ApiError('NOT_FOUND', `Laptop ${assetId} does not exist.`, 404);
    if (lap.status !== 'AVAILABLE') {
      throw new ApiError('WORKSTATION_UNAVAILABLE', `${assetId} is ${lap.status.replace('_', ' ').toLowerCase()} and cannot be assigned.`, 409, {
        laptop: assetId, platform: lap.platformCode, dept: lap.dept, currentShift: lap.currentShift ?? '—', currentUser: lap.currentUserId ?? '—', nextUser: lap.nextUserId ?? '—', handover: lap.handoverStatus ?? '—'
      });
    }
    const emp = db.employees.find((e) => e.id === userId);
    const rep = db.replacements.find((r) => r.freelancerId === userId && r.date === TODAY && (r.status === 'ASSIGNED' || r.status === 'CONFIRMED'));
    const platform = emp?.platformCode ?? rep?.platformCode;
    const dept = emp?.dept ?? rep?.dept;
    if (!platform) throw new ApiError('NOT_SCHEDULED', `${userId} has no workforce assignment today.`, 422);
    if (platform !== lap.platformCode || dept !== lap.dept) throw new ApiError('POOL_MISMATCH', `${userId} works on ${platform} / ${dept}; ${assetId} belongs to the ${lap.platformCode} / ${lap.dept} pool.`, 422);
    if (db.laptops.some((l) => l.currentUserId === userId && (l.status === 'ASSIGNED' || l.status === 'HANDOVER_PENDING'))) throw new ApiError('ALREADY_ASSIGNED', `${userId} already holds a workstation this shift.`, 409);
    lap.status = 'ASSIGNED';
    lap.currentUserId = userId;
    lap.currentUserName = emp?.name ?? rep?.freelancerName ?? userId;
    lap.currentShift = 'MORNING';
    pushAudit({ at: nowIso(), actorId: actor.userId, actorName: actor.name, role: actor.role, action: 'LAPTOP_ASSIGNMENT', entity: 'Laptop', entityId: assetId, platformCode: lap.platformCode, dept: lap.dept, previous: 'AVAILABLE', next: `ASSIGNED to ${userId} (Morning)`, reason: 'Manual allocation from pool', isOverride: false });
    return lap;
  }),

  listHandovers: (q: {date?: string;platform?: string;dept?: DeptCode | '';status?: HandoverStatus | '';}) =>
  respond(() => {
    requireRole('SUPERVISOR');
    return db.handovers.
    filter((h) => !q.date || h.scheduledAt.startsWith(q.date)).
    filter((h) => !q.platform || h.platformCode === q.platform).
    filter((h) => !q.dept || h.dept === q.dept).
    filter((h) => !q.status || h.status === q.status).
    sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }),

  getMyHandovers: () =>
  respond(() => {
    const a = requireRole('EMPLOYEE', 'FREELANCER');
    return db.handovers.
    filter((h) => (h.incomingId === a.userId || h.outgoingId === a.userId) && h.scheduledAt >= `${TODAY}T12:00:00`).
    sort((x, y) => x.scheduledAt.localeCompare(y.scheduledAt)).
    map((h) => ({ handover: h, direction: h.incomingId === a.userId ? 'INCOMING' as const : 'OUTGOING' as const, laptop: db.laptops.find((l) => l.assetId === h.assetId)! }));
  }),

  confirmOutgoing: (handoverId: string, checklist: ChecklistResult) =>
  respond(() => {
    const a = requireRole('EMPLOYEE', 'FREELANCER', 'SUPERVISOR');
    const h = db.handovers.find((x) => x.id === handoverId);
    if (!h) throw new ApiError('NOT_FOUND', 'Handover not found.', 404);
    if ((a.role === 'EMPLOYEE' || a.role === 'FREELANCER') && h.outgoingId !== a.userId) throw new ApiError('FORBIDDEN', 'Only the outgoing employee can confirm this handover.', 403);
    if (h.status !== 'PENDING') throw new ApiError('INVALID_STATE', `Handover is already ${h.status.replace('_', ' ').toLowerCase()}.`, 409);
    const prior = db.handovers.find((x) => x.assetId === h.assetId && x.incomingId === h.outgoingId && x.scheduledAt < h.scheduledAt && x.status !== 'COMPLETED' && x.scheduledAt >= `${TODAY}T00:00:00`);
    if (prior) throw new ApiError('SEQUENCE', `You must receive ${h.assetId} (handover ${prior.id}) before you can hand it over.`, 409);
    const lap = db.laptops.find((l) => l.assetId === h.assetId)!;
    const open = db.incidents.find((i) => i.assetId === h.assetId && i.status !== 'RESOLVED' && (i.severity === 'HIGH' || i.severity === 'CRITICAL'));
    if (open) throw new ApiError('HANDOVER_BLOCKED', `Workstation handover cannot be completed because incident ${open.id} is already open.`, 409, { incident: open.id });
    h.checklist = checklist;
    h.outgoingConfirmedAt = nowIso();
    if (hasIssue(checklist)) {
      const inc = createIncidentFromHandover(h, checklist, a.userId, a.name);
      h.status = 'ISSUE_REPORTED';
      h.incidentId = inc.id;
    } else {
      h.status = 'OUTGOING_CONFIRMED';
      lap.status = 'HANDOVER_PENDING';
    }
    lap.handoverStatus = h.status;
    lap.condition = checklist.laptopCondition;
    pushAudit({ at: nowIso(), actorId: a.userId, actorName: a.name, role: a.role, action: 'LAPTOP_HANDOVER', entity: 'Handover', entityId: h.id, platformCode: h.platformCode, dept: h.dept, previous: 'PENDING', next: h.status, reason: `Outgoing checklist for ${h.assetId}`, isOverride: false });
    return h;
  }),

  confirmReceipt: (handoverId: string, input: {accepted: boolean;notes: string;}) =>
  respond(() => {
    const a = requireRole('EMPLOYEE', 'FREELANCER', 'SUPERVISOR');
    const h = db.handovers.find((x) => x.id === handoverId);
    if (!h) throw new ApiError('NOT_FOUND', 'Handover not found.', 404);
    if ((a.role === 'EMPLOYEE' || a.role === 'FREELANCER') && h.incomingId !== a.userId) throw new ApiError('FORBIDDEN', 'Only the incoming employee can confirm receipt.', 403);
    if (h.status === 'PENDING') throw new ApiError('AWAITING_OUTGOING', `${h.outgoingName} has not confirmed the outgoing checklist yet.`, 409);
    if (h.status !== 'OUTGOING_CONFIRMED') throw new ApiError('INVALID_STATE', `Handover is already ${h.status.replace('_', ' ').toLowerCase()}.`, 409);
    const lap = db.laptops.find((l) => l.assetId === h.assetId)!;
    h.receivedAt = nowIso();
    if (!input.accepted) {
      const c: ChecklistResult = { ...(h.checklist as ChecklistResult), physicalDamage: true, notes: input.notes || 'Incoming employee disputed condition at receipt.' };
      const inc = createIncidentFromHandover(h, c, a.userId, a.name);
      h.status = 'ISSUE_REPORTED';
      h.incidentId = inc.id;
    } else {
      h.status = 'COMPLETED';
      lap.status = 'ASSIGNED';
      lap.currentUserId = h.incomingId;
      lap.currentUserName = h.incomingName;
      lap.currentShift = h.incomingShift;
      lap.nextUserId = h.outgoingShift === 'MORNING' ? h.outgoingId : null;
      lap.nextUserName = h.outgoingShift === 'MORNING' ? h.outgoingName : null;
      lap.nextUserNote = null;
    }
    lap.handoverStatus = h.status;
    pushAudit({ at: nowIso(), actorId: a.userId, actorName: a.name, role: a.role, action: 'LAPTOP_HANDOVER', entity: 'Handover', entityId: h.id, platformCode: h.platformCode, dept: h.dept, previous: `${h.assetId} with ${h.outgoingId}`, next: input.accepted ? `${h.assetId} received by ${h.incomingId}` : 'ISSUE_REPORTED', reason: input.notes || 'Receipt confirmed', isOverride: false });
    return h;
  }),

  listIncidents: (q: {status?: IncidentStatus | '';severity?: Severity | '';platform?: string;category?: string;dept?: DeptCode | '';search?: string;}) =>
  respond(() => {
    const a = currentAuth();
    return db.incidents.
    filter((i) => a.role === 'SUPERVISOR' ? true : i.reportedById === a.userId).
    filter((i) => !q.status || i.status === q.status).
    filter((i) => !q.severity || i.severity === q.severity).
    filter((i) => !q.platform || i.platformCode === q.platform).
    filter((i) => !q.category || i.platformCode.startsWith(`${q.category}-`)).
    filter((i) => !q.dept || i.dept === q.dept).
    filter((i) => textMatch(q.search, i.id, i.assetId, i.title, i.workstationId)).
    sort((x, y) => (x.status === 'RESOLVED' ? 1 : 0) - (y.status === 'RESOLVED' ? 1 : 0) || y.createdAt.localeCompare(x.createdAt));
  }),

  createIncident: (input: {assetId: string;category: string;severity: Severity;title: string;description: string;}) =>
  respond(() => {
    const a = currentAuth();
    const lap = db.laptops.find((l) => l.assetId === input.assetId);
    if (!lap) throw new ApiError('NOT_FOUND', `Laptop ${input.assetId} does not exist.`, 404);
    if (lap.status === 'RETIRED') throw new ApiError('RETIRED', `${input.assetId} is retired. Contact IT asset management.`, 422);
    const dup = db.incidents.find((i) => i.assetId === input.assetId && i.status !== 'RESOLVED' && i.category === input.category);
    if (dup) throw new ApiError('DUPLICATE_INCIDENT', `An open ${input.category.toLowerCase()} incident (${dup.id}) already exists for ${input.assetId}.`, 409);
    const inc: Incident = { id: db.seq.inc(), assetId: lap.assetId, workstationId: lap.workstationId, platformCode: lap.platformCode, dept: lap.dept, severity: input.severity, status: 'OPEN', category: input.category, title: input.title, description: input.description, reportedById: a.userId, reportedByName: a.name, createdAt: nowIso(), updatedAt: nowIso(), handoverId: null };
    db.incidents.unshift(inc);
    lap.openIncidentId = inc.id;
    if (input.severity === 'HIGH' || input.severity === 'CRITICAL') {
      lap.status = 'INCIDENT';
      lap.condition = 'DAMAGED';
    }
    db.notifications.unshift({ id: db.seq.ntf(), type: 'LAPTOP_INCIDENT', title: `Incident ${inc.id} · ${lap.platformCode} / ${lap.dept}`, body: inc.title, createdAt: nowIso(), read: false, emailStatus: 'SENT', link: '/incidents', recipientRoles: ['SUPERVISOR'], recipientId: null });
    pushAudit({ at: nowIso(), actorId: a.userId, actorName: a.name, role: a.role, action: 'INCIDENT_CREATED', entity: 'Incident', entityId: inc.id, platformCode: lap.platformCode, dept: lap.dept, previous: '—', next: `OPEN · ${inc.severity}`, reason: inc.title, isOverride: false });
    return inc;
  }),

  updateIncidentStatus: (id: string, status: IncidentStatus, note: string) =>
  respond(() => {
    const a = requireRole('SUPERVISOR');
    const inc = db.incidents.find((i) => i.id === id);
    if (!inc) throw new ApiError('NOT_FOUND', `Incident ${id} does not exist.`, 404);
    const prev = inc.status;
    inc.status = status;
    inc.updatedAt = nowIso();
    const lap = db.laptops.find((l) => l.assetId === inc.assetId);
    if (status === 'RESOLVED' && lap && lap.openIncidentId === id) {
      lap.openIncidentId = null;
      if (lap.status === 'INCIDENT') {
        lap.status = 'AVAILABLE';
        lap.condition = 'GOOD';
      }
    }
    pushAudit({ at: nowIso(), actorId: a.userId, actorName: a.name, role: a.role, action: 'INCIDENT_STATUS_CHANGE', entity: 'Incident', entityId: id, platformCode: inc.platformCode, dept: inc.dept, previous: prev, next: status, reason: note || 'Status updated', isOverride: false });
    return inc;
  })
};