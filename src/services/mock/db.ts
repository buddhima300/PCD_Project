// Mock backend database. Deterministically seeded so every reload shows the same operational state.
import { addDays, format, parseISO } from 'date-fns';
import { categorySeeds, firstNames, incidentCategories, laptopModels, lastNames, platformSeeds, positionsByDept } from '../../data/reference';
import { TODAY } from '../../utils/clock';
import type {
  AuditEntry,
  AvailabilityState,
  DeptCode,
  Employee,
  Handover,
  Incident,
  Laptop,
  LaptopStatus,
  NotificationItem,
  OffDayRequest,
  Platform,
  PlatformCategory,
  Replacement,
  ReplacementStatus,
  ReplacementType,
  RotationCycle,
  ShiftCode,
  RecruitCandidate,
  PlatformWorkforcePosition,
  PlatformDemand,
  PlatformTrainingAssignment } from
'../../types/domain';
import { AvailabilityMap, FreelancerRecord, OFFDAY_GROUP_LIMIT, buildTimeline, evaluateCandidates, summarizeFailures } from './rules';

export interface EmployeeRecord extends Employee {
  slot: number;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const r = mulberry32(20260925);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
export const pad = (n: number, w: number) => String(n).padStart(w, '0');
export const compactCode = (c: string) => c.replace('-', '');
export const poolIdOf = (p: string, d: DeptCode) => `POOL-${compactCode(p)}-${d}`;
export const wsIdOf = (p: string, d: DeptCode, slot: number) => `WS-${compactCode(p)}-${d}-${pad(slot, 2)}`;
export const plusDays = (s: string, n: number) => format(addDays(parseISO(s), n), 'yyyy-MM-dd');
export const DEPT_ORDER: DeptCode[] = ['GS', 'DP', 'WD', 'SAFETY'];
export const SHIFTS: ShiftCode[] = ['MORNING', 'NIGHT'];

export function shiftWindow(date: string, shift: ShiftCode): {start: string;end: string;} {
  if (shift === 'MORNING') return { start: `${date}T07:30:00`, end: `${date}T19:30:00` };
  return { start: `${date}T19:30:00`, end: `${plusDays(date, 1)}T07:30:00` };
}

const uuid = () =>
'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const v = Math.floor(r() * 16);
  return (c === 'x' ? v : v & 0x3 | 0x8).toString(16);
});
const phone = () => `+63 9${pad(Math.floor(r() * 1e9), 9)}`;
const emailOf = (name: string) => `${name.toLowerCase().replace(/[^a-z ]/g, '').replace(/ /g, '.')}@relayops.com`;

// ---------------- Categories & platforms ----------------
const categories: PlatformCategory[] = categorySeeds.map((c) => ({ ...c }));
const platforms: Platform[] = platformSeeds.map((p) => ({
  id: `PLAT-${p.categoryCode}-${pad(Number(p.code.split('-')[1]), 3)}`,
  code: p.code,
  categoryCode: p.categoryCode,
  status: p.status,
  departments: { ...p.departments },
  updatedAt: p.updatedAt
}));

// ---------------- Employees ----------------
function forcedVacancy(code: string, d: DeptCode, s: ShiftCode, slot: number): boolean | undefined {
  if (code === 'KANE-13' && d === 'DP' && s === 'MORNING' && slot === 5) return true;
  if (code === 'KANE-13' && d === 'WD' && s === 'MORNING' && slot === 5) return true;
  if (code === 'KANE-14' && d === 'DP' && s === 'MORNING' && slot === 3) return true;
  if (code === 'KANE-15' && d === 'DP' && s === 'MORNING' && (slot === 4 || slot === 5)) return true;
  if (code === 'KANE-21' && d === 'DP') return false;
  if (code === 'KANE-24' && d === 'DP' && s === 'MORNING' && slot === 5) return true;
  if (code === 'JAX-4' || code === 'REX-1') return false;
  return undefined;
}

const employees: EmployeeRecord[] = [];
let empSeq = 1;
for (const p of platforms) {
  if (p.status !== 'ACTIVE') continue;
  for (const d of DEPT_ORDER) {
    const cap = p.departments[d];
    if (!cap) continue;
    for (const s of SHIFTS) {
      for (let slot = 1; slot <= cap; slot++) {
        const vacant = forcedVacancy(p.code, d, s, slot) ?? r() < 0.06;
        if (vacant) continue;
        const name = `${pick(firstNames)} ${pick(lastNames)}`;
        employees.push({
          uuid: uuid(),
          id: `EMP-${pad(empSeq++, 5)}`,
          name,
          email: emailOf(name),
          phone: phone(),
          dept: d,
          platformCode: p.code,
          categoryCode: p.categoryCode,
          position: r() < 0.2 ? positionsByDept[d][1] : positionsByDept[d][0],
          shift: s,
          nextShift: s === 'MORNING' ? 'NIGHT' : 'MORNING',
          status: r() < 0.025 ? 'ON_LEAVE' : 'ACTIVE',
          accountStatus: r() < 0.02 ? 'LOCKED' : r() < 0.02 ? 'INVITED' : 'ACTIVE',
          poolId: poolIdOf(p.code, d),
          currentWorkstationId: null,
          workstationState: null,
          offDaysUsed: 0,
          offDaysAllowance: 4,
          joinedAt: `${2021 + Math.floor(r() * 5)}-${pad(1 + Math.floor(r() * 12), 2)}-${pad(1 + Math.floor(r() * 28), 2)}`,
          slot
        });
      }
    }
  }
}
const me = employees.find((e) => e.platformCode === 'KANE-13' && e.dept === 'DP' && e.shift === 'NIGHT' && e.slot === 4)!;
Object.assign(me, { id: 'EMP-00421', name: 'Arjun Mehta', email: 'arjun.mehta@relayops.com', status: 'ACTIVE', accountStatus: 'ACTIVE', position: 'Deposit Agent', joinedAt: '2023-04-17' });

export const findEmp = (p: string, d: DeptCode, s: ShiftCode, slot: number) =>
employees.find((e) => e.platformCode === p && e.dept === d && e.shift === s && e.slot === slot);

// ---------------- Freelancers ----------------
const catCodes = categories.map((c) => c.code);
const freelancers: FreelancerRecord[] = [];
for (let i = 0; i < 48; i++) {
  const id = `FL-${pad(101 + i, 5)}`;
  const name = id === 'FL-00124' ? 'Sofia Reyes' : `${pick(firstNames)} ${pick(lastNames)}`;
  const shuffled = [...catCodes].sort(() => r() - 0.5);
  const compat = id === 'FL-00124' ? ['KANE', 'JAX', 'IRIS'] : shuffled.slice(0, 2 + Math.floor(r() * 3)).sort();
  freelancers.push({
    uuid: uuid(),
    id,
    name,
    email: emailOf(name),
    phone: phone(),
    dept: DEPT_ORDER[Math.floor(i / 12)],
    priority: 0,
    status: [5, 17, 30, 41].includes(i) ? 'INACTIVE' : 'ACTIVE',
    accountStatus: [5, 17, 30, 41].includes(i) ? 'LOCKED' : 'ACTIVE',
    compatibleCategories: compat,
    joinedAt: `${2023 + Math.floor(r() * 3)}-${pad(1 + Math.floor(r() * 12), 2)}-${pad(1 + Math.floor(r() * 28), 2)}`
  });
}
for (const d of DEPT_ORDER) {
  const list = freelancers.filter((f) => f.dept === d);
  if (d === 'DP') list.sort((a, b) => a.id === 'FL-00124' ? -1 : b.id === 'FL-00124' ? 1 : a.id.localeCompare(b.id));
  list.forEach((f, i) => f.priority = i + 1);
}

