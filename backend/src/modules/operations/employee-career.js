import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../../shared/errors.js';
import { assertPlatformRelease } from './employee-platform.js';
import { audit } from '../audit/audit.model.js';

export const employeeCareerMethods = new Set(['unassignEmployeePlatform','getEmployeeCareerOptions','promoteEmployee']);
const levels = ['STAFF','PIC','TL','SPV'];
const level = z.enum(levels);
const id = z.string().min(1).max(100);
const reason = z.string().trim().min(5).max(1000);
const schemas = {
  unassignEmployeePlatform:z.tuple([id,z.object({expectedPlatform:z.string().min(1).max(40),reason}).strict()]),
  getEmployeeCareerOptions:z.tuple([id]),
  promoteEmployee:z.tuple([id,z.object({expectedLevel:level,expectedRevision:z.number().int().nonnegative(),nextLevel:level,reason,grantSupervisorAccess:z.boolean()}).strict()])
};
const fail = (code,message,status=409) => {throw new ApiError(status,code,message);};
function trainingOpen(state,id) {
  return state.trainingAssignments.some(t => t.workerId === id && (t.trainingOnly ? !t.promotedAt && t.trainingStatus !== 'TRAINING_FAILED' : ['IN_TRAINING','TRAINING_EXTENDED','TRAINING_ASSIGNED'].includes(t.trainingStatus)));
}
function checkReservations(allocations,id) {
  if (allocations.some(a => a.workerId === id && a.state !== 'CANCELLED' && Date.parse(`${a.date}T${a.shift === 'MORNING' ? '07' : '19'}:30:00+05:30`)+12*3600000 > Date.now())) fail('ALLOCATION_CONFLICT','Resolve existing equipment reservations before changing platform membership.');
}
function record(state,auth,employee,action,previous,next,reason,platformCode=employee.platformCode || null) {
  const at = new Date().toISOString();
  state.audit.unshift({id:`AUD-${randomUUID()}`,at,actorId:auth.user.id,actorName:auth.user.name,role:'SUPERVISOR',action,entity:'Employee',entityId:employee.id,platformCode,dept:employee.dept,previous,next,reason,isOverride:false});
  return at;
}
export async function employeeCareerOperation(client,auth,state,method,args,allocations) {
  if (auth.user.role !== 'SUPERVISOR') fail('FORBIDDEN','Only supervisors can manage employee assignments and career progression.',403);
  const [employeeId,input] = schemas[method].parse(args);
  const employee = state.employees.find(e => e.id === employeeId);
  if (!employee) fail('NOT_FOUND','Employee not found.',404);
  const account = (await client.query('SELECT u.id,u.role,u.status FROM users u JOIN operational_accounts a ON a.user_id=u.id WHERE a.worker_id=$1',[employeeId])).rows[0];
  if (method === 'unassignEmployeePlatform') {
    if (employee.platformCode !== input.expectedPlatform) fail('CONCURRENCY_CONFLICT','The platform assignment changed. Refresh the employee record before unassigning.');
    checkReservations(allocations,employeeId);
    assertPlatformRelease(state,employeeId);
    const previous = employee.platformCode;
    const at = new Date().toISOString();
    employee.platformHistory ??= [{platformCode:previous,from:employee.joinedAt,to:null,reason:'Existing assignment'}];
    for (const entry of employee.platformHistory) if (!entry.to) entry.to=at;
    for (const p of state.platformPositions.filter(p => p.assignedWorkerId === employeeId || p.reservedForWorkerId === employeeId)) Object.assign(p,{status:'VACANT',assignedWorkerId:null,assignedWorkerName:null,assignedWorkerType:null,reservedForWorkerId:null,workstationId:null,updatedAt:at});
    Object.assign(employee,{platformCode:'',categoryCode:'',poolId:'',positionCode:undefined,slot:0,currentWorkstationId:null,workstationState:null,lifecycle:'PLATFORM_PLACEMENT_REQUIRED'});
    const platform = state.platforms.find(p => p.code === previous);
    if (platform) {platform.revision=(platform.revision ?? 1)+1;platform.updatedAt=at;}
    record(state,auth,employee,'EMPLOYEE_PLATFORM_UNASSIGNED',previous,'Unassigned',input.reason,previous);
    state.notifications.unshift({id:`NTF-${randomUUID()}`,type:'PLATFORM_ASSIGNMENT',title:'Platform assignment ended',body:`You have been unassigned from ${previous}. Your employee account remains active.`,createdAt:at,read:false,emailStatus:'NOT_SENT',link:'/profile',recipientRoles:[account?.role ?? 'EMPLOYEE'],recipientId:employeeId});
    await audit(client,auth.user.id,'EMPLOYEE_PLATFORM_UNASSIGNED','worker',employeeId,{previous,reason:input.reason});
    return employee;
  }
  const currentLevel = employee.careerLevel ?? 'STAFF';
  if (!levels.includes(currentLevel)) fail('CAREER_INVALID','Review this employee’s career level before promotion.',422);
  const nextLevel = levels[levels.indexOf(currentLevel)+1] ?? null;
  const blockedReason = !nextLevel ? 'This employee is already at the highest career level.'
    : employee.status !== 'ACTIVE' || employee.accountStatus !== 'ACTIVE' || (account && account.status !== 'ACTIVE') ? 'Promotion requires active employment and an active account.'
    : employee.qualifiedForProduction === false || trainingOpen(state,employeeId) ? 'Complete qualification and training before career promotion.' : null;
  if (method === 'getEmployeeCareerOptions') return {
    currentLevel,nextLevel,revision:employee.careerRevision ?? 0,hasLinkedAccount:!!account,hasSupervisorAccess:account?.role === 'SUPERVISOR',
    canGrantSupervisorAccess:auth.permissions.includes('accounts.manage') && !!account && account.status === 'ACTIVE' && account.role === 'EMPLOYEE',
    supervisorAccessBlocker:employee.platformCode ? 'Unassign the employee from their production platform before granting supervisor access.' : null,
    blockedReason
  };
  if (input.expectedLevel !== currentLevel || input.expectedRevision !== (employee.careerRevision ?? 0)) fail('CONCURRENCY_CONFLICT','The career record changed. Refresh before promoting.');
  if (blockedReason) fail('PROMOTION_INELIGIBLE',blockedReason,422);
  if (input.nextLevel !== nextLevel) fail('INVALID_CAREER_TRANSITION','Promote only to the next level: Staff → PIC → TL → SPV.',422);
  let accessGranted=false;
  if (input.grantSupervisorAccess) {
    if (nextLevel !== 'SPV') fail('INVALID_ACCESS_CHANGE','Supervisor access is only available with SPV promotion.',422);
    if (!auth.permissions.includes('accounts.manage')) fail('FORBIDDEN','Account-management permission is required to grant supervisor access.',403);
    // Follow the account service lock order and serialize promotion with login/access changes.
    await client.query("SELECT id FROM users WHERE role='SUPERVISOR' ORDER BY id FOR UPDATE");
    const trusted = (await client.query("SELECT u.id FROM users u JOIN user_permissions p ON p.user_id=u.id WHERE u.id=$1 AND u.role='SUPERVISOR' AND u.status='ACTIVE' AND p.permission='accounts.manage'",[auth.user.id])).rows[0];
    if (!trusted) fail('FORBIDDEN','Account-management permission is required to grant supervisor access.',403);
    const linked = (await client.query('SELECT u.id,u.role,u.status FROM users u JOIN operational_accounts a ON a.user_id=u.id WHERE a.worker_id=$1 FOR UPDATE OF u',[employeeId])).rows[0];
    if (!linked || linked.role !== 'EMPLOYEE' || linked.status !== 'ACTIVE') fail('ACCOUNT_INELIGIBLE','An active employee login is required for supervisor access.',422);
    if (employee.platformCode) fail('SUPERVISOR_ASSIGNMENT_CONFLICT','Unassign the employee from their production platform before granting supervisor access.');
    checkReservations(allocations,employeeId);
    assertPlatformRelease(state,employeeId);
    await client.query("UPDATE users SET role='SUPERVISOR',title='Supervisor (SPV)',access_revision=access_revision+1,access_changed_at=now(),access_changed_by=$2,access_change_reason='SPV promotion granted supervisor access',updated_at=now() WHERE id=$1",[linked.id,auth.user.id]);
    await client.query("UPDATE operational_accounts SET role='SUPERVISOR' WHERE user_id=$1",[linked.id]);
    await client.query('DELETE FROM sessions WHERE user_id=$1',[linked.id]);
    await audit(client,auth.user.id,'SUPERVISOR_ACCESS_GRANTED','user',linked.id,{workerId:employeeId,previousRole:'EMPLOYEE',role:'SUPERVISOR'});
    accessGranted=true;
  }
  const at=record(state,auth,employee,'EMPLOYEE_CAREER_PROMOTED',currentLevel,nextLevel,input.reason);
  employee.careerLevel=nextLevel;
  employee.careerRevision=(employee.careerRevision ?? 0)+1;
  employee.careerHistory ??= [];
  employee.careerHistory.unshift({id:`CAREER-${randomUUID()}`,from:currentLevel,to:nextLevel,at,actorId:auth.user.id,actorName:auth.user.name,reason:input.reason,platformCode:employee.platformCode || '',dept:employee.dept,supervisorAccessGranted:accessGranted});
  state.notifications.unshift({id:`NTF-${randomUUID()}`,type:'CAREER_PROMOTION',title:`Career promotion · ${nextLevel}`,body:`You have been promoted from ${currentLevel} to ${nextLevel}.${accessGranted ? ' Sign in again for supervisor access.' : ''}`,createdAt:at,read:false,emailStatus:'NOT_SENT',link:'/profile',recipientRoles:[accessGranted ? 'SUPERVISOR' : account?.role ?? 'EMPLOYEE'],recipientId:employeeId});
  await audit(client,auth.user.id,'EMPLOYEE_CAREER_PROMOTED','worker',employeeId,{from:currentLevel,to:nextLevel,reason:input.reason,supervisorAccessGranted:accessGranted});
  return {employee,supervisorAccessGranted:accessGranted};
}
