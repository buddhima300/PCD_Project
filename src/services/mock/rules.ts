// Mock BACKEND business rules. In production these live server-side; the UI never imports this file.
import { parseISO } from 'date-fns';
import type { AvailabilityState, Candidate, DeptCode, EntityStatus, Replacement, ShiftCode, TimelineStep } from '../../types/domain';

export interface FreelancerRecord {
  uuid: string;
  id: string;
  name: string;
  email: string;
  phone: string;
  dept: DeptCode;
  priority: number;
  status: EntityStatus;
  accountStatus: 'ACTIVE' | 'LOCKED' | 'INVITED';
  compatibleCategories: string[];
  joinedAt: string;
  employmentType?: 'PERMANENT' | 'PART_TIME' | 'EXTERNAL';
  lifecycle?: string;
  qualifiedForProduction?: boolean;
  compatiblePlatforms?: string[];
  currentAssignmentId?: string | null;
  currentPlatform?: string | null;
  positionCode?: string;
}

export type AvailabilityMap = Record<string, Record<string, Record<ShiftCode, AvailabilityState>>>;

export const OFFDAY_GROUP_LIMIT = 2;
export const OFFDAY_MONTHLY_ALLOWANCE = 4;
export const WORKLOAD_LIMIT = 2;
export const PLANNED_LEAD_DAYS = 7;

const DAY_MS = 24 * 3600 * 1000;

export function evaluateCandidates(
rep: Pick<Replacement, 'id' | 'dept' | 'categoryCode' | 'date' | 'shift' | 'shiftStart' | 'freelancerId'>,
freelancers: FreelancerRecord[],
availability: AvailabilityMap,
replacements: Replacement[])
: Candidate[] {
  const startMs = parseISO(rep.shiftStart).getTime();
  const active = replacements.filter(
    (x) => x.id !== rep.id && x.freelancerId && (x.status === 'ASSIGNED' || x.status === 'CONFIRMED')
  );
  return freelancers.
  filter((f) => f.dept === rep.dept).
  sort((a, b) => a.priority - b.priority).
  map((f) => {
    const av: AvailabilityState = availability[f.id]?.[rep.date]?.[rep.shift] ?? 'UNAVAILABLE';
    const mine = active.filter((x) => x.freelancerId === f.id);
    const conflict = mine.find((x) => x.date === rep.date && x.shift === rep.shift);
    const inWindow = mine.filter((x) => Math.abs(parseISO(x.shiftStart).getTime() - startMs) < DAY_MS).length;
    const assignedHere = rep.freelancerId === f.id;
    const availableOk = av === 'AVAILABLE' || assignedHere && av === 'ASSIGNED';
    const compatible = f.compatibleCategories.includes(rep.categoryCode);
    const checks: Candidate['checks'] = [
    { key: 'department', label: `Same department (${rep.dept})`, passed: true },
    {
      key: 'platform',
      label: compatible ? `Cleared for ${rep.categoryCode} platforms` : `Not cleared for ${rep.categoryCode} platforms`,
      passed: compatible
    },
    {
      key: 'availability',
      label: availableOk ? `Available for ${rep.shift.toLowerCase()} shift` : `Availability: ${av.toLowerCase()}`,
      passed: availableOk
    },
    {
      key: 'conflict',
      label: conflict ? `Conflicts with ${conflict.id}` : 'No assignment conflict',
      passed: !conflict
    },
    {
      key: 'workload',
      label: inWindow >= WORKLOAD_LIMIT ? 'Workload limit reached (2 / 2 shifts in 24h)' : `Workload ${inWindow + 1} / ${WORKLOAD_LIMIT} shifts after assignment`,
      passed: inWindow < WORKLOAD_LIMIT
    },
    {
      key: 'account',
      label: f.status === 'ACTIVE' && f.accountStatus === 'ACTIVE' ? 'Active account' : 'Account not active',
      passed: f.status === 'ACTIVE' && f.accountStatus === 'ACTIVE'
    }];

    return {
      freelancerId: f.id,
      name: f.name,
      priority: f.priority,
      eligible: checks.every((c) => c.passed) && f.qualifiedForProduction !== false && f.lifecycle !== 'IN_PLATFORM_TRAINING',
      selected: false,
      availability: av,
      workloadUsed: inWindow,
      workloadLimit: WORKLOAD_LIMIT,
      checks
    };
  });
}