const availability: AvailabilityMap = {};
const availabilityDates: string[] = [];
for (let i = 0; i < 91; i++) availabilityDates.push(plusDays('2026-09-01', i));
const roll = (): AvailabilityState => {
  const x = r();
  return x < 0.62 ? 'AVAILABLE' : x < 0.9 ? 'UNAVAILABLE' : 'OFF';
};
for (const f of freelancers) {
  availability[f.id] = {};
  for (const date of availabilityDates) availability[f.id][date] = { MORNING: roll(), NIGHT: roll() };
}
availability['FL-00119'] && (availability['FL-00119']['2026-09-27'] = { MORNING: 'CONFLICT', NIGHT: 'UNAVAILABLE' });

// ---------------- Off-days ----------------
const offDays: OffDayRequest[] = [];
let offSeq = 1;
const groupKey = (p: string, d: DeptCode, date: string) => `${p}|${d}|${date}`;
const groupCounts = new Map<string, number>();
const empMonthCount = new Map<string, number>();

function addOff(e: EmployeeRecord | undefined, date: string, status: OffDayRequest['status'], createdAt: string, reason?: string, override?: OffDayRequest['override']) {
  if (!e) return;
  offDays.push({
    id: `OFF-${pad(offSeq++, 6)}`,
    employeeId: e.id,
    employeeName: e.name,
    platformCode: e.platformCode,
    dept: e.dept,
    shift: e.shift,
    date,
    status,
    createdAt,
    reason,
    override
  });
  if (status === 'APPROVED' || status === 'OVERRIDE_APPROVED') {
    const k = groupKey(e.platformCode, e.dept, date);
    groupCounts.set(k, (groupCounts.get(k) ?? 0) + 1);
    const mk = `${e.id}|${date.slice(0, 7)}`;
    empMonthCount.set(mk, (empMonthCount.get(mk) ?? 0) + 1);
  }
}
export const rejectionReason = (p: string, d: DeptCode, date: string) =>
`Two employees from ${d} on ${p} already have approved off-days on ${format(parseISO(date), 'MMMM d')}.`;

const k13 = (d: DeptCode, s: ShiftCode, slot: number) => findEmp('KANE-13', d, s, slot);
addOff(k13('DP', 'MORNING', 1), '2026-09-20', 'APPROVED', '2026-08-18T09:12:00');
addOff(k13('DP', 'NIGHT', 2), '2026-09-20', 'APPROVED', '2026-08-18T11:40:00');
addOff(me, '2026-09-04', 'APPROVED', '2026-08-19T08:02:00');
addOff(me, '2026-09-11', 'APPROVED', '2026-08-19T08:03:00');
addOff(me, '2026-09-18', 'APPROVED', '2026-08-19T08:03:00');
addOff(me, '2026-09-20', 'REJECTED', '2026-08-19T08:04:00', rejectionReason('KANE-13', 'DP', '2026-09-20'));
addOff(k13('DP', 'MORNING', 3), TODAY, 'APPROVED', '2026-08-22T10:15:00');
addOff(k13('DP', 'MORNING', 2), '2026-10-03', 'APPROVED', '2026-09-02T09:00:00');
addOff(k13('DP', 'NIGHT', 1), '2026-10-03', 'APPROVED', '2026-09-03T14:21:00');
addOff(k13('DP', 'NIGHT', 3), '2026-10-05', 'APPROVED', '2026-09-04T16:30:00');

const jax4wd = employees.filter((e) => e.platformCode === 'JAX-4' && e.dept === 'WD');
if (jax4wd.length >= 3) {
  addOff(jax4wd[0], '2026-09-28', 'APPROVED', '2026-08-20T09:00:00');
  addOff(jax4wd[1], '2026-09-28', 'APPROVED', '2026-08-21T10:00:00');
  addOff(jax4wd[2], '2026-09-28', 'OVERRIDE_APPROVED', '2026-09-14T15:32:00', 'Bereavement — compassionate exception approved', {
    managerId: 'USR-MGR-014',
    managerName: 'Daniel Mwangi',
    reason: 'Bereavement — compassionate exception approved',
    at: '2026-09-14T15:40:00',
    previousApproved: 2
  });
}

for (const e of employees) {
  if (e.status !== 'ACTIVE' || e.id === 'EMP-00421') continue;
  for (const m of [{ ym: '2026-09', days: 30, created: '2026-08' }, { ym: '2026-10', days: 31, created: '2026-09' }]) {
    if (m.ym === '2026-10' && r() < 0.45) continue;
    let attempts = 0;
    while ((empMonthCount.get(`${e.id}|${m.ym}`) ?? 0) < 4 && attempts < 12) {
      attempts++;
      const date = `${m.ym}-${pad(1 + Math.floor(r() * m.days), 2)}`;
      if (offDays.some((o) => o.employeeId === e.id && o.date === date)) continue;
      const createdAt = `${m.created}-${pad(1 + Math.floor(r() * 24), 2)}T${pad(8 + Math.floor(r() * 10), 2)}:${pad(Math.floor(r() * 60), 2)}:00`;
      const count = groupCounts.get(groupKey(e.platformCode, e.dept, date)) ?? 0;
      if (count < OFFDAY_GROUP_LIMIT) addOff(e, date, 'APPROVED', createdAt);else
      if (r() < 0.3) addOff(e, date, 'REJECTED', createdAt, rejectionReason(e.platformCode, e.dept, date));
    }
  }
}
for (const e of employees) e.offDaysUsed = empMonthCount.get(`${e.id}|2026-09`) ?? 0;

