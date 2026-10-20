import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { transaction } from '../../db/pool.js';
import { audit } from '../audit/audit.model.js';
import { publicUser } from '../auth/auth.model.js';
import { hashPassword } from '../../shared/security.js';
import { email, password, roles, text, uuid, permission } from '../../shared/validation.js';
import { ApiError } from '../../shared/errors.js';
import { workerInput } from '../workforce/workforce.service.js';

export const accountInput = z.object({ email, password, name: text, title: text.optional(), role: roles, workerId: uuid.optional(), worker: workerInput.optional(), permissions: z.array(permission).max(20).default([]) }).strict();
export const accountChange = z.object({ status: z.enum(['ACTIVE', 'LOCKED']), permissions: z.array(permission).max(20).optional() }).strict();

export function accountsService(db) {
  return {
    async create(actor, input) {
      const hash = await hashPassword(input.password);
      return transaction(db, async client => {
        let worker;
        if (input.worker && input.workerId) throw new ApiError(422, 'VALIDATION', 'Choose a new worker or an existing worker, not both.');
        if (input.role === 'SUPERVISOR' && (input.worker || input.workerId)) throw new ApiError(422, 'VALIDATION', 'Supervisor accounts do not require worker records.');
        if (input.role !== 'SUPERVISOR' && input.permissions?.length) throw new ApiError(422, 'VALIDATION', 'Management grants require a Supervisor account.');
        if (input.worker) {
          const data = input.worker;
          if (data.workerType !== input.role || data.email !== input.email || data.name !== input.name) throw new ApiError(422, 'WORKER_MISMATCH', 'Worker name, email and type must match the account.');
          worker = (await client.query('INSERT INTO workers(id,worker_number,name,email,phone,worker_type,department_code,position,joined_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', [randomUUID(),data.workerNumber,data.name,data.email,data.phone,data.workerType,data.departmentCode,data.position,data.joinedAt])).rows[0];
          await audit(client, actor.id, 'WORKER_CREATED', 'worker', worker.id);
        }
        if (input.role !== 'SUPERVISOR') {
          if (!worker && !input.workerId) throw new ApiError(422, 'WORKER_REQUIRED', 'Provide worker details to register and create a login, or select an existing worker.');
          if (!worker) worker = (await client.query('SELECT * FROM workers WHERE id=$1 FOR UPDATE', [input.workerId])).rows[0];
          if (!worker || worker.worker_type !== input.role || worker.user_id || worker.email !== input.email || ['SUSPENDED', 'INACTIVE'].includes(worker.status)) throw new ApiError(409, 'WORKER_CONFLICT', 'Worker must be eligible, unlinked and match the account role and email.');
        }
        const id = randomUUID();
        const user = (await client.query('INSERT INTO users(id,email,name,title,role,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [id, input.email, input.name, input.title ?? '', input.role, hash])).rows[0];
        if (worker) await client.query('UPDATE workers SET user_id=$1,revision=revision+1 WHERE id=$2', [id, worker.id]);
        for (const grant of new Set(input.permissions ?? [])) await client.query('INSERT INTO user_permissions(user_id,permission) VALUES($1,$2)', [id,grant]);
        await audit(client, actor.id, 'ACCOUNT_CREATED', 'user', id, { role: input.role, permissions: input.permissions ?? [] });
        return publicUser(user);
      });
    },
    async change(actor, id, input) {
      return transaction(db, async client => {
        // Serialize permission administration to preserve the last active administrator.
        await client.query("SELECT id FROM users WHERE role='SUPERVISOR' ORDER BY id FOR UPDATE");
        const user = (await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!user) throw new ApiError(404, 'NOT_FOUND', 'Account not found.');
        if (id === actor.id) throw new ApiError(403, 'SELF_ADMINISTRATION', 'Use another account administrator to change your own access.');
        if (input.permissions?.length && user.role !== 'SUPERVISOR') throw new ApiError(422, 'VALIDATION', 'Management grants require a Supervisor account.');
        if (input.status === 'ACTIVE') {
          const worker = (await client.query('SELECT status FROM workers WHERE user_id=$1', [id])).rows[0];
          if (worker && ['SUSPENDED', 'INACTIVE'].includes(worker.status)) throw new ApiError(409, 'WORKER_INACTIVE', 'Reactivate the worker before unlocking the account.');
        }
        await client.query("UPDATE users SET status=$1,access_revision=access_revision+1,access_changed_at=now(),access_changed_by=$3,access_change_reason='Account administrator updated access',updated_at=now() WHERE id=$2", [input.status, id, actor.id]);
        if (input.permissions) {
          await client.query('DELETE FROM user_permissions WHERE user_id=$1', [id]);
          for (const permission of new Set(input.permissions)) await client.query('INSERT INTO user_permissions(user_id,permission) VALUES($1,$2)', [id, permission]);
        }
        const admins = await client.query("SELECT u.id FROM users u JOIN user_permissions p ON p.user_id=u.id WHERE u.role='SUPERVISOR' AND u.status='ACTIVE' AND p.permission='accounts.manage'");
        if (!admins.rows.length) throw new ApiError(409, 'LAST_ADMIN', 'At least one active account administrator must remain.');
        await client.query('DELETE FROM sessions WHERE user_id=$1', [id]);
        await audit(client, actor.id, 'ACCOUNT_ACCESS_CHANGED', 'user', id, { status: input.status, permissions: input.permissions });
        return publicUser({ ...user, status: input.status });
      });
    },
  };
}
