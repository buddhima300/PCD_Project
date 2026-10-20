import { randomUUID } from 'node:crypto';

// Keep the original SQL platform/capacity tables in sync with the operational records.
// Both projections are saved in the caller's transaction, before any response is sent.
export async function projectPlatforms(client, state, previous) {
  const oldCategories = new Map(previous.categories.map(row => [row.code,JSON.stringify(row)]));
  const existingCategories = new Set((await client.query('SELECT code FROM platform_categories')).rows.map(row => row.code));
  for (const category of state.categories) if (!existingCategories.has(category.code) || oldCategories.get(category.code) !== JSON.stringify(category)) await client.query('INSERT INTO platform_categories(id,code,name,description,status) VALUES($1,$2,$3,$4,$5) ON CONFLICT(code) DO UPDATE SET name=excluded.name,description=excluded.description,status=excluded.status', [randomUUID(),category.code,category.name,category.description ?? '',category.status]);
  const categories = new Map((await client.query('SELECT id,code FROM platform_categories')).rows.map(row => [row.code,row.id]));
  const oldPlatforms = new Map(previous.platforms.map(row => [row.code,JSON.stringify(row)]));
  for (const platform of state.platforms) if (oldPlatforms.get(platform.code) !== JSON.stringify(platform)) {
    const row = (await client.query('INSERT INTO platforms(id,code,category_id,name,description,lifecycle,status) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(code) DO UPDATE SET category_id=excluded.category_id,name=excluded.name,description=excluded.description,lifecycle=excluded.lifecycle,status=excluded.status,revision=platforms.revision+1 RETURNING id', [randomUUID(),platform.code,categories.get(platform.categoryCode),platform.name ?? platform.code,platform.description ?? '',platform.lifecycle ?? 'OPERATIONAL',platform.status])).rows[0];
    await client.query('DELETE FROM platform_capacities WHERE platform_id=$1',[row.id]);
    for (const [department,seats] of Object.entries(platform.departments)) if (seats) await client.query('INSERT INTO platform_capacities(platform_id,department_code,seats,morning_target,night_target) VALUES($1,$2,$3,$4,$5)', [row.id,department,seats,platform.staffingTargets?.[department]?.MORNING ?? seats,platform.staffingTargets?.[department]?.NIGHT ?? seats]);
  }
  const oldWorkers = new Map([...previous.employees,...previous.freelancers].map(row => [row.id,JSON.stringify(row)]));
  for (const worker of [...state.employees,...state.freelancers]) if (oldWorkers.get(worker.id) !== JSON.stringify(worker)) {
    const lifecycle = worker.status === 'INACTIVE' ? 'INACTIVE' : worker.qualifiedForProduction === false ? 'ONBOARDING' : 'PRODUCTION_ACTIVE';
    const changed = await client.query('UPDATE workers SET name=$1,phone=$2,department_code=$3,position=$4,status=$5,lifecycle=$6,revision=revision+1 WHERE worker_number=$7 RETURNING id', [worker.name,worker.phone,worker.dept,worker.position ?? 'Freelancer',worker.status,lifecycle,worker.id]);
    if (!changed.rows.length) await client.query('INSERT INTO workers(id,worker_number,name,email,phone,worker_type,department_code,position,status,lifecycle,joined_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [randomUUID(),worker.id,worker.name,worker.email.toLowerCase(),worker.phone,state.employees.some(employee => employee.id === worker.id) ? 'EMPLOYEE' : 'FREELANCER',worker.dept,worker.position ?? 'Freelancer',worker.status,lifecycle,worker.joinedAt]);
  }
}