// ---------------- Replacements ----------------
interface RepSeed {
  p?: string;
  d?: DeptCode;
  s?: ShiftCode;
  k?: number;
  emp?: string;
  date: string;
  type: ReplacementType;
  reason: string;
  final: ReplacementStatus;
  forceFl?: string;
  forceFail?: boolean;
}
const repSeeds: RepSeed[] = [
{ p: 'KANE-2', d: 'SAFETY', s: 'MORNING', k: 0, date: '2026-09-22', type: 'EMERGENCY', final: 'CONFIRMED', reason: 'Sick leave — reported 06:05' },
{ p: 'JAX-1', d: 'WD', s: 'MORNING', k: 0, date: '2026-09-23', type: 'PLANNED', final: 'CANCELLED', reason: 'Approved leave' },
{ p: 'IRIS-5', d: 'GS', s: 'NIGHT', k: 0, date: '2026-09-24', type: 'EMERGENCY', final: 'CONFIRMED', reason: 'Power outage at residence' },
{ p: 'KANE-14', d: 'DP', s: 'NIGHT', k: 1, date: TODAY, type: 'EMERGENCY', final: 'CONFIRMED', reason: 'Called in sick at 16:10', forceFl: 'FL-00124' },
{ p: 'KANE-13', d: 'WD', s: 'NIGHT', k: 2, date: TODAY, type: 'EMERGENCY', final: 'ASSIGNED', reason: 'Transport disruption' },
{ p: 'JAX-4', d: 'DP', s: 'NIGHT', k: 0, date: TODAY, type: 'EMERGENCY', final: 'SEARCHING', reason: 'Medical emergency — hospital admission' },
{ p: 'REX-1', d: 'SAFETY', s: 'NIGHT', k: 0, date: TODAY, type: 'EMERGENCY', final: 'FAILED', reason: 'Family emergency', forceFail: true },
{ p: 'REX-12', d: 'DP', s: 'NIGHT', k: 0, date: TODAY, type: 'EMERGENCY', final: 'PENDING', reason: 'Reported unwell at 18:31' },
{ p: 'IRIS-1', d: 'WD', s: 'MORNING', k: 3, date: '2026-09-26', type: 'EMERGENCY', final: 'ASSIGNED', reason: 'Reported unwell' },
{ p: 'KANE-7', d: 'DP', s: 'MORNING', k: 2, date: '2026-09-27', type: 'PLANNED', final: 'CONFIRMED', reason: 'Medical appointment' },
{ p: 'KANE-20', d: 'WD', s: 'NIGHT', k: 4, date: '2026-09-29', type: 'PLANNED', final: 'CONFIRMED', reason: 'Compliance certification training' },
{ p: 'JAX-7', d: 'GS', s: 'MORNING', k: 0, date: '2026-09-30', type: 'PLANNED', final: 'ASSIGNED', reason: 'Approved personal leave' },
{ p: 'IRIS-2', d: 'DP', s: 'NIGHT', k: 1, date: '2026-10-01', type: 'PLANNED', final: 'ASSIGNED', reason: 'Court summons' },
{ emp: 'EMP-00421', date: '2026-10-02', type: 'PLANNED', final: 'CONFIRMED', reason: 'Family event — approved leave', forceFl: 'FL-00124' },
{ p: 'REX-3', d: 'WD', s: 'MORNING', k: 0, date: '2026-10-02', type: 'PLANNED', final: 'ASSIGNED', reason: 'Approved leave' },
{ p: 'KANE-30', d: 'WD', s: 'NIGHT', k: 1, date: '2026-10-04', type: 'PLANNED', final: 'PENDING', reason: 'Approved leave' },
{ p: 'KANE-1', d: 'DP', s: 'NIGHT', k: 2, date: '2026-10-06', type: 'PLANNED', final: 'PENDING', reason: 'Wedding leave' },
{ p: 'ZANE-1', d: 'DP', s: 'MORNING', k: 0, date: '2026-10-09', type: 'PLANNED', final: 'PENDING', reason: 'Medical procedure' }];


const replacements: Replacement[] = [];
let repSeq = 1;
const catOf = (code: string) => platforms.find((p) => p.code === code)!.categoryCode;

export function assignFreelancerToRep(rep: Replacement) {
  const candidates = evaluateCandidates(rep, freelancers, availability, replacements);
  const chosen = candidates.find((c) => c.eligible);
  rep.candidates = candidates.map((c) => ({ ...c, selected: c.freelancerId === chosen?.freelancerId }));
  if (chosen) {
    const emp = employees.find((e) => e.id === rep.absentEmployeeId)!;
    rep.status = 'ASSIGNED';
    rep.freelancerId = chosen.freelancerId;
    rep.freelancerName = chosen.name;
    rep.freelancerPriority = chosen.priority;
    rep.workstationId = wsIdOf(rep.platformCode, rep.dept, emp.slot);
    rep.failureReasons = [];
    availability[chosen.freelancerId][rep.date][rep.shift] = 'ASSIGNED';
  } else {
    rep.status = 'FAILED';
    rep.failureReasons = summarizeFailures(candidates, freelancers.filter((f) => f.dept !== rep.dept).length);
  }
  return rep;
}

for (const seed of [...repSeeds].sort((a, b) => a.date.localeCompare(b.date))) {
  let emp: EmployeeRecord | undefined;
  if (seed.emp) emp = employees.find((e) => e.id === seed.emp);else
  {
    const group = employees.filter((e) => e.platformCode === seed.p && e.dept === seed.d && e.shift === seed.s);
    emp = group[seed.k ?? 0] ?? employees.find((e) => e.platformCode === seed.p && e.dept === seed.d);
  }
  if (!emp) continue;
  const { start, end } = shiftWindow(seed.date, emp.shift);
  const initiatedAt = seed.type === 'PLANNED' ? `${plusDays(seed.date, -7)}T${start.slice(11)}` : `${seed.date === TODAY ? TODAY : plusDays(seed.date, -1)}T${seed.date === TODAY ? '16:14:00' : '21:05:00'}`;
  const rep: Replacement = {
    id: `REP-${pad(2600 + repSeq++, 5)}`,
    type: seed.type,
    status: 'PENDING',
    absentEmployeeId: emp.id,
    absentEmployeeName: emp.name,
    platformCode: emp.platformCode,
    categoryCode: catOf(emp.platformCode),
    dept: emp.dept,
    shift: emp.shift,
    date: seed.date,
    shiftStart: start,
    shiftEnd: end,
    reason: seed.reason,
    createdAt: seed.type === 'PLANNED' ? `${plusDays(seed.date, -12)}T10:20:00` : initiatedAt.replace(/:\d\d:00$/, ':02:00'),
    initiatedAt,
    freelancerId: null,
    freelancerName: null,
    freelancerPriority: null,
    poolId: poolIdOf(emp.platformCode, emp.dept),
    workstationId: null,
    candidates: [],
    failureReasons: [],
    timeline: []
  };
  if (seed.forceFl) {
    availability[seed.forceFl][seed.date][emp.shift] = 'AVAILABLE';
  }
  if (seed.forceFail) {
    for (const f of freelancers.filter((x) => x.dept === emp!.dept)) {
      if (f.compatibleCategories.includes(rep.categoryCode)) availability[f.id][seed.date][emp.shift] = r() < 0.5 ? 'UNAVAILABLE' : 'OFF';
    }
  }
  if (seed.final === 'ASSIGNED' || seed.final === 'CONFIRMED' || seed.final === 'FAILED') {
    assignFreelancerToRep(rep);
    if (seed.final === 'CONFIRMED' && rep.status === 'ASSIGNED') rep.status = 'CONFIRMED';
  } else if (seed.final === 'CANCELLED') {
    rep.status = 'CANCELLED';
    rep.cancelReason = 'Employee withdrew leave request';
  } else {
    rep.status = seed.final;
    if (seed.final === 'SEARCHING') rep.candidates = [];
  }
  rep.timeline = buildTimeline(rep);
  replacements.push(rep);
}

// ---------------- Laptops, handovers, incidents ----------------
const laptops: Laptop[] = [];
const handovers: Handover[] = [];
const incidents: Incident[] = [];
let lapSeq = 1;
let hoSeq = 1;
let incSeq = 180;

const offToday = new Set(offDays.filter((o) => o.date === TODAY && (o.status === 'APPROVED' || o.status === 'OVERRIDE_APPROVED')).map((o) => o.employeeId));
const activeRepFor = (empId: string, date: string) =>
replacements.find((x) => x.absentEmployeeId === empId && x.date === date && x.status !== 'CANCELLED');

function checklistGood(): Handover['checklist'] {
  return { laptopCondition: 'GOOD', chargerPresent: true, mousePresent: true, physicalDamage: false, screenOk: true, keyboardOk: true, otherEquipment: 'Headset', notes: '' };
}

