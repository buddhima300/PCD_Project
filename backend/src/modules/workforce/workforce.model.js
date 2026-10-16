export async function listWorkers(db, { page, pageSize, workerType, unlinked }, user) {
  const restricted = user.role !== 'SUPERVISOR';
  const values = [];
  const conditions = [];
  if (restricted) { values.push(user.id); conditions.push(`user_id=$${values.length}`); }
  if (workerType) { values.push(workerType); conditions.push(`worker_type=$${values.length}`); }
  if (unlinked === 'true') conditions.push("user_id IS NULL AND status NOT IN ('SUSPENDED','INACTIVE')");
  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const total = Number((await db.query(`SELECT count(*) AS total FROM workers${where}`, values)).rows[0].total);
  const result = await db.query(`SELECT * FROM workers${where} ORDER BY worker_number LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, pageSize, (page - 1) * pageSize]);
  return { items: result.rows, total, page, pageSize };
}
