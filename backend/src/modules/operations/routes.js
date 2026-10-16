import { Router } from 'express';
import { z } from 'zod';
import { executeOperation } from './service.js';
import { requirePermission } from '../auth/auth.middleware.js';
import { transaction } from '../../db/pool.js';
import { ApiError } from '../../shared/errors.js';

export function operationsRoutes(db) {
  const router = Router();
  const input = z.object({ args: z.array(z.unknown()).max(12) }).strict();
  router.get('/links', requirePermission('accounts.manage'), async (_req, res) => {
    const accounts = (await db.query('SELECT u.id,u.name,u.email,u.role,a.worker_id FROM users u LEFT JOIN operational_accounts a ON a.user_id=u.id ORDER BY u.name')).rows;
    const workers = (await db.query("SELECT id,data->>'name' AS name,'EMPLOYEE' AS role FROM ops_employees UNION ALL SELECT id,data->>'name' AS name,'FREELANCER' AS role FROM ops_freelancers ORDER BY name")).rows;
    res.json({ accounts, workers });
  });
  router.put('/links/:userId', requirePermission('accounts.manage'), async (req, res) => {
    const userId = z.string().uuid().parse(req.params.userId);
    const { workerId } = z.object({ workerId: z.string().min(1).max(100) }).strict().parse(req.body);
    await transaction(db, async client => {
      await client.query('SELECT pg_advisory_xact_lock(726343)');
      const user = (await client.query('SELECT id,role FROM users WHERE id=$1', [userId])).rows[0];
      if (!user || !['EMPLOYEE','FREELANCER'].includes(user.role)) throw new ApiError(422, 'WORKER_ROLE', 'Choose an employee or freelancer login.');
      const table = user.role === 'EMPLOYEE' ? 'ops_employees' : 'ops_freelancers';
      if (!(await client.query(`SELECT 1 FROM ${table} WHERE id=$1`, [workerId])).rows.length) throw new ApiError(422, 'WORKER_ROLE', 'Worker type must match the login role.');
      await client.query('INSERT INTO operational_accounts(user_id,worker_id,role) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET worker_id=excluded.worker_id,role=excluded.role', [userId, workerId, user.role]);
      await client.query('UPDATE workers SET user_id=NULL WHERE user_id=$1', [userId]);
      await client.query('UPDATE workers SET user_id=$1 WHERE worker_number=$2', [userId, workerId]);
      await client.query('DELETE FROM sessions WHERE user_id=$1', [userId]);
      await client.query('INSERT INTO audit_events(id,actor_id,action,entity,entity_id,details) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5)', [req.auth.user.id,'WORKER_LOGIN_LINKED','user',userId,JSON.stringify({ workerId })]);
    });
    res.status(204).end();
  });
  router.post('/:group/:method', async (req, res) => {
    const group = z.enum(['workflows', 'breaks']).parse(req.params.group);
    const method = z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/).max(80).parse(req.params.method);
    const { args } = input.parse(req.body);
    res.json(await executeOperation(db, req.auth, group, method, args));
  });
  return router;
}