function forcedStatus(p: string, d: DeptCode, slot: number): LaptopStatus | undefined {
  if (p === 'KANE-13') {
    if (d === 'DP' && slot === 5) return 'AVAILABLE';
    if (d === 'DP' && slot === 3) return 'AVAILABLE';
    if (d === 'DP' && slot === 4) return 'HANDOVER_PENDING';
    if (d === 'WD' && slot === 5) return 'AVAILABLE';
    return 'ASSIGNED';
  }
  if (p === 'KANE-15') {
    if (d === 'DP' && (slot === 4 || slot === 5)) return 'AVAILABLE';
    return 'ASSIGNED';
  }
  if (p === 'KANE-21') {
    return 'ASSIGNED';
  }
  if (p === 'KANE-24') {
    if (d === 'DP' && slot === 5) return 'MAINTENANCE';
    return 'ASSIGNED';
  }
  return undefined;
}

for (const p of platforms) {
  for (const d of DEPT_ORDER) {
    const cap = p.departments[d];
    if (!cap) continue;
    for (let slot = 1; slot <= cap; slot++) {
      const assetId = `LAP-${pad(lapSeq++, 5)}`;
      const ws = wsIdOf(p.code, d, slot);
      const morning = findEmp(p.code, d, 'MORNING', slot);
      const night = findEmp(p.code, d, 'NIGHT', slot);
      const morningWorking = morning && morning.status === 'ACTIVE' && !offToday.has(morning.id);
      let status: LaptopStatus = p.status !== 'ACTIVE' ? 'AVAILABLE' : morningWorking ? 'ASSIGNED' : 'AVAILABLE';
      const x = r();
      if (p.status === 'ACTIVE') {
        if (x < 0.03) status = 'MAINTENANCE';else
        if (x < 0.065) status = 'INCIDENT';else
        if (status === 'ASSIGNED' && x < 0.33) status = 'HANDOVER_PENDING';
      }
      const forced = forcedStatus(p.code, d, slot);
      if (forced) status = forced;
      let nextId: string | null = null;
      let nextName: string | null = null;
      let nextNote: string | null = null;
      if (night && p.status === 'ACTIVE') {
        const rep = activeRepFor(night.id, TODAY);
        if (rep && rep.freelancerId) {
          nextId = rep.freelancerId;
          nextName = rep.freelancerName;
          nextNote = `Replacing ${night.id}`;
        } else if (rep) nextNote = `Unfilled — ${night.id} absent`;else
        if (offToday.has(night.id)) nextNote = `${night.id} off today`;else
        if (night.status !== 'ACTIVE') nextNote = `${night.id} on leave`;else
        {
          nextId = night.id;
          nextName = night.name;
        }
      }
      if (nextId === 'FL-00124') status = 'HANDOVER_PENDING';
      const inUse = status === 'ASSIGNED' || status === 'HANDOVER_PENDING';
      const lap: Laptop = {
        assetId,
        serial: `PF${Math.floor(r() * 36 ** 6).toString(36).toUpperCase().padStart(6, '0')}`,
        model: pick(laptopModels),
        workstationId: ws,
        poolId: poolIdOf(p.code, d),
        platformCode: p.code,
        dept: d,
        status,
        currentUserId: inUse && morning ? morning.id : null,
        currentUserName: inUse && morning ? morning.name : null,
        currentShift: inUse ? 'MORNING' : null,
        nextUserId: nextId,
        nextUserName: nextName,
        nextUserNote: nextNote,
        condition: status === 'INCIDENT' ? 'DAMAGED' : r() < 0.12 ? 'FAIR' : 'GOOD',
        handoverStatus: null,
        openIncidentId: null,
        purchasedAt: `${2022 + Math.floor(r() * 3)}-${pad(1 + Math.floor(r() * 12), 2)}-${pad(1 + Math.floor(r() * 28), 2)}`
      };
      laptops.push(lap);
      if (morning && inUse) {
        morning.currentWorkstationId = ws;
        morning.workstationState = 'IN_USE';
      }
      if (night && night.status === 'ACTIVE' && !offToday.has(night.id) && !activeRepFor(night.id, TODAY)) {
        night.currentWorkstationId = ws;
        night.workstationState = 'SCHEDULED';
      }

      // Historical handovers: yesterday 19:30 (morning → night) and today 07:30 (night → morning)
      if (morning && night && p.status === 'ACTIVE') {
        const y = plusDays(TODAY, -1);
        handovers.push({
          id: `HO-${pad(hoSeq++, 6)}`, assetId, workstationId: ws, poolId: lap.poolId, platformCode: p.code, dept: d,
          outgoingId: morning.id, outgoingName: morning.name, incomingId: night.id, incomingName: night.name,
          outgoingShift: 'MORNING', incomingShift: 'NIGHT', scheduledAt: `${y}T19:30:00`, status: 'COMPLETED',
          outgoingConfirmedAt: `${y}T19:22:00`, receivedAt: `${y}T19:36:00`, checklist: checklistGood(), incidentId: null
        });
        handovers.push({
          id: `HO-${pad(hoSeq++, 6)}`, assetId, workstationId: ws, poolId: lap.poolId, platformCode: p.code, dept: d,
          outgoingId: night.id, outgoingName: night.name, incomingId: morning.id, incomingName: morning.name,
          outgoingShift: 'NIGHT', incomingShift: 'MORNING', scheduledAt: `${TODAY}T07:30:00`, status: 'COMPLETED',
          outgoingConfirmedAt: `${TODAY}T07:21:00`, receivedAt: `${TODAY}T07:38:00`, checklist: checklistGood(), incidentId: null
        });
      }
      // Tonight's handover (morning → night)
      if (inUse && lap.currentUserId && nextId) {
        const hs = status === 'HANDOVER_PENDING' ? 'OUTGOING_CONFIRMED' : 'PENDING';
        handovers.push({
          id: `HO-${pad(hoSeq++, 6)}`, assetId, workstationId: ws, poolId: lap.poolId, platformCode: p.code, dept: d,
          outgoingId: lap.currentUserId, outgoingName: lap.currentUserName!, incomingId: nextId, incomingName: nextName!,
          outgoingShift: 'MORNING', incomingShift: 'NIGHT', scheduledAt: `${TODAY}T19:30:00`, status: hs,
          outgoingConfirmedAt: hs === 'OUTGOING_CONFIRMED' ? `${TODAY}T18:${pad(20 + Math.floor(r() * 30), 2)}:00` : null,
          receivedAt: null, checklist: hs === 'OUTGOING_CONFIRMED' ? checklistGood() : null, incidentId: null
        });
        lap.handoverStatus = hs;
        // Tomorrow morning handover for demo users
        if (nextId === 'EMP-00421' || nextId === 'FL-00124') {
          const tmr = plusDays(TODAY, 1);
          const nextMorning = morning && !offDays.some((o) => o.employeeId === morning.id && o.date === tmr && o.status === 'APPROVED') ? morning : null;
          if (nextMorning) {
            handovers.push({
              id: `HO-${pad(hoSeq++, 6)}`, assetId, workstationId: ws, poolId: lap.poolId, platformCode: p.code, dept: d,
              outgoingId: nextId, outgoingName: nextName!, incomingId: nextMorning.id, incomingName: nextMorning.name,
              outgoingShift: 'NIGHT', incomingShift: 'MORNING', scheduledAt: `${tmr}T07:30:00`, status: 'PENDING',
              outgoingConfirmedAt: null, receivedAt: null, checklist: null, incidentId: null
            });
          }
        }
      }
      // Incidents
      const isK13Wd2 = p.code === 'KANE-13' && d === 'WD' && slot === 2;
      if (status === 'INCIDENT' || isK13Wd2) {
        const cat = isK13Wd2 ? 'Missing peripheral' : pick(incidentCategories.filter((c) => c !== 'Missing peripheral'));
        const reporter = morning ?? night;
        const inc: Incident = {
          id: `INC-2026-${pad(incSeq++, 4)}`,
          assetId,
          workstationId: ws,
          platformCode: p.code,
          dept: d,
          severity: isK13Wd2 ? 'LOW' : r() < 0.4 ? 'HIGH' : r() < 0.2 ? 'CRITICAL' : 'MEDIUM',
          status: isK13Wd2 ? 'OPEN' : r() < 0.5 ? 'OPEN' : 'IN_PROGRESS',
          category: cat,
          title: isK13Wd2 ? 'Mouse missing at morning handover' : `${cat} reported on ${assetId}`,
          description: isK13Wd2 ?
          'Incoming employee confirmed receipt but noted the wireless mouse was not at the workstation. Laptop remains usable.' :
          `${cat} identified during condition check. Laptop withdrawn from the ${d} pool until IT clears it.`,
          reportedById: reporter?.id ?? 'USR-MGR-014',
          reportedByName: reporter?.name ?? 'Daniel Mwangi',
          createdAt: `${plusDays(TODAY, -Math.floor(r() * 3))}T0${7 + Math.floor(r() * 2)}:${pad(Math.floor(r() * 60), 2)}:00`,
          updatedAt: `${TODAY}T${pad(9 + Math.floor(r() * 8), 2)}:${pad(Math.floor(r() * 60), 2)}:00`,
          handoverId: null
        };
        incidents.push(inc);
        lap.openIncidentId = inc.id;
      }
    }
  }
}
for (let i = 0; i < 5; i++) {
  const p = platforms[i * 3];
  laptops.push({
    assetId: `LAP-${pad(lapSeq++, 5)}`, serial: `PF${pad(Math.floor(r() * 999999), 6)}`, model: pick(laptopModels), workstationId: null,
    poolId: poolIdOf(p.code, 'DP'), platformCode: p.code, dept: 'DP', status: 'RETIRED', currentUserId: null, currentUserName: null,
    currentShift: null, nextUserId: null, nextUserName: null, nextUserNote: null, condition: 'DAMAGED', handoverStatus: null,
    openIncidentId: null, purchasedAt: '2021-03-12'
  });
}
for (let i = 0; i < 7; i++) {
  const lap = laptops[Math.floor(r() * (laptops.length - 10))];
  const cat = pick(incidentCategories);
  incidents.push({
    id: `INC-2026-${pad(incSeq++, 4)}`, assetId: lap.assetId, workstationId: lap.workstationId, platformCode: lap.platformCode, dept: lap.dept,
    severity: pick(['LOW', 'MEDIUM', 'HIGH'] as const), status: 'RESOLVED', category: cat, title: `${cat} on ${lap.assetId}`,
    description: `${cat} reported at shift handover. Resolved by IT field support.`, reportedById: 'USR-MGR-014', reportedByName: 'Daniel Mwangi',
    createdAt: `2026-09-${pad(8 + i * 2, 2)}T08:14:00`, updatedAt: `2026-09-${pad(9 + i * 2, 2)}T13:02:00`, handoverId: null
  });
}

