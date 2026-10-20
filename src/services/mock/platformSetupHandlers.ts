import type { DeptCapacity, DeptCode, Platform, PlatformCategory, ShiftCode } from '../../types/domain';
import { TODAY } from '../../utils/clock';
import { businessDate } from '../../utils/shiftTime';
import { ApiError, requireRole, respond } from './core';
import { db, DEPT_ORDER, plusDays, poolIdOf, pushAudit } from './db';
import { summarizePlatform } from './selectors';

import type { CategoryCreateInput, PlatformCreateInput, PlatformCapacityInput, PlatformAssignmentInput } from '../../types/platformSetup';

function audit(code: string | null, action: string, next: string) {
  const actor = requireRole('SUPERVISOR');
  pushAudit({ at: new Date().toISOString(), actorId: actor.userId, actorName: actor.name, role: actor.role, action, entity: 'Platform', entityId: code ?? next, platformCode: code, dept: null, previous: '—', next, reason: 'Supervisor platform setup', isOverride: false });
}
function get(code: string) {
  requireRole('SUPERVISOR');
  const p = db.platforms.find(p => p.code === code);
  if (!p) throw new ApiError('NOT_FOUND', 'Platform not found.', 404);
  return p;
}
function categoryDraft(input: CategoryCreateInput): PlatformCategory {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,11}$/.test(code) || !input.name.trim()) throw new ApiError('VALIDATION', 'Enter a category name and a 2–12 character alphanumeric code starting with a letter.', 422);
  if (db.categories.some(c => c.code === code || c.name.toLowerCase() === input.name.trim().toLowerCase())) throw new ApiError('DUPLICATE', 'That category code or name already exists.', 409);
  return { id: `CAT-${code}`, code, name: input.name.trim(), description: input.description.trim(), status: 'ACTIVE', createdAt: TODAY, updatedAt: TODAY };
}
export function seatCount(code: string, dept: DeptCode, shift: ShiftCode) {
  const production = db.employees.filter(e => e.platformCode === code && e.dept === dept && e.shift === shift && e.status === 'ACTIVE' && e.qualifiedForProduction !== false).length;
  const training = db.trainingAssignments.filter(t => t.platformCode === code && t.dept === dept && t.shift === shift && (t.trainingOnly ? !t.promotedAt && t.trainingStatus !== 'TRAINING_FAILED' : ['IN_TRAINING', 'TRAINING_EXTENDED', 'TRAINING_ASSIGNED'].includes(t.trainingStatus))).length;
  const freelancers = db.freelancers.filter(f => f.currentPlatform === code && f.dept === dept && f.trainingId && f.qualifiedForProduction && db.trainingAssignments.some(t => t.id === f.trainingId && (t.productionShift ?? t.shift) === shift && t.promotedAt)).length;
  return production + training + freelancers;
}
function availablePerson(id: string) {
  return !db.laptops.some(laptop => laptop.currentUserId === id) && !db.platformPositions.some(position => position.assignedWorkerId === id && position.status !== 'VACANT') && !db.trainingAssignments.some(training => training.workerId === id && !training.promotedAt && training.trainingStatus !== 'TRAINING_FAILED');
}

export function applyPlatformCapacity(code: string, input: PlatformCapacityInput) {
    const p = get(code);
    if (input.expectedRevision !== undefined && input.expectedRevision !== (p.revision ?? 1)) throw new ApiError('CONFLICT', 'Platform configuration changed. Refresh before saving again.', 409);
    const departments: DeptCapacity = {}; const targets: NonNullable<Platform['staffingTargets']> = {};
    for (const d of DEPT_ORDER) {
      const seats = input.departments[d] ?? 0;
      if (!Number.isInteger(seats) || seats < 0 || seats > 10000) throw new ApiError('VALIDATION', 'Seats must be whole numbers between 0 and 10,000.', 422);
      for (const shift of ['MORNING', 'NIGHT'] as const) {
        const target = input.staffingTargets[d]?.[shift] ?? 0;
        if (!Number.isInteger(target) || target < 0 || target > seats) throw new ApiError('VALIDATION', `${d} ${shift.toLowerCase()} target must be between 0 and ${seats} seats.`, 422);
        if (seatCount(code, d, shift) > seats) throw new ApiError('CAPACITY_CONFLICT', `${d} has assignments exceeding the proposed seats.`, 409);
      }
      if (db.laptops.some(laptop => laptop.platformCode === code && laptop.dept === d && laptop.workstationId && laptop.currentUserId && Number(laptop.workstationId.split('-').slice(-1)[0]) > seats)) throw new ApiError('CAPACITY_CONFLICT', `${d} has an occupied workstation outside the proposed capacity.`, 409);
      if (seats) { departments[d] = seats; targets[d] = { ...input.staffingTargets[d] ?? { MORNING: 0, NIGHT: 0 } }; }
    }
    if (!Object.keys(departments).length) throw new ApiError('VALIDATION', 'Configure at least one department with seats.', 422);
    p.departments = departments; p.staffingTargets = targets; p.updatedAt = new Date().toISOString(); p.revision = (p.revision ?? 1) + 1;
    audit(code, 'PLATFORM_CONFIG_CHANGE', JSON.stringify(input)); return summarizePlatform(p);
}

