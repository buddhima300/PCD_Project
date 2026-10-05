import type { ReportKey } from '../../data/reports';
import { TODAY } from '../../utils/clock';
import type { DeptCode, ShiftCode } from '../../types/domain';
import { requireRole, respond } from './core';
import { DEPT_ORDER, db, plusDays } from './db';
import { listPlatformSummaries } from './platformHandlers';
import { allPools, groupCountMap, isApproved } from './selectors';

export interface ReportFilters {
  category?: string;
  platform?: string;
  dept?: DeptCode | '';
  shift?: ShiftCode | '';
  from?: string;
  to?: string;
}

export interface ReportResult {
  columns: string[];
  rows: Array<Array<string | number>>;
  generatedAt: string;
}

type Row = Array<string | number>;

function build(key: ReportKey, f: ReportFilters): {columns: string[];rows: Row[];} {
  const inCat = (code: string) => (!f.category || code.startsWith(`${f.category}-`)) && (!f.platform || code === f.platform);
  const inDept = (d: DeptCode) => !f.dept || f.dept === d;
  const inShift = (s: ShiftCode) => !f.shift || f.shift === s;
  const inRange = (date: string) => (!f.from || date >= f.from) && (!f.to || date <= f.to);
  const emps = db.employees.filter((e) => inCat(e.platformCode) && inDept(e.dept) && inShift(e.shift));
  switch (key) {
    case 'workforce-summary':
      return {
        columns: ['Category', 'Permanent', 'Active', 'On leave', 'Locked accounts'],
        rows: db.categories.filter((c) => !f.category || c.code === f.category).map((c) => {
          const list = emps.filter((e) => e.categoryCode === c.code);
          return [c.code, list.length, list.filter((e) => e.status === 'ACTIVE').length, list.filter((e) => e.status === 'ON_LEAVE').length, list.filter((e) => e.accountStatus !== 'ACTIVE').length];
        })
      };
    case 'platform-workforce':
      return {
        columns: ['Platform', 'Category', 'Required / shift', 'Morning', 'Night', 'Gap'],
        rows: listPlatformSummaries({ category: f.category }).filter((p) => inCat(p.code) && p.status === 'ACTIVE').map((p) => [p.code, p.categoryCode, p.totalWorkstations, p.morningWorkforce, p.nightWorkforce, p.requiredWorkforce - p.morningWorkforce - p.nightWorkforce])
      };
    case 'platform-capacity':
      return {
        columns: ['Platform', 'Department', 'Capacity', 'Occupied now', 'Available', 'Handover pending'],
        rows: listPlatformSummaries({ category: f.category }).filter((p) => inCat(p.code)).flatMap((p) => p.occupancy.filter((o) => inDept(o.dept)).map((o) => [p.code, o.dept, o.capacity, o.occupiedNow, o.available, o.handoverPending]))
      };
    case 'department-workforce':
      return {
        columns: ['Department', 'Permanent', 'Morning', 'Night', 'Freelancers (active)'],
        rows: DEPT_ORDER.filter(inDept).map((d) => [d, emps.filter((e) => e.dept === d).length, emps.filter((e) => e.dept === d && e.shift === 'MORNING').length, emps.filter((e) => e.dept === d && e.shift === 'NIGHT').length, db.freelancers.filter((x) => x.dept === d && x.status === 'ACTIVE').length])
      };
    case 'shift-distribution':
      return {
        columns: ['Category', 'Morning', 'Night', 'Morning share'],
        rows: db.categories.filter((c) => !f.category || c.code === f.category).map((c) => {
          const m = emps.filter((e) => e.categoryCode === c.code && e.shift === 'MORNING').length;
          const n = emps.filter((e) => e.categoryCode === c.code && e.shift === 'NIGHT').length;
          return [c.code, m, n, m + n ? `${Math.round(m / (m + n) * 100)}%` : '—'];
        })
      };
    case 'monthly-roster':{
        const month = (f.from ?? TODAY).slice(0, 7);
        const off = db.offDays.filter((o) => isApproved(o.status) && o.date.startsWith(month));
        const reps = db.replacements.filter((r) => r.date.startsWith(month) && r.status !== 'CANCELLED');
        return {
          columns: ['Platform', 'Employees', 'Off-days', 'Absences', 'Replaced', 'Unfilled'],
          rows: listPlatformSummaries({ category: f.category }).filter((p) => inCat(p.code) && p.status === 'ACTIVE').map((p) => {
            const pr = reps.filter((r) => r.platformCode === p.code && inDept(r.dept));
            return [p.code, emps.filter((e) => e.platformCode === p.code).length, off.filter((o) => o.platformCode === p.code && inDept(o.dept)).length, pr.length, pr.filter((r) => r.freelancerId).length, pr.filter((r) => !r.freelancerId).length];
          })
        };
      }
    case 'platform-roster':
      return {
        columns: ['Platform', 'Department', 'Shift', 'Capacity', 'Rostered'],
        rows: listPlatformSummaries({ category: f.category }).filter((p) => inCat(p.code) && p.status === 'ACTIVE').flatMap((p) =>
        p.occupancy.filter((o) => inDept(o.dept)).flatMap((o) => (['MORNING', 'NIGHT'] as ShiftCode[]).filter(inShift).map((s) => [p.code, o.dept, s, o.capacity, s === 'MORNING' ? o.morning : o.night]))
        )
      };
    case 'offday-utilization':
      return {
        columns: ['Platform', 'Department', 'Employees', 'Off-days used (Sep)', 'Allowance', 'Utilisation'],
        rows: listPlatformSummaries({ category: f.category }).filter((p) => inCat(p.code) && p.status === 'ACTIVE').flatMap((p) =>
        p.occupancy.filter((o) => inDept(o.dept)).map((o) => {
          const list = emps.filter((e) => e.platformCode === p.code && e.dept === o.dept);
          const used = list.reduce((s, e) => s + e.offDaysUsed, 0);
          return [p.code, o.dept, list.length, used, list.length * 4, list.length ? `${Math.round(used / (list.length * 4) * 100)}%` : '—'];
        })
        )
      };
    case 'offday-conflicts':{
        const counts = groupCountMap();
        const rows: Row[] = [];
        counts.forEach((n, k) => {
          const [p, d, date] = k.split('|');
          if (n >= 2 && inCat(p) && inDept(d as DeptCode) && inRange(date)) rows.push([date, p, d, `${n} / 2`, n > 2 ? 'CONFLICT (override)' : 'FULL']);
        });
        return { columns: ['Date', 'Platform', 'Department', 'Approved', 'State'], rows: rows.sort((a, b) => String(a[0]).localeCompare(String(b[0]))) };
      }
    case 'freelancer-availability':{
        const dates = Array.from({ length: 14 }, (_, i) => plusDays(TODAY, i));
        return {
          columns: ['Freelancer', 'Department', 'Priority', 'Available shifts (14d)', 'Assigned shifts (14d)', 'Status'],
          rows: db.freelancers.filter((x) => inDept(x.dept)).map((x) => {
            let av = 0;
            let as = 0;
            dates.forEach((d) => (['MORNING', 'NIGHT'] as ShiftCode[]).filter(inShift).forEach((s) => {
              const v = db.availability[x.id]?.[d]?.[s];
              if (v === 'AVAILABLE') av++;
              if (v === 'ASSIGNED') as++;
            }));
            return [x.id, x.dept, x.priority, av, as, x.status];
          })
        };
      }
    case 'replacement-history':
      return {
        columns: ['Replacement', 'Date', 'Shift', 'Platform', 'Department', 'Absent employee', 'Freelancer', 'Type', 'Status'],
        rows: db.replacements.filter((r) => inCat(r.platformCode) && inDept(r.dept) && inShift(r.shift) && inRange(r.date)).map((r) => [r.id, r.date, r.shift, r.platformCode, r.dept, r.absentEmployeeId, r.freelancerId ?? '—', r.type, r.status])
      };
    case 'replacement-stats':
      return {
        columns: ['Department', 'Total', 'Planned', 'Emergency', 'Filled', 'Failed', 'Cancelled'],
        rows: DEPT_ORDER.filter(inDept).map((d) => {
          const list = db.replacements.filter((r) => r.dept === d && inCat(r.platformCode) && inRange(r.date));
          return [d, list.length, list.filter((r) => r.type === 'PLANNED').length, list.filter((r) => r.type === 'EMERGENCY').length, list.filter((r) => r.freelancerId).length, list.filter((r) => r.status === 'FAILED').length, list.filter((r) => r.status === 'CANCELLED').length];
        })
      };
    case 'pool-utilization':
      return {
        columns: ['Pool', 'Platform', 'Department', 'Capacity', 'Occupied', 'Available', 'Maintenance', 'Incidents'],
        rows: allPools().filter((p) => inCat(p.platformCode) && inDept(p.dept)).map((p) => [p.id, p.platformCode, p.dept, p.capacity, p.occupied, p.available, p.maintenance, p.incidents])
      };
    case 'laptop-inventory':
      return {
        columns: ['Asset ID', 'Serial', 'Model', 'Workstation', 'Platform', 'Department', 'Status', 'Condition'],
        rows: db.laptops.filter((l) => inCat(l.platformCode) && inDept(l.dept)).map((l) => [l.assetId, l.serial, l.model, l.workstationId ?? '—', l.platformCode, l.dept, l.status, l.condition])
      };
    case 'laptop-assignment-history':
      return {
        columns: ['Received at', 'Asset ID', 'Workstation', 'Employee', 'Shift', 'Platform', 'Department'],
        rows: db.handovers.filter((h) => h.receivedAt && inCat(h.platformCode) && inDept(h.dept) && inShift(h.incomingShift) && inRange(h.scheduledAt.slice(0, 10))).map((h) => [h.receivedAt!.replace('T', ' ').slice(0, 16), h.assetId, h.workstationId, h.incomingId, h.incomingShift, h.platformCode, h.dept])
      };
    case 'handover-history':
      return {
        columns: ['Scheduled', 'Handover', 'Asset ID', 'Platform', 'Department', 'Outgoing', 'Incoming', 'Status'],
        rows: db.handovers.filter((h) => inCat(h.platformCode) && inDept(h.dept) && inRange(h.scheduledAt.slice(0, 10))).map((h) => [h.scheduledAt.replace('T', ' ').slice(0, 16), h.id, h.assetId, h.platformCode, h.dept, h.outgoingId, h.incomingId, h.status])
      };
    case 'laptop-incidents':
      return {
        columns: ['Incident', 'Created', 'Asset ID', 'Category', 'Severity', 'Status', 'Reported by'],
        rows: db.incidents.filter((i) => inCat(i.platformCode) && inDept(i.dept) && inRange(i.createdAt.slice(0, 10))).map((i) => [i.id, i.createdAt.replace('T', ' ').slice(0, 16), i.assetId, i.category, i.severity, i.status, i.reportedById])
      };
    case 'platform-incidents':
      return {
        columns: ['Platform', 'Open', 'In progress', 'Resolved', 'High / critical open'],
        rows: db.platforms.filter((p) => inCat(p.code)).map((p) => {
          const list = db.incidents.filter((i) => i.platformCode === p.code && inDept(i.dept));
          return [p.code, list.filter((i) => i.status === 'OPEN').length, list.filter((i) => i.status === 'IN_PROGRESS').length, list.filter((i) => i.status === 'RESOLVED').length, list.filter((i) => i.status !== 'RESOLVED' && (i.severity === 'HIGH' || i.severity === 'CRITICAL')).length];
        })
      };
    case 'audit-activity':{
        const map = new Map<string, {n: number;o: number;}>();
        db.audit.filter((a) => (!a.platformCode || inCat(a.platformCode)) && inRange(a.at.slice(0, 10))).forEach((a) => {
          const v = map.get(a.action) ?? { n: 0, o: 0 };
          v.n++;
          if (a.isOverride) v.o++;
          map.set(a.action, v);
        });
        return { columns: ['Action', 'Events', 'Manager overrides'], rows: [...map.entries()].map(([k, v]) => [k, v.n, v.o]).sort((a, b) => Number(b[1]) - Number(a[1])) };
      }
  }
}

export const reportApi = {
  getReport: (key: ReportKey, f: ReportFilters): Promise<ReportResult> =>
  respond(() => {
    const a = requireRole('ADMIN', 'MANAGER');
    if (key === 'audit-activity' && a.role !== 'ADMIN') requireRole('ADMIN');
    return { ...build(key, f), generatedAt: `${TODAY}T18:52:00` };
  })
};