// ---------------- Notifications ----------------
const M: NotificationItem['recipientRoles'] = ['SUPERVISOR'];
const notifications: NotificationItem[] = [
{ id: 'NTF-9001', type: 'EMERGENCY_REPLACEMENT', title: 'Emergency replacement failed · REX-1 SAFETY', body: 'No eligible freelancer for REX-1 / SAFETY / Night tonight. Manual action required.', createdAt: `${TODAY}T16:22:00`, read: false, emailStatus: 'DELIVERED', link: '/replacements', recipientRoles: M, recipientId: null },
{ id: 'NTF-9002', type: 'REPLACEMENT_ASSIGNED', title: 'FL-00124 assigned to KANE-14 / DP', body: 'Emergency replacement for tonight’s night shift confirmed by Sofia Reyes.', createdAt: `${TODAY}T16:31:00`, read: false, emailStatus: 'DELIVERED', link: '/replacements', recipientRoles: M, recipientId: null },
{ id: 'NTF-9003', type: 'LAPTOP_INCIDENT', title: 'New incident on KANE-13 / WD', body: 'Mouse missing at morning handover on WS-KANE13-WD-02.', createdAt: `${TODAY}T07:44:00`, read: false, emailStatus: 'SENT', link: '/incidents', recipientRoles: M, recipientId: null },
{ id: 'NTF-9004', type: 'HANDOVER_REQUIRED', title: 'Evening handover window opens 19:15', body: 'Morning → Night handovers are due across all active platforms at 19:30.', createdAt: `${TODAY}T18:30:00`, read: false, emailStatus: 'NOT_SENT', link: '/pools', recipientRoles: M, recipientId: null },
{ id: 'NTF-9005', type: 'ROTATION', title: 'Q4 shift rotation scheduled for Oct 01', body: 'All permanent employees swap Morning ↔ Night on Oct 01 07:30. Review the rotation preview.', createdAt: '2026-09-20T09:00:00', read: true, emailStatus: 'DELIVERED', link: '/rotation', recipientRoles: ['SUPERVISOR', 'EMPLOYEE'], recipientId: null },
{ id: 'NTF-9006', type: 'PLATFORM_CONFIG_CHANGED', title: 'KANE-13 configuration updated', body: 'WD capacity changed 4 → 5 by Leila Haddad.', createdAt: '2026-09-08T11:12:00', read: true, emailStatus: 'DELIVERED', link: '/platforms/KANE-13', recipientRoles: M, recipientId: null },
{ id: 'NTF-9007', type: 'ROSTER_UPDATED', title: 'October roster published', body: 'The October monthly roster is available for all platforms.', createdAt: '2026-09-22T10:00:00', read: true, emailStatus: 'DELIVERED', link: '/roster', recipientRoles: ['SUPERVISOR', 'EMPLOYEE', 'FREELANCER'], recipientId: null },
{ id: 'NTF-9010', type: 'HANDOVER_REQUIRED', title: 'Receive WS-KANE13-DP-04 before 19:30', body: 'Outgoing morning agent has confirmed handover of LAP on KANE-13 / DP. Review condition and confirm receipt.', createdAt: `${TODAY}T18:41:00`, read: false, emailStatus: 'SENT', link: '/handover', recipientRoles: ['EMPLOYEE'], recipientId: 'EMP-00421' },
{ id: 'NTF-9011', type: 'OFFDAY_REJECTED', title: 'Off-day rejected · Sep 20', body: 'Two employees from DP on KANE-13 already have approved off-days on September 20. Choose another date.', createdAt: '2026-08-19T08:04:00', read: true, emailStatus: 'DELIVERED', link: '/my/off-days', recipientRoles: ['EMPLOYEE'], recipientId: 'EMP-00421' },
{ id: 'NTF-9012', type: 'OFFDAY_APPROVED', title: 'Off-days approved · Sep 4, 11, 18', body: 'Three September off-days were approved automatically. 1 remaining this month.', createdAt: '2026-08-19T08:03:00', read: true, emailStatus: 'DELIVERED', link: '/my/off-days', recipientRoles: ['EMPLOYEE'], recipientId: 'EMP-00421' },
{ id: 'NTF-9013', type: 'SHIFT_CHANGED', title: 'Your shift moves to Morning on Oct 01', body: 'Q4 rotation: Night → Morning (07:30 – 19:30) starting Oct 01.', createdAt: '2026-09-20T09:00:00', read: false, emailStatus: 'DELIVERED', link: '/my/schedule', recipientRoles: ['EMPLOYEE'], recipientId: 'EMP-00421' },
{ id: 'NTF-9014', type: 'REPLACEMENT_ASSIGNED', title: 'Planned leave covered · Oct 02', body: 'FL-00124 will cover your night shift on KANE-13 / DP on Oct 02.', createdAt: `${TODAY}T19:30:00`.replace('19:30', '09:31'), read: false, emailStatus: 'SENT', link: '/my/schedule', recipientRoles: ['EMPLOYEE'], recipientId: 'EMP-00421' },
{ id: 'NTF-9020', type: 'EMERGENCY_REPLACEMENT', title: 'Emergency assignment tonight · KANE-14 / DP', body: 'You are replacing an absent DP agent on KANE-14, Night shift 19:30 → 07:30.', createdAt: `${TODAY}T16:15:00`, read: false, emailStatus: 'DELIVERED', link: '/my/assignments', recipientRoles: ['FREELANCER'], recipientId: 'FL-00124' },
{ id: 'NTF-9021', type: 'WORKSTATION_ASSIGNED', title: 'Workstation allocated · KANE-14 / DP', body: 'Receive your laptop at the KANE-14 DP pool before 19:30.', createdAt: `${TODAY}T16:16:00`, read: false, emailStatus: 'SENT', link: '/my/workstation', recipientRoles: ['FREELANCER'], recipientId: 'FL-00124' },
{ id: 'NTF-9022', type: 'REPLACEMENT_ASSIGNED', title: 'Planned assignment · Oct 02 · KANE-13 / DP', body: 'Replacing EMP-00421 on the night shift. Priority 1 selection.', createdAt: `${TODAY}T09:31:00`, read: true, emailStatus: 'DELIVERED', link: '/my/assignments', recipientRoles: ['FREELANCER'], recipientId: 'FL-00124' },
{ id: 'NTF-9023', type: 'PLATFORM_ASSIGNMENT', title: 'Cleared for IRIS platforms', body: 'Your platform compatibility now includes IRIS.', createdAt: '2026-09-10T12:00:00', read: true, emailStatus: 'DELIVERED', link: '/profile', recipientRoles: ['FREELANCER'], recipientId: 'FL-00124' }];


