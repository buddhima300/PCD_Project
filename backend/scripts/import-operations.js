import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createDatabase, transaction } from '../src/db/pool.js';
import { createDomain } from '../src/modules/operations/runtime.js';
import { collections, saveState, linkAccount } from '../src/modules/operations/store.js';

const legacyTables = ['notifications', 'audit_events', 'workers', 'platform_capacities', 'platforms', 'platform_categories', 'departments'];
export async function importOperations(db, { reset = false, backup = true, nodeEnv = process.env.NODE_ENV ?? 'development' } = {}) {
  if (!['development', 'test'].includes(nodeEnv)) throw new Error('Fixture import is restricted to development/test databases.');
  const engine = await createDomain();
  const state = engine.snapshot();
  return transaction(db, async client => {
    await client.query('SELECT pg_advisory_xact_lock(726343)');
    await client.query('LOCK TABLE users,user_permissions IN SHARE MODE');
    const initialized = (await client.query("SELECT 1 FROM ops_state WHERE key='initialized'")).rows.length;
    if (initialized && !reset) throw new Error('Operational data already imported. Use --reset only to deliberately replace it.');
    const hasEquipment = (await client.query("SELECT to_regclass('equipment_allocations') AS table_name")).rows[0].table_name;
    const hasAttendance=(await client.query("SELECT to_regclass('attendance_confirmations') AS name")).rows[0].name;
    const attendanceTables=hasAttendance?['attendance_commands','attendance_corrections','attendance_handover_events','equipment_custody_sessions','attendance_confirmations','work_occurrences']:[];
    const tables = [...attendanceTables,...(hasEquipment ? ['equipment_allocations'] : []), ...Object.values(collections).map(name => `ops_${name}`), 'ops_state', 'operational_accounts', ...legacyTables];
    let backupPath;
    if (backup) {
      const saved = { createdAt: new Date().toISOString(), tables: {} };
      for (const table of tables) saved.tables[table] = (await client.query(`SELECT * FROM ${table}`)).rows;
      const directory = new URL('../backups/', import.meta.url);
      await mkdir(directory, { recursive: true });
      const file = new URL(`operations-${Date.now()}.json`, directory);
      await writeFile(file, JSON.stringify(saved), { flag: 'wx' });
      backupPath = file.pathname;
    }
    for (const table of tables) await client.query(`DELETE FROM ${table}`);
    await saveState(client, state);
    await client.query("INSERT INTO ops_state(key,data) VALUES('initialized',$1)", [JSON.stringify({ source: 'original-frontend-fixtures', importedAt: new Date().toISOString(), referenceDate: '2026-09-25' })]);
    const users = (await client.query('SELECT * FROM users ORDER BY created_at,id')).rows;
    for (const user of users) await linkAccount(client, user, state);
    for (const code of ['GS','DP','WD','SAFETY']) await client.query('INSERT INTO departments(code,name) VALUES($1,$2)', [code, code]);
    const categories = new Map();
    for (const category of state.categories) {
      const key = randomUUID(); categories.set(category.code, key);
      await client.query('INSERT INTO platform_categories(id,code,name,description,status) VALUES($1,$2,$3,$4,$5)', [key, category.code, category.name, category.description ?? '', category.status]);
    }
    for (const platform of state.platforms) {
      const key = randomUUID();
      await client.query('INSERT INTO platforms(id,code,category_id,name,lifecycle,status) VALUES($1,$2,$3,$4,$5,$6)', [key, platform.code, categories.get(platform.categoryCode), platform.name ?? platform.code, platform.lifecycle ?? 'OPERATIONAL', platform.status]);
      for (const [department, seats] of Object.entries(platform.departments)) await client.query('INSERT INTO platform_capacities(platform_id,department_code,seats,morning_target,night_target) VALUES($1,$2,$3,$4,$5)', [key, department, seats, Math.min(seats, platform.staffingTargets?.[department]?.MORNING ?? seats), Math.min(seats, platform.staffingTargets?.[department]?.NIGHT ?? seats)]);
    }
    const links = new Map((await client.query('SELECT user_id,worker_id FROM operational_accounts')).rows.map(row => [row.worker_id, row.user_id]));
    const emails = new Set();
    for (const [type, workers] of [['EMPLOYEE', state.employees], ['FREELANCER', state.freelancers]]) for (const worker of workers) {
      let email = worker.email.toLowerCase();
      if (emails.has(email)) email = `${worker.id.toLowerCase()}@example.test`;
      emails.add(email);
      await client.query('INSERT INTO workers(id,worker_number,user_id,name,email,phone,worker_type,department_code,position,status,lifecycle,joined_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [worker.uuid ?? randomUUID(), worker.id, links.get(worker.id) ?? null, worker.name, email, worker.phone ?? '', type, worker.dept, worker.position ?? 'Freelancer', worker.status, worker.status === 'INACTIVE' ? 'INACTIVE' : 'PRODUCTION_ACTIVE', worker.joinedAt]);
    }
    const imported = {};
    for (const [key, table] of Object.entries(collections)) imported[key] = (await client.query(`SELECT count(*)::int AS count FROM ops_${table}`)).rows[0].count;
    return { backupPath, preservedUsers: users.length, imported };
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(process.env.DATABASE_URL);
  try { console.log(JSON.stringify(await importOperations(db, { reset: process.argv.includes('--reset') }), null, 2)); }
  finally { await db.end(); }
}
