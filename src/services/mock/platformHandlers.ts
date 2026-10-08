import { TODAY, SERVER_NOW } from '../../utils/clock';
import type { AuditEntry, CategorySummary, DeptCapacity, DeptCode, EntityStatus, PlatformSummary, PoolSummary } from '../../types/domain';
import { ApiError, currentAuth, requireRole, respond } from './core';
import { DEPT_ORDER, db, poolIdOf, pushAudit, wsIdOf } from './db';
import { groupCountMap, poolSummary, summarizePlatform, textMatch } from './selectors';
import { format } from 'date-fns';

export interface PlatformQuery {
  category?: string;
  status?: string;
  search?: string;
  dept?: DeptCode | '';
  opStatus?: string;
  sort?: 'code' | 'workstations' | 'incidents' | 'available';
}

const catOrder = (c: string) => db.categories.findIndex((x) => x.code === c);
const numOf = (code: string) => Number(code.split('-')[1]);

export function listPlatformSummaries(q: PlatformQuery = {}): PlatformSummary[] {
  const counts = groupCountMap();
  let list = db.platforms.
  filter((p) => !q.category || p.categoryCode === q.category).
  filter((p) => !q.status || p.status === q.status).
  filter((p) => !q.dept || Boolean(p.departments[q.dept])).
  filter((p) => textMatch(q.search, p.code, p.id)).
  map((p) => summarizePlatform(p, counts));
  if (q.opStatus) list = list.filter((p) => p.opStatus === q.opStatus);
  list.sort((a, b) => {
    if (q.sort === 'workstations') return b.totalWorkstations - a.totalWorkstations;
    if (q.sort === 'incidents') return b.activeIncidents - a.activeIncidents;
    if (q.sort === 'available') return b.availableWorkstations - a.availableWorkstations;
    return catOrder(a.categoryCode) - catOrder(b.categoryCode) || numOf(a.code) - numOf(b.code);
  });
  return list;
}

export function categorySummaries(): CategorySummary[] {
  const all = listPlatformSummaries();
  return db.categories.map((c) => {
    const ps = all.filter((p) => p.categoryCode === c.code);
    return {
      ...c,
      platformCount: ps.length,
      activePlatforms: ps.filter((p) => p.status === 'ACTIVE').length,
      totalWorkstations: ps.reduce((s, p) => s + p.totalWorkstations, 0),
      assignedWorkforce: ps.reduce((s, p) => s + p.morningWorkforce + p.nightWorkforce, 0),
      activeIncidents: ps.reduce((s, p) => s + p.activeIncidents, 0)
    };
  });
}

