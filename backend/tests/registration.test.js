import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { hashPassword, verifyPassword } from '../src/shared/security.js';
import { importOperations } from '../scripts/import-operations.js';
import { loadState } from '../src/modules/operations/store.js';

for (const staffType of ['PERMANENT','FREELANCER']) test(`${staffType} intake creates staff, login and candidate atomically; placement preserves identity and password changes work`, async () => {
  const engine = new PGlite(); let server;
  const db = { query:(sql, params) => engine.query(sql, params), connect:async () => ({ query:(sql, params) => engine.query(sql, params), release() {} }) };
  const initialPassword = 'Initial-staff-password-42'; const newPassword = 'Changed-staff-password-42';
  const origin = 'http://localhost:5173';
  try {
    for (const file of ['001_foundation.sql','002_operations.sql','003_workflow_records.sql','004_equipment_allocations.sql','005_login_access_controls.sql','007_staff_number_counters.sql']) await engine.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    const id = randomUUID();
    await db.query("INSERT INTO users(id,email,name,role,password_hash) VALUES($1,'register-admin@example.test','Registration Supervisor','SUPERVISOR',$2)", [id, await hashPassword(initialPassword)]);
    await db.query("INSERT INTO user_permissions(user_id,permission) VALUES($1,'accounts.manage')", [id]);
    await importOperations(db, { backup:false, nodeEnv:'test' });
    server = createApp(db, readConfig({ NODE_ENV:'test', DATABASE_URL:'postgresql://unused', FRONTEND_ORIGIN:origin })).listen(0,'127.0.0.1');
    await new Promise(resolve => server.once('listening',resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const request = async (path, body, session, csrf = true, method = 'POST') => {
      const headers = { Origin:origin, 'Content-Type':'application/json', ...(session ? { Cookie:session.cookie, ...(csrf ? {'X-CSRF-Token':session.csrfToken} : {}) } : {}) };
      const response = await fetch(base + path, { method, headers, ...(method !== 'GET' ? { body:JSON.stringify(body) } : {}) });
      return { status:response.status, data:response.status === 204 ? null : await response.json(), cookie:response.headers.get('set-cookie')?.split(';')[0] };
    };
    const login = async (email, password = initialPassword) => {
      const result = await request('/auth/login', { email,password });
      assert.equal(result.status,200,JSON.stringify(result.data)); return { cookie:result.cookie, ...result.data };
    };
    const supervisor = await login('register-admin@example.test');
    const intake = (type, email) => ({ name:type === 'PERMANENT' ? 'Kasun Intake' : 'Fathima Intake', email, password:initialPassword, phone:'+94770000123', dept:'DP', position:'Deposit Agent', interviewResult:'SELECTED', employmentType:type, notes:'Interview completed' });
    const employeeInput = intake('PERMANENT','intake-employee@example.test');
    assert.equal((await request('/staff/register',employeeInput,supervisor,false)).status,403);
    assert.equal((await request('/staff/register',{...employeeInput, role:'SUPERVISOR'},supervisor)).status,422);
    assert.equal((await request('/staff/register',{...employeeInput,password:'short'},supervisor)).status,422);
    for (const type of [staffType]) {
      const input = type === 'PERMANENT' ? employeeInput : intake(type,'intake-freelancer@example.test');
      const created = await request('/staff/register',input,supervisor);
      assert.equal(created.status,201,JSON.stringify(created.data));
      const {user,workerId,candidate} = created.data;
      assert.equal(user.role,type === 'PERMANENT' ? 'EMPLOYEE' : 'FREELANCER');
      assert.equal(candidate.registeredWorkerId,workerId);
      assert.ok(!JSON.stringify(created.data).includes(initialPassword));
      const record = (await db.query('SELECT password_hash FROM users WHERE id=$1',[user.id])).rows[0];
      assert.equal(await verifyPassword(initialPassword,record.password_hash),true);
      assert.equal((await db.query('SELECT worker_number FROM workers WHERE user_id=$1',[user.id])).rows[0].worker_number,workerId);
      assert.equal((await db.query('SELECT worker_id FROM operational_accounts WHERE user_id=$1',[user.id])).rows[0].worker_id,workerId);
      const table = type === 'PERMANENT' ? 'ops_employees' : 'ops_freelancers';
      assert.equal((await db.query(`SELECT data->>'lifecycle' AS lifecycle FROM ${table} WHERE id=$1`,[workerId])).rows[0].lifecycle,'PLATFORM_PLACEMENT_REQUIRED');
      const worker = await login(input.email);
      const work = await request('/operations/workflows/getMyWork',{args:[]},worker);
      assert.equal(work.status,200,JSON.stringify(work.data)); assert.equal(work.data.person.id,user.id); assert.equal(work.data.person.name,input.name); assert.equal(work.data.platform,null);
      if(type === 'PERMANENT') {
        const roster = await request('/operations/workflows/getRoster',{args:[{month:'2026-10'}]},worker); assert.equal(roster.status,200); assert.equal(roster.data.rows.length,0);
      }
      assert.equal((await request('/staff/register',intake('PERMANENT',`forbidden-${type}@example.test`),worker)).status,403);
      const countBefore = (await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n;
      assert.equal((await request('/staff/register',input,supervisor)).status,409);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n,countBefore);
      const collision = {...input,email:`duplicate-login-${type.toLowerCase()}@example.test`};
      await db.query('INSERT INTO users(id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5)',[randomUUID(),collision.email,'Existing login','SUPERVISOR',record.password_hash]);
      const candidatesBefore = (await db.query('SELECT count(*)::int AS n FROM ops_candidates')).rows[0].n;
      assert.equal((await request('/staff/register',collision,supervisor)).status,409);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM ops_candidates')).rows[0].n,candidatesBefore);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM workers WHERE email=$1',[collision.email])).rows[0].n,0);
      const state = await loadState(db);
      const code=state.categories[0].code+'-9999';
      for(const [method,args] of [['createPlatform',[{categoryCode:state.categories[0].code,code,name:'Intake training',description:''}]],['configurePlatformCapacity',[code,{departments:{DP:1},staffingTargets:{DP:{MORNING:1,NIGHT:1}},expectedRevision:1}]],['activatePlatform',[code]]]) {
        const response=await request('/operations/workflows/'+method,{args},supervisor);
        assert.equal(response.status,200,JSON.stringify(response.data));
      }
      const placed=await request('/operations/workflows/assignPlatformWorker',{args:[code,{workerId:user.id,kind:'TRAINING',dept:'DP',shift:'MORNING',trainingDays:5}]},supervisor);
      assert.equal(placed.status,200,JSON.stringify(placed.data));
      const trainings=await request('/operations/workflows/listTrainings',{args:[{platform:code}]},supervisor);
      assert.equal(trainings.data[0].workerId,user.id);
      assert.equal((await request('/operations/workflows/placeWorker',{args:[{}]},supervisor)).status,410);
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE data->>'email'=$1`,[input.email])).rows[0].n,1);
      assert.equal((await db.query('SELECT worker_id FROM operational_accounts WHERE user_id=$1',[user.id])).rows[0].worker_id,workerId);
      assert.equal((await request('/auth/change-password',{currentPassword:'Wrong-password-42',newPassword},worker)).status,401);
      // A rejected current password does not erase the valid server session.
      assert.equal((await request('/auth/change-password',{currentPassword:initialPassword,newPassword},worker)).status,204);
      assert.equal((await request('/auth/me',undefined,worker,true,'GET')).status,401);
      assert.equal((await request('/auth/login',{email:input.email,password:initialPassword})).status,401);
      assert.equal((await login(input.email,newPassword)).user.id,user.id);
    }
  } finally { if(server) await new Promise(resolve => server.close(resolve)); await engine.close(); }
});
