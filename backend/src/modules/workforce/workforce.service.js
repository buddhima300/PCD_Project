import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { email, text } from '../../shared/validation.js';
import { transaction } from '../../db/pool.js';
import { audit } from '../audit/audit.model.js';
import { ApiError } from '../../shared/errors.js';

export const workerInput = z.object({ workerNumber: text, name: text, email, phone: z.string().max(40).default(''), workerType: z.enum(['EMPLOYEE','FREELANCER']), departmentCode: z.enum(['GS','DP','WD','SAFETY']), position: z.string().max(200).default(''), joinedAt: z.iso.date() }).strict();

export function workforceService(db) {
  return {
    async create(actor, input) {
      return transaction(db, async client => {
        const worker = (await client.query('INSERT INTO workers(id,worker_number,name,email,phone,worker_type,department_code,position,joined_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', [randomUUID(), input.workerNumber, input.name, input.email, input.phone, input.workerType, input.departmentCode, input.position, input.joinedAt])).rows[0];
        await audit(client, actor.id, 'WORKER_CREATED', 'worker', worker.id);
        return worker;
      });
    },
    async changeStatus(actor, id, { status, revision, reason }) {
      return transaction(db, async client => {
        const worker = (await client.query('SELECT * FROM workers WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!worker) throw new ApiError(404, 'NOT_FOUND', 'Worker not found.');
        if (worker.revision !== revision) throw new ApiError(409, 'CONFLICT', 'Worker changed. Reload before editing.');
        const result = await client.query('UPDATE workers SET status=$1,revision=revision+1 WHERE id=$2 RETURNING *', [status, id]);
        if (worker.user_id && ['SUSPENDED','INACTIVE'].includes(status)) {
          await client.query("UPDATE users SET status='LOCKED',updated_at=now() WHERE id=$1", [worker.user_id]);
          await client.query('DELETE FROM sessions WHERE user_id=$1', [worker.user_id]);
        }
        await audit(client, actor.id, 'WORKER_STATUS_CHANGED', 'worker', id, { previous: worker.status, next: status, reason });
        return result.rows[0];
      });
    },
  };
}
