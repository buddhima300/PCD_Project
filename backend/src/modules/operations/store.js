import { ApiError } from '../../shared/errors.js';

export const collections = { categories: 'categories', platforms: 'platforms', employees: 'employees', freelancers: 'freelancers', offDays: 'off_days', replacements: 'replacements', laptops: 'laptops', handovers: 'handovers', incidents: 'incidents', notifications: 'notifications', audit: 'audit', rotationCycles: 'rotation_cycles', candidates: 'candidates', platformPositions: 'platform_positions', trainingAssignments: 'training_assignments' };
const nested = { disciplinaryCases: ['disciplinary','cases','disciplinary_cases'], warningLetters: ['disciplinary','warnings','warning_letters'], disciplinaryEvents: ['disciplinary','events','disciplinary_events'], breakSessions: ['breaks','sessions','break_sessions'], breakRequests: ['breaks','requests','break_requests'], breakPolicies: ['breaks','policies','break_policies'], profileEvents: ['profile','events','profile_events'] };
for (const [key, [,,table]] of Object.entries(nested)) collections[key] = table;
collections.availabilityRecords = 'availability';
function flatten(state) {
  const result = structuredClone(state);
  for (const [key, [group, field]] of Object.entries(nested)) { result[key] = result[group]?.[field] ?? []; if (result[group]) delete result[group][field]; }
  result.availabilityRecords = Object.entries(result.availability ?? {}).map(([id, calendar]) => ({ id, calendar }));
  delete result.availability;
  return result;
}
function inflate(state) {
  for (const [key, [group, field]] of Object.entries(nested)) { state[group] ??= {}; state[group][field] = state[key]; delete state[key]; }
  state.availability = Object.fromEntries(state.availabilityRecords.map(record => [record.id, record.calendar]));
  delete state.availabilityRecords;
  return state;
}
const recordId = (record, ordinal) => String(record.id ?? record.assetId ?? record.code ?? ordinal);
export async function loadState(client) {
  const rows = (await client.query('SELECT key,data FROM ops_state')).rows;
  if (!rows.some(row => row.key === 'initialized')) throw new ApiError(503, 'DATA_NOT_IMPORTED', 'Import the original operational dataset before using these workflows.');
  const state = Object.fromEntries(rows.filter(row => row.key !== 'initialized').map(row => [row.key, row.data]));
  for (const [key, table] of Object.entries(collections)) state[key] = (await client.query(`SELECT data FROM ops_${table} ORDER BY ordinal`)).rows.map(row => row.data);
  return inflate(state);
}
export async function saveState(client, state, previous = {}) {
  state = flatten(state); previous = flatten(previous);
  for (const [key, table] of Object.entries(collections)) {
    const before = new Map((previous[key] ?? []).map((record, ordinal) => [recordId(record, ordinal), { record, ordinal }]));
    const retained = new Set();
    for (const [ordinal, record] of state[key].entries()) {
      const id = recordId(record, ordinal);
      if (retained.has(id)) throw new ApiError(409, 'DUPLICATE_DOMAIN_ID', `Duplicate ${key} ID: ${id}`);
      retained.add(id);
      const existing = before.get(id);
      if (existing?.ordinal === ordinal && JSON.stringify(existing.record) === JSON.stringify(record)) continue;
      await client.query(`INSERT INTO ops_${table}(id,ordinal,data) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET ordinal=excluded.ordinal,data=excluded.data`, [id, ordinal, JSON.stringify(record)]);
    }
    for (const id of before.keys()) if (!retained.has(id)) await client.query(`DELETE FROM ops_${table} WHERE id=$1`, [id]);
  }
  for (const [key, value] of Object.entries(state)) if (!(key in collections) && JSON.stringify(value) !== JSON.stringify(previous[key])) await client.query('INSERT INTO ops_state(key,data) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET data=excluded.data', [key, JSON.stringify(value)]);
}

export async function linkAccount(client, user, state) {
  const existing = (await client.query('SELECT worker_id,role FROM operational_accounts WHERE user_id=$1', [user.id])).rows[0];
  if (existing) {
    if (existing.role !== user.role) throw new ApiError(409, 'ROLE_CHANGED', 'The account role changed; relink its workforce record.');
    return existing.worker_id;
  }
  const used = new Set((await client.query('SELECT worker_id FROM operational_accounts')).rows.map(row => row.worker_id));
  let workerId;
  if (user.role === 'SUPERVISOR') workerId = ['USR-SUP-001', 'USR-MGR-014'].find(id => !used.has(id)) ?? user.id;
  else {
    const people = user.role === 'EMPLOYEE' ? state.employees : state.freelancers;
    const primary = user.role === 'EMPLOYEE' ? 'EMP-00421' : 'FL-00124';
    const available = people.filter(person => !used.has(person.id) && person.status === 'ACTIVE' && person.accountStatus === 'ACTIVE');
    const linked = (await client.query('SELECT worker_number FROM workers WHERE user_id=$1', [user.id])).rows[0];
    const worker = available.find(person => person.id === linked?.worker_number) ?? available.find(person => person.email.toLowerCase() === user.email.toLowerCase()) ?? available.find(person => person.id === primary) ?? available[0];
    if (!worker) throw new ApiError(409, 'WORKER_LINK_REQUIRED', 'No unlinked active worker is available for this account.');
    workerId = worker.id;
  }
  await client.query('INSERT INTO operational_accounts(user_id,worker_id,role) VALUES($1,$2,$3)', [user.id, workerId, user.role]);
  return workerId;
}

// Only identity fields and exact ID arguments are translated; descriptions are left intact.
export function translate(value, mapping) {
  if (typeof value === 'string') return mapping.get(value) ?? value;
  if (Array.isArray(value)) return value.map(item => translate(item, mapping));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [mapping.get(key) ?? key, translate(item, mapping)]));
  return value;
}