// ---------------- Audit ----------------
const audit: AuditEntry[] = [];
let auditSeq = 1;
export function pushAudit(e: Omit<AuditEntry, 'id'>) {
  audit.unshift({ id: `AUD-${pad(auditSeq++, 6)}`, ...e });
}
const seedAudit: Omit<AuditEntry, 'id'>[] = [
{ at: '2026-09-08T11:12:00', actorId: 'USR-ADM-001', actorName: 'Leila Haddad', role: 'SUPERVISOR', action: 'PLATFORM_CONFIG_CHANGE', entity: 'PlatformConfig', entityId: 'PLAT-KANE-013', platformCode: 'KANE-13', dept: 'WD', previous: 'WD capacity 4', next: 'WD capacity 5', reason: 'Withdrawal volume growth — Q3 forecast', isOverride: false },
{ at: '2026-09-15T09:40:00', actorId: 'USR-ADM-001', actorName: 'Leila Haddad', role: 'SUPERVISOR', action: 'PLATFORM_CONFIG_CHANGE', entity: 'PlatformConfig', entityId: 'PLAT-KANE-020', platformCode: 'KANE-20', dept: 'SAFETY', previous: 'SAFETY not operating', next: 'SAFETY capacity 1', reason: 'Fraud screening launched on KANE-20', isOverride: false },
{ at: '2026-08-26T16:00:00', actorId: 'USR-ADM-001', actorName: 'Leila Haddad', role: 'SUPERVISOR', action: 'PLATFORM_STATUS_CHANGE', entity: 'Platform', entityId: 'PLAT-JAX-015', platformCode: 'JAX-15', dept: null, previous: 'ACTIVE', next: 'INACTIVE', reason: 'Brand migration paused by client', isOverride: false },
{ at: '2026-09-14T15:40:00', actorId: 'USR-MGR-014', actorName: 'Daniel Mwangi', role: 'SUPERVISOR', action: 'OFFDAY_OVERRIDE', entity: 'OffDayRequest', entityId: 'JAX-4/WD/2026-09-28', platformCode: 'JAX-4', dept: 'WD', previous: 'REJECTED · capacity 2 / 2', next: 'OVERRIDE_APPROVED · capacity 3 / 2', reason: 'Bereavement — compassionate exception approved', isOverride: true },
{ at: '2026-09-18T10:05:00', actorId: 'USR-MGR-014', actorName: 'Daniel Mwangi', role: 'SUPERVISOR', action: 'FREELANCER_PRIORITY_CHANGE', entity: 'FreelancerPriority', entityId: 'DP', platformCode: null, dept: 'DP', previous: 'FL-00113 #1, FL-00124 #12', next: 'FL-00124 #1, FL-00113 #2', reason: 'FL-00124 cleared for KANE and JAX — highest reliability', isOverride: false },
{ at: '2026-09-20T09:00:00', actorId: 'SYSTEM', actorName: 'Rotation scheduler', role: 'SYSTEM', action: 'ROTATION_SCHEDULED', entity: 'RotationCycle', entityId: 'CYC-2026-Q4', platformCode: null, dept: null, previous: 'Q3 2026 current', next: 'Q4 2026 scheduled Oct 01 07:30', reason: 'Quarterly rotation policy', isOverride: false },
{ at: '2026-09-11T13:22:00', actorId: 'USR-ADM-001', actorName: 'Leila Haddad', role: 'SUPERVISOR', action: 'ACCOUNT_CHANGE', entity: 'UserAccount', entityId: 'FL-00106', platformCode: null, dept: 'GS', previous: 'ACTIVE', next: 'LOCKED', reason: 'Contract suspended pending review', isOverride: false },
{ at: `${TODAY}T07:44:00`, actorId: k13('WD', 'MORNING', 2)?.id ?? 'EMP-00100', actorName: k13('WD', 'MORNING', 2)?.name ?? 'Agent', role: 'EMPLOYEE', action: 'INCIDENT_CREATED', entity: 'Incident', entityId: incidents.find((i) => i.platformCode === 'KANE-13')?.id ?? 'INC', platformCode: 'KANE-13', dept: 'WD', previous: '—', next: 'OPEN · LOW', reason: 'Mouse missing at morning handover', isOverride: false },
{ at: '2026-09-02T08:30:00', actorId: 'USR-MGR-014', actorName: 'Daniel Mwangi', role: 'SUPERVISOR', action: 'WORKFORCE_ASSIGNMENT_CHANGE', entity: 'Employee', entityId: 'EMP-00087', platformCode: 'KANE-7', dept: 'DP', previous: 'Platform KANE-1', next: 'Platform KANE-7', reason: 'KANE-7 DP expansion staffing', isOverride: false },
{ at: '2026-09-21T14:12:00', actorId: 'USR-MGR-014', actorName: 'Daniel Mwangi', role: 'SUPERVISOR', action: 'SHIFT_CHANGE', entity: 'Employee', entityId: 'EMP-00152', platformCode: 'IRIS-1', dept: 'WD', previous: 'Night', next: 'Morning (temporary)', reason: 'Medical accommodation — 2 weeks', isOverride: true }];

