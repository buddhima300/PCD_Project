import { TODAY } from '../../utils/clock';
import type { CapacityState, DeptCode, Employee, Freelancer, Platform, PlatformSummary, PoolSummary } from '../../types/domain';
import { DEPT_ORDER, EmployeeRecord, db, plusDays, poolIdOf } from './db';
import { OFFDAY_GROUP_LIMIT, WORKLOAD_LIMIT, FreelancerRecord } from './rules';
import { parseISO } from 'date-fns';
import { SERVER_NOW } from '../../utils/clock';

export const isApproved = (s: string) => s === 'APPROVED' || s === 'OVERRIDE_APPROVED';

export function groupCountMap(): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of db.offDays) {
    if (!isApproved(o.status)) continue;
    const k = `${o.platformCode}|${o.dept}|${o.date}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function capacityState(approved: number): CapacityState {
  if (approved > OFFDAY_GROUP_LIMIT) return 'CONFLICT';
  if (approved === OFFDAY_GROUP_LIMIT) return 'FULL';
  if (approved > 0) return 'PARTIAL';
  return 'AVAILABLE';
}

export function poolSummary(platform: Platform, dept: DeptCode): PoolSummary {
  const id = poolIdOf(platform.code, dept);
  const laps = db.laptops.filter((l) => l.poolId === id && l.status !== 'RETIRED' && l.workstationId);
  return {
    id,
    platformCode: platform.code,
    categoryCode: platform.categoryCode,
    dept,
    capacity: platform.departments[dept] ?? 0,
    occupied: laps.filter((l) => l.status === 'ASSIGNED' || l.status === 'HANDOVER_PENDING').length,
    available: laps.filter((l) => l.status === 'AVAILABLE').length,
    handoverPending: laps.filter((l) => l.status === 'HANDOVER_PENDING').length,
    maintenance: laps.filter((l) => l.status === 'MAINTENANCE').length,
    incidents: db.incidents.filter((i) => i.platformCode === platform.code && i.dept === dept && i.status !== 'RESOLVED').length,
    platformStatus: platform.status
  };
}

export function allPools(): PoolSummary[] {
  const out: PoolSummary[] = [];
  for (const p of db.platforms) for (const d of DEPT_ORDER) if (p.departments[d]) out.push(poolSummary(p, d));
  return out;
}

export function summarizePlatform(p: Platform, counts = groupCountMap()): PlatformSummary {
  const emps = db.employees.filter((e) => e.platformCode === p.code);
  const occupancy = DEPT_ORDER.filter((d) => p.departments[d]).map((d) => {
    const pool = poolSummary(p, d);
    return {
      dept: d,
      poolId: pool.id,
      capacity: pool.capacity,
      morning: emps.filter((e) => e.dept === d && e.shift === 'MORNING').length,
      night: emps.filter((e) => e.dept === d && e.shift === 'NIGHT').length,
      occupiedNow: pool.occupied,
      available: pool.available,
      handoverPending: pool.handoverPending
    };
  });
  const total = occupancy.reduce((s, o) => s + o.capacity, 0);
  const incidents = db.incidents.filter((i) => i.platformCode === p.code && i.status !== 'RESOLVED');
  const pendingReplacements = db.replacements.filter(
    (x) => x.platformCode === p.code && x.date >= TODAY && ['PENDING', 'SEARCHING', 'FAILED'].includes(x.status)
  ).length;
  const pendingHandovers = db.handovers.filter(
    (h) => h.platformCode === p.code && h.scheduledAt.startsWith(TODAY) && ['PENDING', 'OUTGOING_CONFIRMED', 'ISSUE_REPORTED'].includes(h.status)
  ).length;
  let offDayAlerts = 0;
  for (let i = 0; i < 14; i++) {
    const date = plusDays(TODAY, i);
    for (const o of occupancy) if ((counts.get(`${p.code}|${o.dept}|${date}`) ?? 0) >= OFFDAY_GROUP_LIMIT) offDayAlerts++;
  }
  const occupiedNow = occupancy.reduce((s, o) => s + o.occupiedNow, 0);
  const understaffed = occupancy.some((o) => o.morning < o.capacity || o.night < o.capacity);
  const failed = db.replacements.some((x) => x.platformCode === p.code && x.date >= TODAY && x.status === 'FAILED');
  const opStatus: PlatformSummary['opStatus'] =
  p.status !== 'ACTIVE' ?
  'INACTIVE' :
  incidents.some((i) => i.severity === 'HIGH' || i.severity === 'CRITICAL') ?
  'INCIDENT' :
  failed || understaffed && pendingReplacements > 0 ?
  'WARNING' :
  occupiedNow >= total ?
  'FULL' :
  'OPERATIONAL';
  return {
    ...p,
    totalWorkstations: total,
    requiredWorkforce: total * 2,
    morningWorkforce: occupancy.reduce((s, o) => s + o.morning, 0),
    nightWorkforce: occupancy.reduce((s, o) => s + o.night, 0),
    currentWorkforce: occupiedNow,
    availableWorkstations: occupancy.reduce((s, o) => s + o.available, 0),
    activeIncidents: incidents.length,
    pendingReplacements,
    pendingHandovers,
    offDayAlerts,
    occupancy,
    opStatus
  };
}

export function toEmployee(e: EmployeeRecord): Employee {
  const { slot: _slot, ...rest } = e;
  return {
    ...rest,
    lifecycle: e.lifecycle ?? 'PRODUCTION_ACTIVE',
    qualifiedForProduction: e.qualifiedForProduction ?? true
  };
}

export function toFreelancer(f: FreelancerRecord): Freelancer {
  const nowMs = SERVER_NOW.getTime();
  const mine = db.replacements.filter((x) => x.freelancerId === f.id && (x.status === 'ASSIGNED' || x.status === 'CONFIRMED'));
  const current = mine.
  filter((x) => parseISO(x.shiftEnd).getTime() > nowMs).
  sort((a, b) => a.shiftStart.localeCompare(b.shiftStart))[0];
  const workload = mine.filter((x) => Math.abs(parseISO(x.shiftStart).getTime() - nowMs) < 24 * 3600e3).length;
  const today = db.availability[f.id]?.[TODAY];
  return {
    ...f,
    employmentType: f.employmentType ?? 'EXTERNAL',
    lifecycle: (f.lifecycle as any) ?? 'PRODUCTION_ACTIVE',
    qualifiedForProduction: f.qualifiedForProduction ?? true,
    currentAssignmentId: current?.id ?? null,
    currentPlatform: current?.platformCode ?? null,
    workloadUsed: workload,
    workloadLimit: WORKLOAD_LIMIT,
    todayMorning: today?.MORNING ?? 'UNAVAILABLE',
    todayNight: today?.NIGHT ?? 'UNAVAILABLE'
  };
}

export function paginate<T>(items: T[], page = 1, pageSize = 25) {
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize };
}

export function textMatch(q: string | undefined, ...fields: Array<string | null | undefined>): boolean {
  if (!q) return true;
  const s = q.toLowerCase();
  return fields.some((f) => f && f.toLowerCase().includes(s));
}