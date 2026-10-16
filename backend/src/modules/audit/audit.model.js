import { randomUUID } from 'node:crypto';

export async function audit(db, actorId, action, entity, entityId, details = {}) {
  await db.query('INSERT INTO audit_events (id,actor_id,action,entity,entity_id,details) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), actorId, action, entity, entityId, JSON.stringify(details)]);
}