for (const a of seedAudit.sort((x, y) => x.at.localeCompare(y.at))) pushAudit(a);
for (const rep of replacements.filter((x) => x.freelancerId)) {
  pushAudit({ at: rep.initiatedAt, actorId: 'SYSTEM', actorName: 'Replacement engine', role: 'SYSTEM', action: 'REPLACEMENT_ASSIGNMENT', entity: 'Replacement', entityId: rep.id, platformCode: rep.platformCode, dept: rep.dept, previous: `${rep.absentEmployeeId} absent`, next: `${rep.freelancerId} assigned (priority ${rep.freelancerPriority})`, reason: rep.reason, isOverride: false });
}
for (const h of handovers.filter((x) => x.scheduledAt.startsWith(TODAY) && x.status === 'COMPLETED').slice(0, 12)) {
  pushAudit({ at: h.receivedAt!, actorId: h.incomingId, actorName: h.incomingName, role: h.incomingId.startsWith('FL') ? 'FREELANCER' : 'EMPLOYEE', action: 'LAPTOP_HANDOVER', entity: 'Handover', entityId: h.id, platformCode: h.platformCode, dept: h.dept, previous: `${h.assetId} with ${h.outgoingId}`, next: `${h.assetId} received by ${h.incomingId}`, reason: 'Shift handover completed', isOverride: false });
}
audit.sort((a, b) => b.at.localeCompare(a.at));

// ---------------- Rotation cycles ----------------
const morningNow = employees.filter((e) => e.shift === 'MORNING').length;
const nightNow = employees.filter((e) => e.shift === 'NIGHT').length;
const rotationCycles: RotationCycle[] = [
{ id: 'CYC-2026-Q4', label: 'Q4 2026', start: '2026-10-01', end: '2026-12-31', morning: nightNow, night: morningNow, executedAt: null, executedBy: 'Scheduled', status: 'SCHEDULED' },
{ id: 'CYC-2026-Q3', label: 'Q3 2026', start: '2026-07-01', end: '2026-09-30', morning: morningNow, night: nightNow, executedAt: '2026-07-01T07:30:00', executedBy: 'Rotation scheduler', status: 'CURRENT' },
{ id: 'CYC-2026-Q2', label: 'Q2 2026', start: '2026-04-01', end: '2026-06-30', morning: nightNow - 4, night: morningNow + 2, executedAt: '2026-04-01T07:30:00', executedBy: 'Rotation scheduler', status: 'COMPLETED' },
{ id: 'CYC-2026-Q1', label: 'Q1 2026', start: '2026-01-01', end: '2026-03-31', morning: morningNow - 9, night: nightNow - 7, executedAt: '2026-01-01T07:30:00', executedBy: 'Rotation scheduler', status: 'COMPLETED' },
{ id: 'CYC-2025-Q4', label: 'Q4 2025', start: '2025-10-01', end: '2025-12-31', morning: nightNow - 15, night: morningNow - 12, executedAt: '2025-10-01T07:30:00', executedBy: 'Rotation scheduler', status: 'COMPLETED' },
{ id: 'CYC-2025-Q3', label: 'Q3 2025', start: '2025-07-01', end: '2025-09-30', morning: morningNow - 20, night: nightNow - 18, executedAt: '2025-07-01T07:30:00', executedBy: 'Rotation scheduler', status: 'COMPLETED' }];


// ---------------- Candidates ----------------
const candidates: RecruitCandidate[] = [
  {
    id: 'CND-1052',
    name: 'John Silva',
    email: 'john.silva@candidate.relayops.com',
    phone: '+63 917 842 1052',
    interviewDate: '2026-10-04',
    interviewResult: 'SELECTED',
    employmentType: 'PERMANENT',
    dept: 'DP',
    position: 'Deposit Agent',
    notes: 'Candidate completed panel interview with high marks in payment reconciliations and fast typing speed. Recommended for immediate platform placement.',
    status: 'SELECTED',
    createdAt: '2026-10-01'
  },
  {
    id: 'CND-1053',
    name: 'Elena Rostova',
    email: 'elena.rostova@candidate.relayops.com',
    phone: '+63 917 842 1053',
    interviewDate: '2026-10-05',
    interviewResult: 'SELECTED',
    employmentType: 'FREELANCER',
    dept: 'WD',
    position: 'Withdrawal Agent',
    notes: 'Prior 2 years experience in sportsbook payments. Availability fits weekend morning coverage.',
    status: 'SELECTED',
    createdAt: '2026-10-02'
  },
  {
    id: 'CND-1054',
    name: 'Marcus Chen',
    email: 'marcus.chen@candidate.relayops.com',
    phone: '+63 917 842 1054',
    interviewDate: '2026-10-05',
    interviewResult: 'SELECTED',
    employmentType: 'PERMANENT',
    dept: 'GS',
    position: 'Accounts Officer',
    notes: 'Cleared KYC compliance verification assessment. Onboarding documentation pending completion.',
    status: 'ONBOARDING',
    createdAt: '2026-10-03'
  },
  {
    id: 'CND-1055',
    name: 'Aisha Patel',
    email: 'aisha.patel@candidate.relayops.com',
    phone: '+63 917 842 1055',
    interviewDate: '2026-10-08',
    interviewResult: 'PENDING',
    employmentType: 'PERMANENT',
    dept: 'DP',
    position: 'Deposit Agent',
    notes: 'Interview scheduled for tomorrow with Operations Lead.',
    status: 'INTERVIEW_SCHEDULED',
    createdAt: '2026-10-04'
  },
  {
    id: 'CND-1056',
    name: 'Lucas Vance',
    email: 'lucas.vance@candidate.relayops.com',
    phone: '+63 917 842 1056',
    interviewDate: '2026-10-06',
    interviewResult: 'RECOMMENDED',
    employmentType: 'FREELANCER',
    dept: 'SAFETY',
    position: 'Safety Analyst',
    notes: 'Passed fraud screening test. Waiting for platform capacity in SAFETY.',
    status: 'WAITLISTED',
    createdAt: '2026-10-04'
  }
];

// ---------------- Platform Workforce Positions ----------------
const platformPositions: PlatformWorkforcePosition[] = [];
for (const p of platforms) {
  if (p.status !== 'ACTIVE') continue;
  for (const d of DEPT_ORDER) {
    const cap = p.departments[d];
    if (!cap) continue;
    for (let slot = 1; slot <= cap; slot++) {
      const code = `${d}-${pad(slot, 2)}`;
      const emp = findEmp(p.code, d, 'MORNING', slot) ?? findEmp(p.code, d, 'NIGHT', slot);
      const ws = wsIdOf(p.code, d, slot);
      let status: PlatformWorkforcePosition['status'] = emp ? 'ACTIVE' : 'VACANT';
      let assignedWorkerId: string | null = emp ? emp.id : null;
      let assignedWorkerName: string | null = emp ? emp.name : null;
      let assignedWorkerType: 'PERMANENT' | 'FREELANCER' | null = emp ? 'PERMANENT' : null;

      // Special case: KANE-13 DP-05 is VACANT
      if (p.code === 'KANE-13' && d === 'DP' && slot === 5) {
        status = 'VACANT';
        assignedWorkerId = null;
        assignedWorkerName = null;
        assignedWorkerType = null;
      }

      // Special case: KANE-15 DP-04 is in TRAINING (EMP-01049)
      if (p.code === 'KANE-15' && d === 'DP' && slot === 4) {
        status = 'TRAINING';
        assignedWorkerId = 'EMP-01049';
        assignedWorkerName = 'Jose Ramos';
        assignedWorkerType = 'PERMANENT';
      }

      platformPositions.push({
        id: `POS-${compactCode(p.code)}-${d}-${pad(slot, 2)}`,
        platformCode: p.code,
        categoryCode: p.categoryCode,
        dept: d,
        positionCode: code,
        slot,
        shift: 'MORNING',
        status,
        assignedWorkerId,
        assignedWorkerName,
        assignedWorkerType,
        reservedForWorkerId: null,
        workstationId: ws,
        updatedAt: TODAY
      });
    }
  }
}