export const platformSetupApi = {
  promotePlatformTrainee: (id: string) => respond(() => {
    requireRole('SUPERVISOR');
    const t = db.trainingAssignments.find(t => t.id === id && t.trainingOnly);
    if (!t || t.promotedAt || t.trainingStatus !== 'TRAINING_COMPLETED' || t.evaluation?.result !== 'PASSED') throw new ApiError('VALIDATION', 'A passed training placement is required.', 422);
    const p = get(t.platformCode);
    if (p.status !== 'ACTIVE') throw new ApiError('VALIDATION', 'Activate the platform before assigning production staff.', 422);
    if (seatCount(p.code, t.dept, t.shift) > (p.departments[t.dept] ?? 0)) throw new ApiError('CAPACITY_CONFLICT', 'Review capacity before promotion.', 409);
    const emp = db.employees.find(e => e.id === t.workerId);
    const freelancer = db.freelancers.find(f => f.id === t.workerId);
    const candidate = db.candidates.find(c => c.id === t.workerId);
    if (!emp && !freelancer && !candidate) throw new ApiError('NOT_FOUND', 'Worker record not found.', 404);
    if (emp) { emp.lifecycle = 'PRODUCTION_ACTIVE'; emp.qualifiedForProduction = true; emp.trainingId = t.id; }
    else if (freelancer) { freelancer.lifecycle = 'PRODUCTION_ACTIVE'; freelancer.qualifiedForProduction = true; freelancer.trainingId = t.id; }
    else if (candidate?.employmentType === 'FREELANCER') {
      const id = `FL-${crypto.randomUUID()}`;
      db.freelancers.push({ uuid: crypto.randomUUID(), id, name: candidate.name, email: candidate.email, phone: candidate.phone, dept: t.dept, employmentType: 'EXTERNAL', priority: db.freelancers.filter(f => f.dept === t.dept).length + 1, status: 'ACTIVE', accountStatus: 'INVITED', compatibleCategories: [p.categoryCode], compatiblePlatforms: [p.code], currentAssignmentId: null, currentPlatform: p.code, joinedAt: TODAY, lifecycle: 'PRODUCTION_ACTIVE', qualifiedForProduction: true, trainingId: t.id });
      t.workerId = id;
    } else if (candidate) {
      const id = `EMP-${crypto.randomUUID()}`;
      db.employees.push({ uuid: crypto.randomUUID(), id, name: candidate.name, email: candidate.email, phone: candidate.phone, dept: t.dept, platformCode: p.code, categoryCode: p.categoryCode, position: candidate.position, shift: t.shift, nextShift: t.shift === 'MORNING' ? 'NIGHT' : 'MORNING', status: 'ACTIVE', accountStatus: 'INVITED', poolId: poolIdOf(p.code, t.dept), currentWorkstationId: null, workstationState: null, offDaysUsed: 0, offDaysAllowance: 4, joinedAt: TODAY, slot: 0, lifecycle: 'PRODUCTION_ACTIVE', qualifiedForProduction: true, trainingId: t.id });
      t.workerId = id;
    }
    t.promotedAt = new Date().toISOString(); p.revision = (p.revision ?? 1) + 1; audit(p.code, 'TRAINEE_PROMOTED', t.workerId); return t;
  }),
  createPlatformCategory: (input: CategoryCreateInput) => respond(() => {
    requireRole('SUPERVISOR');
    const c = categoryDraft(input); db.categories.push(c); audit(null, 'CATEGORY_CREATED', c.code); return c;
  }),
  createPlatform: (input: PlatformCreateInput) => respond(() => {
    requireRole('SUPERVISOR');
    const category = input.category ? categoryDraft(input.category) : db.categories.find(c => c.code === input.categoryCode && c.status === 'ACTIVE');
    if (!category) throw new ApiError('VALIDATION', 'Choose an active category.', 422);
    const code = input.code.trim().toUpperCase();
    if (!new RegExp(`^${category.code}-[1-9][0-9]*$`).test(code) || !input.name.trim()) throw new ApiError('VALIDATION', `Enter a name and a platform code such as ${category.code}-1.`, 422);
    if (db.platforms.some(p => p.code === code)) throw new ApiError('DUPLICATE', 'That platform code already exists.', 409);
    const p: Platform = { id: `PLAT-${code}`, code, categoryCode: category.code, name: input.name.trim(), description: input.description.trim(), status: 'INACTIVE', lifecycle: 'SETUP', departments: {}, staffingTargets: {}, revision:1, updatedAt: new Date().toISOString() };
    if (input.category) { db.categories.push(category); audit(null, 'CATEGORY_CREATED', category.code); }
    db.platforms.push(p); audit(code, 'PLATFORM_CREATED', 'SETUP'); return summarizePlatform(p);
  }),
  configurePlatformCapacity: (code: string, input: PlatformCapacityInput) => respond(() => applyPlatformCapacity(code, input)),
  listPlatformAssignmentOptions: (code: string, dept: DeptCode) => respond(() => {
    get(code);
    const candidates = db.candidates.filter(candidate => candidate.dept === dept && ['SELECTED','ONBOARDING'].includes(candidate.status) && availablePerson(candidate.registeredWorkerId ?? candidate.id));
    const registered = new Set(candidates.map(candidate => candidate.registeredWorkerId));
    return {
      production: db.employees.filter(e => e.dept === dept && e.status === 'ACTIVE' && e.accountStatus === 'ACTIVE' && e.qualifiedForProduction !== false && e.platformCode !== code && !e.currentWorkstationId && availablePerson(e.id)),
      training: [
        ...candidates.map(candidate => ({id:candidate.registeredWorkerId ?? candidate.id,name:candidate.name})),
        ...db.employees.filter(e => e.dept === dept && e.status === 'ACTIVE' && e.accountStatus === 'ACTIVE' && e.qualifiedForProduction === false && !registered.has(e.id) && !e.currentWorkstationId && availablePerson(e.id)).map(e => ({ id:e.id,name:e.name })),
        ...db.freelancers.filter(f => f.dept === dept && f.status === 'ACTIVE' && f.accountStatus === 'ACTIVE' && f.qualifiedForProduction === false && !registered.has(f.id) && availablePerson(f.id)).map(f => ({id:f.id,name:f.name}))
      ]
    };
  }),
  assignPlatformWorker: (code: string, input: PlatformAssignmentInput) => respond(() => {
    const p = get(code); const seats = p.departments[input.dept] ?? 0;
    if (!['MORNING', 'NIGHT'].includes(input.shift) || !seats) throw new ApiError('VALIDATION', 'Choose a configured department and shift.', 422);
    if (seatCount(code, input.dept, input.shift) >= seats) throw new ApiError('CAPACITY_CONFLICT', 'No seats remain on this department and shift.', 409);
    const cand = db.candidates.find(c => (c.id === input.workerId || c.registeredWorkerId === input.workerId) && c.dept === input.dept && c.status !== 'PLACED');
    const workerId = cand?.registeredWorkerId ?? input.workerId;
    const emp = db.employees.find(e => e.id === workerId && e.dept === input.dept && e.status === 'ACTIVE' && e.accountStatus === 'ACTIVE');
    const freelancer = db.freelancers.find(f => f.id === workerId && f.dept === input.dept && f.status === 'ACTIVE' && f.accountStatus === 'ACTIVE');
    if ((!emp && !cand && !freelancer) || (cand?.registeredWorkerId && !emp && !freelancer) || emp?.currentWorkstationId || !availablePerson(workerId)) throw new ApiError('ASSIGNMENT_CONFLICT', 'Person is unavailable or already assigned. Refresh the people list.', 409);
    if (input.kind === 'PRODUCTION') {
      if (!emp || emp.qualifiedForProduction === false || emp.platformCode === code) throw new ApiError('VALIDATION', 'Choose an eligible qualified employee.', 422);
      emp.platformCode = code; emp.categoryCode = p.categoryCode; emp.poolId = poolIdOf(code, input.dept); emp.shift = input.shift; emp.nextShift = input.shift === 'MORNING' ? 'NIGHT' : 'MORNING'; emp.lifecycle = 'PRODUCTION_ACTIVE';
    } else {
      if(p.status!=='ACTIVE' || p.lifecycle==='SETUP')throw new ApiError('VALIDATION','Training requires an active production platform.',422);
      if ((emp && emp.qualifiedForProduction !== false) || (freelancer && freelancer.qualifiedForProduction !== false)) throw new ApiError('VALIDATION', 'Qualified production staff cannot be assigned as trainees.', 422);
      const days = input.trainingDays ?? 5;
      if (!Number.isInteger(days) || days < 1 || days > 90) throw new ApiError('VALIDATION', 'Training duration must be 1–90 days.', 422);
      const worker = emp ?? freelancer ?? cand!; const id = `TRN-${crypto.randomUUID()}`;
      const trainingDate = businessDate(new Date().toISOString());
      db.trainingAssignments.unshift({ id, workerId: worker.id, workerName: worker.name, workerType: cand?.employmentType ?? (freelancer ? 'FREELANCER' : 'PERMANENT'), platformCode: code, categoryCode: p.categoryCode, dept: input.dept, positionCode: `TRAINING-${input.dept}`, shift: input.shift, workstationPoolId: poolIdOf(code, input.dept), workstationId: '', laptopAssetId: '', trainingStartDate: trainingDate, expectedCompletionDate: plusDays(trainingDate, days - 1), actualCompletionDate: null, requiredTrainingDays: days, completedTrainingDays: 0, trainingStatus: 'IN_TRAINING', evaluation: null, dailyLogs: Array.from({ length: days }, (_, i) => ({ day: i + 1, date: plusDays(trainingDate, i), status: 'SCHEDULED', attendance: 'PRESENT' })), assignedBy: requireRole('SUPERVISOR').name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), trainingOnly: true });
      if (cand) cand.status = 'PLACED';
      Object.assign(db.trainingAssignments[0],{trainingNotes:input.trainingNotes??'',candidateReference:cand?.candidateReference??cand?.id??worker.id});
      if (emp) { emp.platformCode = code; emp.categoryCode = p.categoryCode; emp.poolId = poolIdOf(code, input.dept); emp.shift = input.shift; emp.nextShift = input.shift === 'MORNING' ? 'NIGHT' : 'MORNING'; emp.lifecycle = 'IN_PLATFORM_TRAINING'; }
      if (freelancer) { freelancer.currentPlatform = code; freelancer.compatibleCategories = [p.categoryCode]; freelancer.compatiblePlatforms = [code]; freelancer.lifecycle = 'IN_PLATFORM_TRAINING'; }
    }
    p.revision = (p.revision ?? 1) + 1; p.updatedAt = new Date().toISOString(); audit(code, 'PLATFORM_ASSIGNMENT', `${input.kind}: ${input.workerId} / ${input.dept} / ${input.shift}`); return summarizePlatform(p);
  }),
  activatePlatform: (code: string) => respond(() => {
    const p = get(code);
    if (!db.categories.some(c => c.code === p.categoryCode && c.status === 'ACTIVE') || !DEPT_ORDER.some(d => (p.departments[d] ?? 0) > 0)) throw new ApiError('VALIDATION', 'An active category and configured capacity are required.', 422);
    p.lifecycle = 'OPERATIONAL'; p.status = 'ACTIVE'; p.updatedAt = new Date().toISOString(); p.revision = (p.revision ?? 1) + 1; audit(code, 'PLATFORM_ACTIVATED', 'OPERATIONAL'); return summarizePlatform(p);
  })
};