export const platformApi = {
  listCategories: () => respond(() => categorySummaries()),

  getCategory: (code: string) =>
  respond(() => {
    const cat = categorySummaries().find((c) => c.code === code);
    if (!cat) throw new ApiError('NOT_FOUND', `Platform category ${code} does not exist.`, 404);
    return { category: cat, platforms: listPlatformSummaries({ category: code }) };
  }),

  listPlatforms: (q: PlatformQuery) => respond(() => listPlatformSummaries(q)),

  getPlatform: (code: string) =>
  respond(() => {
    const p = db.platforms.find((x) => x.code === code);
    if (!p) throw new ApiError('NOT_FOUND', `Platform ${code} does not exist.`, 404);
    const pools: PoolSummary[] = DEPT_ORDER.filter((d) => p.departments[d]).map((d) => poolSummary(p, d));
    return { platform: summarizePlatform(p), pools };
  }),

  getConfigHistory: (code: string): Promise<AuditEntry[]> =>
  respond(() => {
    requireRole('SUPERVISOR');
    return db.audit.filter((a) => a.platformCode === code && (a.entity === 'PlatformConfig' || a.entity === 'Platform'));
  }),

  updatePlatformConfig: (code: string, input: {departments: DeptCapacity;status: EntityStatus;reason: string;}) =>
  respond(() => {
    const actor = requireRole('SUPERVISOR');
    const p = db.platforms.find((x) => x.code === code);
    if (!p) throw new ApiError('NOT_FOUND', `Platform ${code} does not exist.`, 404);
    if (!input.reason || input.reason.trim().length < 5) throw new ApiError('VALIDATION', 'A change reason of at least 5 characters is required for audit.', 422);
    const changes: string[] = [];
    for (const d of DEPT_ORDER) {
      const before = p.departments[d] ?? 0;
      const after = input.departments[d] ?? 0;
      if (before === after) continue;
      const assigned = Math.max(
        db.employees.filter((e) => e.platformCode === code && e.dept === d && e.shift === 'MORNING').length,
        db.employees.filter((e) => e.platformCode === code && e.dept === d && e.shift === 'NIGHT').length
      );
      if (after < assigned) {
        throw new ApiError('CAPACITY_BELOW_ASSIGNMENT', `${code} / ${d} has ${assigned} employees assigned per shift. Capacity cannot be reduced below ${assigned}.`, 409, { platform: code, dept: d, assigned });
      }
      const poolId = poolIdOf(code, d);
      const laps = db.laptops.filter((l) => l.poolId === poolId && l.workstationId && l.status !== 'RETIRED');
      if (after < before) {
        const removable = laps.slice(after);
        if (removable.some((l) => l.status !== 'AVAILABLE' && l.status !== 'MAINTENANCE')) {
          throw new ApiError('WORKSTATION_IN_USE', `Cannot remove workstations from ${code} / ${d} while they are assigned or pending handover.`, 409);
        }
        removable.forEach((l) => {
          l.status = 'RETIRED';
          l.workstationId = null;
        });
      } else {
        for (let slot = laps.length + 1; slot <= after; slot++) {
          db.laptops.push({
            assetId: db.seq.lap(), serial: `PFN${Math.floor(Math.random() * 99999)}`, model: 'Lenovo ThinkPad T14 Gen 5',
            workstationId: wsIdOf(code, d, slot), poolId, platformCode: code, dept: d, status: 'AVAILABLE', currentUserId: null,
            currentUserName: null, currentShift: null, nextUserId: null, nextUserName: null, nextUserNote: null, condition: 'GOOD',
            handoverStatus: null, openIncidentId: null, purchasedAt: TODAY
          });
        }
      }
      changes.push(`${d} ${before || 'off'} → ${after || 'off'}`);
      pushAudit({ at: format(SERVER_NOW, "yyyy-MM-dd'T'HH:mm:ss"), actorId: actor.userId, actorName: actor.name, role: actor.role, action: 'PLATFORM_CONFIG_CHANGE', entity: 'PlatformConfig', entityId: p.id, platformCode: code, dept: d, previous: before ? `${d} capacity ${before}` : `${d} not operating`, next: after ? `${d} capacity ${after}` : `${d} not operating`, reason: input.reason, isOverride: false });
    }
    if (input.status !== p.status) {
      pushAudit({ at: format(SERVER_NOW, "yyyy-MM-dd'T'HH:mm:ss"), actorId: actor.userId, actorName: actor.name, role: actor.role, action: 'PLATFORM_STATUS_CHANGE', entity: 'Platform', entityId: p.id, platformCode: code, dept: null, previous: p.status, next: input.status, reason: input.reason, isOverride: false });
      changes.push(`status ${p.status} → ${input.status}`);
      p.status = input.status;
    }
    if (!changes.length) throw new ApiError('NO_CHANGES', 'No configuration changes were submitted.', 422);
    const next: DeptCapacity = {};
    for (const d of DEPT_ORDER) if (input.departments[d]) next[d] = input.departments[d];
    p.departments = next;
    p.updatedAt = TODAY;
    db.notifications.unshift({ id: db.seq.ntf(), type: 'PLATFORM_CONFIG_CHANGED', title: `${code} configuration updated`, body: `${changes.join(', ')} by ${currentAuth().name}.`, createdAt: format(SERVER_NOW, "yyyy-MM-dd'T'HH:mm:ss"), read: false, emailStatus: 'SENT', link: `/platforms/${code}`, recipientRoles: ['SUPERVISOR'], recipientId: null });
    return summarizePlatform(p);
  })
};