// ---------------- Platform Training Assignments ----------------
const trainingAssignments: PlatformTrainingAssignment[] = [
  {
    id: 'TRN-2026-0041',
    workerId: 'EMP-01048',
    workerName: 'Maria Santos',
    workerType: 'PERMANENT',
    platformCode: 'KANE-7',
    categoryCode: 'KANE',
    dept: 'DP',
    positionCode: 'DP-06',
    shift: 'MORNING',
    workstationPoolId: 'POOL-KANE7-DP',
    workstationId: 'WS-KANE7-DP-06',
    laptopAssetId: 'LAP-00045',
    trainingStartDate: plusDays(TODAY, -4),
    expectedCompletionDate: plusDays(TODAY, 1),
    actualCompletionDate: null,
    requiredTrainingDays: 5,
    completedTrainingDays: 4,
    trainingStatus: 'IN_TRAINING',
    evaluation: null,
    dailyLogs: [
      { day: 1, date: plusDays(TODAY, -4), status: 'COMPLETED', attendance: 'PRESENT', notes: 'Platform access set up, verified 2FA, intro to sportsbook payment gateway.' },
      { day: 2, date: plusDays(TODAY, -3), status: 'COMPLETED', attendance: 'PRESENT', notes: 'Deposit matching exception handling, batch ticket processing.' },
      { day: 3, date: plusDays(TODAY, -2), status: 'COMPLETED', attendance: 'PRESENT', notes: 'Shadowed senior agent on live deposit issues.' },
      { day: 4, date: plusDays(TODAY, -1), status: 'COMPLETED', attendance: 'PRESENT', notes: 'Independent ticket handling under supervisor review. High accuracy.' },
      { day: 5, date: TODAY, status: 'IN_PROGRESS', attendance: 'PRESENT', notes: 'Final operational shift prior to supervisor qualification evaluation.' }
    ],
    assignedBy: 'Leila Haddad',
    createdAt: `${plusDays(TODAY, -4)}T08:30:00`,
    updatedAt: `${TODAY}T09:00:00`
  },
  {
    id: 'TRN-2026-0042',
    workerId: 'EMP-01049',
    workerName: 'Jose Ramos',
    workerType: 'PERMANENT',
    platformCode: 'KANE-15',
    categoryCode: 'KANE',
    dept: 'DP',
    positionCode: 'DP-04',
    shift: 'MORNING',
    workstationPoolId: 'POOL-KANE15-DP',
    workstationId: 'WS-KANE15-DP-04',
    laptopAssetId: 'LAP-00088',
    trainingStartDate: plusDays(TODAY, -2),
    expectedCompletionDate: plusDays(TODAY, 3),
    actualCompletionDate: null,
    requiredTrainingDays: 5,
    completedTrainingDays: 2,
    trainingStatus: 'IN_TRAINING',
    evaluation: null,
    dailyLogs: [
      { day: 1, date: plusDays(TODAY, -2), status: 'COMPLETED', attendance: 'PRESENT', notes: 'Onboarding workstation configuration and platform security review.' },
      { day: 2, date: plusDays(TODAY, -1), status: 'COMPLETED', attendance: 'PRESENT', notes: 'Deposit dispute escalation procedures.' },
      { day: 3, date: TODAY, status: 'IN_PROGRESS', attendance: 'PRESENT', notes: 'Payment gateway testing and transaction queue management.' },
      { day: 4, date: plusDays(TODAY, 1), status: 'SCHEDULED', attendance: 'PRESENT' },
      { day: 5, date: plusDays(TODAY, 2), status: 'SCHEDULED', attendance: 'PRESENT' }
    ],
    assignedBy: 'Leila Haddad',
    createdAt: `${plusDays(TODAY, -2)}T08:15:00`,
    updatedAt: `${TODAY}T09:10:00`
  },
  {
    id: 'TRN-2026-0043',
    workerId: 'FL-00130',
    workerName: 'Mark Cruz',
    workerType: 'FREELANCER',
    platformCode: 'JAX-4',
    categoryCode: 'JAX',
    dept: 'WD',
    positionCode: 'WD-02',
    shift: 'MORNING',
    workstationPoolId: 'POOL-JAX4-WD',
    workstationId: 'WS-JAX4-WD-02',
    laptopAssetId: 'LAP-00122',
    trainingStartDate: plusDays(TODAY, -4),
    expectedCompletionDate: plusDays(TODAY, 1),
    requiredTrainingDays: 5,
    completedTrainingDays: 4,
    trainingStatus: 'IN_TRAINING',
    evaluation: null,
    actualCompletionDate: null,
    dailyLogs: [
      { day: 1, date: plusDays(TODAY, -4), status: 'COMPLETED', attendance: 'PRESENT', notes: 'Withdrawal verification rules for VIP tiers.' },
      { day: 2, date: plusDays(TODAY, -3), status: 'COMPLETED', attendance: 'PRESENT', notes: 'Anti-money laundering threshold limits and bank wire validations.' },
      { day: 3, date: plusDays(TODAY, -2), status: 'COMPLETED', attendance: 'PRESENT', notes: 'Payout queue handling under supervision.' },
      { day: 4, date: plusDays(TODAY, -1), status: 'COMPLETED', attendance: 'PRESENT', notes: 'Platform JAX-4 specific back-office modules.' },
      { day: 5, date: TODAY, status: 'IN_PROGRESS', attendance: 'PRESENT', notes: 'Shift shadowing and review.' }
    ],
    assignedBy: 'Daniel Mwangi',
    createdAt: `${plusDays(TODAY, -4)}T09:00:00`,
    updatedAt: `${TODAY}T08:45:00`
  }
];

export const db = {
  categories,
  platforms,
  employees,
  freelancers,
  availability,
  offDays,
  replacements,
  laptops,
  handovers,
  incidents,
  notifications,
  audit,
  rotationCycles,
  candidates,
  platformPositions,
  trainingAssignments,
  seq: {
    off: () => `OFF-${pad(offSeq++, 6)}`,
    rep: () => `REP-${pad(2600 + repSeq++, 5)}`,
    inc: () => `INC-2026-${pad(incSeq++, 4)}`,
    lap: () => `LAP-${pad(lapSeq++, 5)}`,
    ntf: () => `NTF-${pad(9100 + auditSeq, 4)}-${Math.floor(Math.random() * 1000)}`,
    trn: () => `TRN-2026-${pad(Math.floor(1050 + Math.random() * 8900), 4)}`,
    cnd: () => `CND-${pad(Math.floor(1060 + Math.random() * 8900), 4)}`
  }
};