export function summarizeFailures(candidates: Candidate[], otherDeptCount: number): string[] {
  const reasons: string[] = [];
  const count = (key: Candidate['checks'][number]['key']) =>
  candidates.filter((c) => c.checks.some((k) => k.key === key && !k.passed)).length;
  if (candidates.length === 0) reasons.push('No freelancer exists in this department');
  const av = count('availability');
  if (av) reasons.push(`No freelancer available — ${av} unavailable for this date and shift`);
  const pl = count('platform');
  if (pl) reasons.push(`Platform incompatibility — ${pl} not cleared for this platform category`);
  if (otherDeptCount) reasons.push(`Department mismatch — ${otherDeptCount} freelancers excluded from other departments`);
  const cf = count('conflict');
  if (cf) reasons.push(`Existing assignment — ${cf} already assigned to this shift`);
  const wl = count('workload');
  if (wl) reasons.push(`Workload limit reached — ${wl} at 2 / 2 shifts in rolling 24h`);
  const ac = count('account');
  if (ac) reasons.push(`Inactive account — ${ac} freelancers`);
  return reasons;
}

export function buildTimeline(rep: Replacement): TimelineStep[] {
  const order = ['reported', 'search', 'validated', 'priority', 'assigned', 'workstation', 'notified', 'roster', 'confirmed'];
  const labels: Record<string, string> = {
    reported: 'Absence recorded',
    search: rep.type === 'PLANNED' ? 'Planned search initiated (7 days before shift)' : 'Emergency search initiated immediately',
    validated: 'Eligibility validated',
    priority: 'Manager-defined priority applied',
    assigned: 'Freelancer assigned',
    workstation: 'Workstation allocated from pool',
    notified: 'Freelancer and manager notified',
    roster: 'Roster updated · audit recorded',
    confirmed: 'Freelancer confirmed assignment'
  };
  const doneThrough: Record<string, number> = {
    PENDING: 0,
    SEARCHING: 1,
    FAILED: 2,
    ASSIGNED: 7,
    CONFIRMED: 8,
    CANCELLED: 0
  };
  const last = doneThrough[rep.status];
  const eligibleCount = rep.candidates.filter((c) => c.eligible).length;
  return order.map((key, i) => {
    let state: TimelineStep['state'] = i <= last ? 'done' : i === last + 1 ? 'current' : 'upcoming';
    let detail: string | undefined;
    if (rep.status === 'FAILED' && key === 'validated') {
      state = 'failed';
      detail = 'No eligible freelancer found';
    }
    if (rep.status === 'FAILED' && i > 2) state = 'upcoming';
    if (rep.status === 'CANCELLED' && i > 0) state = 'upcoming';
    if (rep.status === 'PENDING' && key === 'search') detail = `Scheduled for ${rep.initiatedAt.slice(0, 10)}`;
    if (key === 'validated' && state === 'done') detail = `${eligibleCount} of ${rep.candidates.length} candidates eligible`;
    if (key === 'priority' && state === 'done' && rep.freelancerPriority) detail = `Priority ${rep.freelancerPriority} selected`;
    if (key === 'assigned' && state === 'done' && rep.freelancerId) detail = `${rep.freelancerId} · ${rep.freelancerName}`;
    if (key === 'workstation' && state === 'done' && rep.workstationId) detail = rep.workstationId;
    return {
      key,
      label: labels[key],
      state,
      at: key === 'reported' ? rep.createdAt : key === 'search' && state === 'done' ? rep.initiatedAt : undefined,
      detail
    };
  });
}