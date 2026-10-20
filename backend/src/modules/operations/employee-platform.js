import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../shared/errors.js';

const shift = z.enum(['MORNING','NIGHT']);
export const employeePlatformMethods = new Set(['getEmployeePlatformOptions','setEmployeePlatform']);
const fail = (code, message, status = 409) => { throw new ApiError(status, code, message); };
const instant = value => Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}+05:30`);
export function assertPlatformRelease(state, id) {
  const now = Date.now();
  if ((state.roster?.requests ?? []).some(r => r.employeeId === id && ['PENDING','APPROVED'].includes(r.status) && r.intervals.some(i => Date.parse(i.end) > now))) fail('OFFDAY_CONFLICT','Resolve upcoming leave requests and coverage before changing platform membership.');
  if (state.trainingAssignments.some(t => t.workerId === id && (t.trainingOnly ? !t.promotedAt && t.trainingStatus !== 'TRAINING_FAILED' : ['IN_TRAINING','TRAINING_EXTENDED','TRAINING_ASSIGNED'].includes(t.trainingStatus)))) fail('TRAINING_REQUIRED','Resolve the active training placement before changing platform membership.');
  if (state.laptops.some(l => l.currentUserId === id)) fail('DEVICE_RETURN_REQUIRED','Verify the return of the device currently held before changing platform membership.');
  if (state.replacements.some(r => r.absentEmployeeId === id && !['CANCELLED','FAILED'].includes(r.status) && instant(r.shiftEnd) > now)) fail('REPLACEMENT_CONFLICT','Resolve upcoming replacement coverage before changing platform membership.');
  if (state.offDays.some(o => o.employeeId === id && ['APPROVED','OVERRIDE_APPROVED','REQUESTED'].includes(o.status) && o.date >= new Date(now+330*60000).toISOString().slice(0,10))) fail('OFFDAY_CONFLICT','Resolve upcoming off-day requests before changing platform membership.');
}
export function offDayBalance(state, employee, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Colombo',year:'numeric',month:'2-digit'}).formatToParts(now);
  const period = `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`;
  const used = new Set(state.offDays.filter(o => o.employeeId === employee.id && o.date.startsWith(period) && ['APPROVED','OVERRIDE_APPROVED'].includes(o.status)).map(o => o.date)).size;
  const allowance = employee.offDaysAllowance ?? 0;
  return {month:period,allowance,used,remaining:Math.max(0,allowance-used)};
}
function occupied(state, code, dept, shift) {
  const ids = new Set(state.employees.filter(w => w.platformCode === code && w.dept === dept && w.shift === shift && w.status !== 'SUSPENDED' && (w.qualifiedForProduction !== false || state.trainingAssignments.some(t => t.workerId === w.id && !t.promotedAt && t.trainingStatus !== 'TRAINING_FAILED'))).map(w => w.id));
  for (const t of state.trainingAssignments.filter(t => t.platformCode === code && t.dept === dept && t.shift === shift && !t.promotedAt && t.trainingStatus !== 'TRAINING_FAILED')) ids.add(t.workerId);
  for (const f of state.freelancers.filter(f => f.currentPlatform === code && f.dept === dept && f.status === 'ACTIVE')) {
    if (state.trainingAssignments.some(t => t.workerId === f.id && (t.productionShift ?? t.shift) === shift && t.promotedAt)) ids.add(f.id);
  }
  return ids.size;
}
export function employeePlatformOperation(auth,state,method,args) {
  if (auth.user.role !== 'SUPERVISOR') fail('FORBIDDEN','Only supervisors can assign or change platforms.',403);
  const [id,input] = method === 'setEmployeePlatform'
    ? z.tuple([z.string().min(1),z.object({platformCode:z.string().min(1),shift,expectedPlatform:z.string(),reason:z.string().trim().min(5).max(1000)}).strict()]).parse(args)
    : [...z.tuple([z.string().min(1),shift]).parse(args)];
  const employee = state.employees.find(w => w.id === id);
  if (!employee) fail('NOT_FOUND','Employee not found.',404);
  const selectedShift = method === 'setEmployeePlatform' ? input.shift : input;
  const options = state.platforms.filter(p => p.status === 'ACTIVE' && p.lifecycle !== 'SETUP' && p.departments[employee.dept] > 0 && p.code !== employee.platformCode).map(p => {
    const capacity = p.departments[employee.dept];
    const used = occupied(state,p.code,employee.dept,selectedShift);
    const devices = state.laptops.filter(l => l.platformCode === p.code && l.dept === employee.dept && !['MAINTENANCE','RETIRED','INCIDENT'].includes(l.status) && l.condition !== 'DAMAGED' && !state.incidents.some(i => i.assetId === l.assetId && i.status !== 'RESOLVED'));
    return {code:p.code,name:p.name ?? p.code,capacity,used,available:Math.max(0,capacity-used),usableDevices:devices.length};
  });
  if (method !== 'setEmployeePlatform') return options;
  if ((employee.platformCode ?? '') !== input.expectedPlatform) fail('CONCURRENCY_CONFLICT','This employee’s platform changed. Refresh before saving.');
  if (employee.status !== 'ACTIVE' || employee.accountStatus !== 'ACTIVE') fail('EMPLOYEE_INELIGIBLE','Only active employees with active accounts can be assigned.',422);
  if (employee.qualifiedForProduction === false || state.trainingAssignments.some(t => t.workerId === id && (t.trainingOnly ? !t.promotedAt && t.trainingStatus !== 'TRAINING_FAILED' : ['IN_TRAINING','TRAINING_EXTENDED','TRAINING_ASSIGNED'].includes(t.trainingStatus)))) fail('TRAINING_REQUIRED','Manage this employee through the training placement workflow.',422);
  const destination = options.find(p => p.code === input.platformCode);
  if (!destination) fail('PLATFORM_INELIGIBLE','Choose another active platform in the employee’s department.',422);
  if (!destination.available) fail('CAPACITY_CONFLICT','No shared device capacity remains for this shift.');
  assertPlatformRelease(state,id);
  const previous = employee.platformCode ?? '';
  const at = new Date().toISOString();
  employee.platformHistory ??= previous ? [{platformCode:previous,from:employee.joinedAt,to:null,reason:'Existing assignment'}] : [];
  for (const entry of employee.platformHistory) if (!entry.to) entry.to = at;
  employee.platformHistory.unshift({platformCode:input.platformCode,from:at,to:null,reason:input.reason});
  for (const p of state.platformPositions.filter(p => p.assignedWorkerId === id || p.reservedForWorkerId === id)) Object.assign(p,{assignedWorkerId:null,assignedWorkerName:null,assignedWorkerType:null,reservedForWorkerId:null,status:'VACANT',workstationId:null,updatedAt:at});
  const platform = state.platforms.find(p => p.code === input.platformCode);
  let position = state.platformPositions.find(p => p.platformCode === platform.code && p.dept === employee.dept && p.shift === input.shift && p.status === 'VACANT');
  if (!position) {
    const slot = Math.max(0,...state.platformPositions.filter(p => p.platformCode === platform.code && p.dept === employee.dept).map(p => p.slot))+1;
    position = {id:`POS-${randomUUID()}`,platformCode:platform.code,categoryCode:platform.categoryCode,dept:employee.dept,positionCode:`${employee.dept}-${slot}`,slot,shift:input.shift,status:'VACANT',assignedWorkerId:null,assignedWorkerName:null,assignedWorkerType:null,reservedForWorkerId:null,workstationId:null,updatedAt:at};
    state.platformPositions.push(position);
  }
  Object.assign(position,{status:'ACTIVE',assignedWorkerId:id,assignedWorkerName:employee.name,assignedWorkerType:'PERMANENT',workstationId:null,updatedAt:at});
  Object.assign(employee,{platformCode:platform.code,categoryCode:platform.categoryCode,poolId:`POOL-${platform.code.replace('-','')}-${employee.dept}`,positionCode:position.positionCode,shift:input.shift,nextShift:input.shift === 'MORNING' ? 'NIGHT' : 'MORNING',currentWorkstationId:null,workstationState:null,slot:0,lifecycle:'PRODUCTION_ACTIVE'});
  for (const p of state.platforms.filter(p => [previous,platform.code].includes(p.code))) p.revision = (p.revision ?? 1)+1;
  state.audit.unshift({id:`AUD-${randomUUID()}`,at,actorId:auth.user.id,actorName:auth.user.name,role:'SUPERVISOR',action:previous ? 'EMPLOYEE_PLATFORM_CHANGED' : 'EMPLOYEE_PLATFORM_ASSIGNED',entity:'Employee',entityId:id,platformCode:platform.code,dept:employee.dept,previous,next:platform.code,reason:input.reason,isOverride:false});
  state.notifications.unshift({id:`NTF-${randomUUID()}`,type:'PLATFORM_ASSIGNMENT',title:'Platform assignment updated',body:`You are assigned to ${platform.code} / ${input.shift.toLowerCase()}. Use any available shared device in your platform pool.`,createdAt:at,read:false,emailStatus:'NOT_SENT',link:'/my/workstation',recipientRoles:['EMPLOYEE'],recipientId:id});
  return employee;
}
