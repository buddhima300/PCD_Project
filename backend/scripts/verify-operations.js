import { createDatabase } from '../src/db/pool.js';
import { collections } from '../src/modules/operations/store.js';
import { executeOperation } from '../src/modules/operations/service.js';
const db = createDatabase(process.env.DATABASE_URL);
try {
  const counts = {};
  for (const table of ['users','permissions','user_permissions','operational_accounts',...Object.values(collections).map(name => `ops_${name}`)]) counts[table] = (await db.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count;
  const user = (await db.query("SELECT id,name,email,role,title FROM users WHERE role='SUPERVISOR' AND status='ACTIVE' ORDER BY created_at LIMIT 1")).rows[0];
  const permissions = (await db.query('SELECT permission FROM user_permissions WHERE user_id=$1', [user.id])).rows.map(row => row.permission);
  const dashboard = await executeOperation(db, { user, permissions }, 'workflows', 'getDashboard', [{}]);
  console.log(JSON.stringify({ counts, dashboard: { employees: dashboard.kpis.permanentEmployees, freelancers: dashboard.kpis.freelancers, platforms: dashboard.kpis.totalPlatforms } }, null, 2));
} finally { await db.end(); }
