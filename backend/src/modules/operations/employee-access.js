import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../../shared/errors.js';
import { audit } from '../audit/audit.model.js';

export function loginAccessMetadata(account,auth) {
  const disabledReason = !account ? 'No linked login. Register or link this staff member’s account first.'
    : account.user_id === auth.user.id ? 'You cannot change your own login access.'
    : account.role === 'SUPERVISOR' && !auth.permissions.includes('accounts.manage') ? 'Account-management permission is required for supervisor logins.' : null;
  return {hasAccount:!!account,revision:account?.access_revision ?? 0,canManage:auth.user.role === 'SUPERVISOR' && !disabledReason,disabledReason,changedAt:account?.access_changed_at ?? null};
}
export async function loadLoginAccounts(client) {
  return (await client.query('SELECT a.worker_id,u.id AS user_id,u.role,u.status,u.access_revision,u.access_changed_at FROM operational_accounts a JOIN users u ON u.id=a.user_id')).rows;
}
export async function setEmployeeLoginAccess(client,auth,state,args) {
  if (auth.user.role !== 'SUPERVISOR') throw new ApiError(403,'FORBIDDEN','Only supervisors can manage staff login access.');
  const [id,input]=z.tuple([z.string().min(1).max(100),z.object({enabled:z.boolean(),expectedRevision:z.number().int().positive()}).strict()]).parse(args);
  const employee=state.employees.find(e => e.id === id);
  if (!employee) throw new ApiError(404,'NOT_FOUND','Employee not found.');
  // Use the account administration lock order, including last-administrator protection.
  await client.query("SELECT id FROM users WHERE role='SUPERVISOR' ORDER BY id FOR UPDATE");
  const account=(await client.query('SELECT u.*,a.worker_id FROM operational_accounts a JOIN users u ON u.id=a.user_id WHERE a.worker_id=$1 FOR UPDATE OF u',[id])).rows[0];
  if (!account) throw new ApiError(409,'ACCOUNT_NOT_LINKED','Register or link a login before activating this staff member’s account.');
  if (account.id === auth.user.id) throw new ApiError(403,'SELF_ADMINISTRATION','Use another supervisor to change your own login access.');
  if (account.role === 'SUPERVISOR' && !auth.permissions.includes('accounts.manage')) throw new ApiError(403,'FORBIDDEN','Account-management permission is required for supervisor logins.');
  if (account.access_revision !== input.expectedRevision) throw new ApiError(409,'CONCURRENCY_CONFLICT','Login access changed. Refresh the employee record before trying again.');
  const worker=(await client.query('SELECT status FROM workers WHERE user_id=$1 OR worker_number=$2',[account.id,id])).rows;
  if (input.enabled && (employee.status === 'SUSPENDED' || worker.some(w => ['SUSPENDED','INACTIVE'].includes(w.status)))) throw new ApiError(409,'WORKER_INACTIVE','Reactivate the employment record before restoring login access.');
  const status=input.enabled ? 'ACTIVE' : 'LOCKED';
  if (account.status === status) return {...employee,accountStatus:status,loginAccess:loginAccessMetadata({...account,user_id:account.id},auth)};
  const reason=input.enabled ? 'Login activated from employee directory' : 'Login temporarily deactivated from employee directory';
  const updated=(await client.query('UPDATE users SET status=$1,access_revision=access_revision+1,access_changed_at=now(),access_changed_by=$2,access_change_reason=$3,updated_at=now() WHERE id=$4 RETURNING *',[status,auth.user.id,reason,account.id])).rows[0];
  if (account.role === 'SUPERVISOR') {
    const admins=await client.query("SELECT u.id FROM users u JOIN user_permissions p ON p.user_id=u.id WHERE u.status='ACTIVE' AND u.role='SUPERVISOR' AND p.permission='accounts.manage'");
    if (!admins.rows.length) throw new ApiError(409,'LAST_ADMIN','At least one active account administrator must remain.');
  }
  await client.query('DELETE FROM sessions WHERE user_id=$1',[account.id]);
  employee.accountStatus=status;
  const at=new Date().toISOString();
  state.audit.unshift({id:`AUD-${randomUUID()}`,at,actorId:auth.user.id,actorName:auth.user.name,role:'SUPERVISOR',action:'STAFF_LOGIN_ACCESS_CHANGED',entity:'Employee',entityId:id,platformCode:employee.platformCode || null,dept:employee.dept,previous:account.status,next:status,reason,isOverride:false});
  await audit(client,auth.user.id,'STAFF_LOGIN_ACCESS_CHANGED','user',account.id,{workerId:id,previous:account.status,next:status,reason});
  return {...employee,loginAccess:loginAccessMetadata({...updated,user_id:updated.id},auth)};
}
