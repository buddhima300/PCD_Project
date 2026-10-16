import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/shared/security.js';
import { readConfig } from '../src/config.js';

let engine, db, server, base, admin, employee, outsider, supervisor, workerId;
const origin = 'http://localhost:5173';
const pass = 'A-long-test-password-42';

async function request(path, { method = 'GET', body, session, csrf = true, trustedOrigin = true } = {}) {
  const headers = {};
  if (trustedOrigin) headers.Origin = origin;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session) { headers.Cookie = session.cookie; if (csrf) headers['X-CSRF-Token'] = session.csrfToken; }
  const response = await fetch(`${base}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: response.status === 204 ? null : await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0], response };
}
async function login(email) {
  const result = await request('/auth/login', { method:'POST', body:{email,password:pass} });
  assert.equal(result.status,200,JSON.stringify(result.data));
  return { cookie: result.cookie, ...result.data };
}

before(async () => {
  engine = new PGlite();
  await engine.exec(await readFile(new URL('../migrations/001_foundation.sql',import.meta.url),'utf8'));
  // Tests are serial: this adapter pins every transaction to the same embedded engine.
  db = { query: (sql,params) => engine.query(sql,params), connect: async () => ({ query: (sql,params) => engine.query(sql,params), release() {} }) };
  const hash = await hashPassword(pass);
  const ids = {};
  for (const [name,role] of [['admin','SUPERVISOR'],['employee','EMPLOYEE'],['outsider','FREELANCER'],['supervisor','SUPERVISOR']]) {
    ids[name] = randomUUID();
    await db.query('INSERT INTO users(id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5)',[ids[name],`${name}@example.com`,name,role,hash]);
  }
  await db.query("INSERT INTO user_permissions(user_id,permission) VALUES($1,'accounts.manage'),($1,'audit.read')",[ids.admin]);
  workerId = randomUUID();
  await db.query("INSERT INTO workers(id,worker_number,user_id,name,email,worker_type,department_code,joined_at) VALUES($1,'EMP-1',$2,'Employee','employee@example.com','EMPLOYEE','DP','2026-01-01')",[workerId,ids.employee]);
  const app = createApp(db,readConfig({ NODE_ENV:'test',DATABASE_URL:'postgresql://unused',FRONTEND_ORIGIN:origin }));
  server = app.listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  admin = await login('admin@example.com');
  employee = await login('employee@example.com');
  outsider = await login('outsider@example.com');
  supervisor = await login('supervisor@example.com');
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (engine) await engine.close();
});

test('trusted login, opaque cookie, and server identity; client role injection is rejected', async () => {
  const me = await request('/auth/me',{session:employee});
  assert.equal(me.status,200);
  assert.equal(me.data.user.role,'EMPLOYEE');
  assert.equal('password_hash' in me.data.user,false);
  const injected = await request('/auth/login',{method:'POST',body:{email:'employee@example.com',password:pass,role:'SUPERVISOR'}});
  assert.equal(injected.status,422);
  assert.equal((await request('/auth/login',{method:'POST',body:{email:'unknown@example.com',password:pass}})).status,401);
  const cookie = (await request('/auth/login',{method:'POST',body:{email:'admin@example.com',password:pass}})).response.headers.get('set-cookie');
  assert.match(cookie,/HttpOnly/);
  assert.match(cookie,/SameSite=Strict/);
});

test('write Origin and CSRF checks apply independently of role', async () => {
  assert.equal((await request('/auth/logout',{method:'POST',session:employee,csrf:false})).status,403);
  assert.equal((await request('/auth/login',{method:'POST',trustedOrigin:false,body:{email:'admin@example.com',password:pass}})).status,403);
  assert.equal((await request('/workers',{method:'POST',session:employee,body:{}})).status,403);
  assert.equal((await request('/accounts',{session:supervisor})).status,403);
  assert.equal((await request('/audit',{session:supervisor})).status,403);
  assert.equal((await request('/workers')).status,401);
});

test('workers and notifications enforce owner identity in database queries', async () => {
  const mine = await request('/workers',{session:employee});
  assert.equal(mine.data.total,1);
  assert.equal(mine.data.items[0].id,workerId);
  assert.equal((await request('/workers?workerType=FREELANCER',{session:employee})).data.total,0);
  assert.equal((await request('/workers?workerType=INVALID',{session:admin})).status,422);
  assert.equal((await request('/workers',{session:outsider})).data.total,0);
  const id = randomUUID();
  await db.query("INSERT INTO notifications(id,recipient_id,type,title,body) VALUES($1,$2,'TEST','Personal notice','Private')",[id,employee.user.id]);
  assert.equal((await request('/notifications',{session:outsider})).data.total,0);
  assert.equal((await request(`/notifications/${id}/read`,{method:'PATCH',session:outsider,body:{}})).status,404);
  assert.equal((await request(`/notifications/${id}/read`,{method:'PATCH',session:employee,body:{}})).status,200);
  assert.equal((await request('/notifications?unreadOnly=true',{session:employee})).data.total,0);
  assert.equal((await request('/notifications?unreadOnly=false',{session:employee})).data.total,1);
});

test('platform setup validates targets, prevents duplicate codes and rejects stale revisions', async () => {
  const category = await request('/platform-categories',{method:'POST',session:admin,body:{code:'general',name:'General'}});
  assert.equal(category.status,201);
  assert.equal(category.data.code,'GENERAL');
  assert.equal((await request('/platform-categories',{method:'POST',session:admin,body:{code:'GENERAL',name:'Duplicate'}})).status,409);
  const platform = await request('/platforms',{method:'POST',session:admin,body:{code:'pcd-1',name:'PCD 1',categoryId:category.data.id}});
  assert.equal(platform.status,201);
  const path = `/platforms/${platform.data.id}`;
  assert.equal((await request(`${path}/activate`,{method:'POST',session:admin,body:{revision:1}})).status,409);
  const departments = [{departmentCode:'DP',seats:5,morningTarget:3,nightTarget:5}];
  assert.equal((await request(`${path}/capacity`,{method:'PUT',session:admin,body:{revision:1,departments:[{...departments[0],morningTarget:6}]}})).status,422);
  assert.equal((await request(`${path}/capacity`,{method:'PUT',session:admin,body:{revision:1,departments}})).status,200);
  assert.equal((await request(`${path}/activate`,{method:'POST',session:admin,body:{revision:1}})).status,409);
  const activated = await request(`${path}/activate`,{method:'POST',session:admin,body:{revision:2}});
  assert.equal(activated.data.lifecycle,'OPERATIONAL');
  assert.equal((await request(`${path}/capacity`,{method:'PUT',session:admin,body:{revision:3,departments}})).status,409);
});

test('provisioning links only a matching worker; failed provisioning rolls back account and audit', async () => {
  const worker = await request('/workers',{method:'POST',session:admin,body:{workerNumber:'FL-2',name:'New worker',email:'new@example.com',workerType:'FREELANCER',departmentCode:'DP',joinedAt:'2026-10-16'}});
  assert.equal(worker.status,201);
  const invalid = await request('/accounts',{method:'POST',session:admin,body:{name:'Wrong role',email:'new@example.com',password:pass,role:'EMPLOYEE',workerId:worker.data.id}});
  assert.equal(invalid.status,409);
  assert.equal((await db.query("SELECT 1 FROM users WHERE email='new@example.com'")).rows.length,0);
  const created = await request('/accounts',{method:'POST',session:admin,body:{name:'New worker',email:'new@example.com',password:pass,role:'FREELANCER',workerId:worker.data.id}});
  assert.equal(created.status,201);
  const newSession = await login('new@example.com');
  assert.equal((await request('/workers',{session:newSession})).data.items[0].id,worker.data.id);
  assert.equal((await request('/accounts',{method:'POST',session:admin,body:{name:'No worker',email:'none@example.com',password:pass,role:'EMPLOYEE'}})).status,422);
});

test('permission updates revoke sessions and invalid grants roll back changes', async () => {
  const changed = await request(`/accounts/${supervisor.user.id}/access`,{method:'PATCH',session:admin,body:{status:'ACTIVE',permissions:['audit.read']}});
  assert.equal(changed.status,200);
  assert.equal((await request('/auth/me',{session:supervisor})).status,401);
  supervisor = await login('supervisor@example.com');
  assert.equal((await request('/audit',{session:supervisor})).status,200);
  assert.equal((await request(`/accounts/${supervisor.user.id}/access`,{method:'PATCH',session:admin,body:{status:'LOCKED',permissions:['invented.permission']}})).status,422);
  assert.equal((await request('/auth/me',{session:supervisor})).status,200);
  assert.equal((await request(`/accounts/${admin.user.id}/access`,{method:'PATCH',session:admin,body:{status:'LOCKED'}})).status,403);
});

test('one-step onboarding creates linked employee/freelancer logins and explicitly granted Supervisors', async () => {
  for (const role of ['EMPLOYEE','FREELANCER']) {
    const name=`New ${role}`;
    const email=`onboard-${role.toLowerCase()}@example.com`;
    const body={name,email,password:pass,role,worker:{workerNumber:`ONBOARD-${role}`,name,email,workerType:role,departmentCode:'DP',joinedAt:'2026-10-16'}};
    const created=await request('/accounts',{method:'POST',session:admin,body});
    assert.equal(created.status,201,JSON.stringify(created.data));
    const linked=(await db.query('SELECT * FROM workers WHERE user_id=$1',[created.data.id])).rows[0];
    assert.equal(linked.worker_type,role);
    const signedIn=await login(email);
    assert.equal(signedIn.user.role,role);
    assert.equal((await request('/workers',{session:signedIn})).data.total,1);
    assert.equal((await request('/accounts',{session:signedIn})).status,403);
  }
  const created=await request('/accounts',{method:'POST',session:admin,body:{name:'New Supervisor',email:'new-supervisor@example.com',password:pass,role:'SUPERVISOR',permissions:['accounts.manage','audit.read']}});
  assert.equal(created.status,201);
  const signedIn=await login('new-supervisor@example.com');
  assert.ok(signedIn.permissions.includes('accounts.manage'));
  assert.equal((await request('/accounts',{session:signedIn})).status,200);
});

test('onboarding rejects mismatches and grant escalation, with no orphan worker on duplicate account', async () => {
  const body={name:'Duplicate',email:'admin@example.com',password:pass,role:'EMPLOYEE',worker:{workerNumber:'ROLLBACK-ONBOARD',name:'Duplicate',email:'admin@example.com',workerType:'EMPLOYEE',departmentCode:'DP',joinedAt:'2026-10-16'}};
  assert.equal((await request('/accounts',{method:'POST',session:admin,body})).status,409);
  assert.equal((await db.query("SELECT 1 FROM workers WHERE worker_number='ROLLBACK-ONBOARD'")).rows.length,0);
  assert.equal((await request('/accounts',{method:'POST',session:admin,body:{...body,email:'different@example.com'}})).status,422);
  assert.equal((await request('/accounts',{method:'POST',session:admin,body:{...body,permissions:['accounts.manage']}})).status,422);
  assert.equal((await request('/accounts',{method:'POST',session:supervisor,body:{name:'Forbidden',email:'no@example.com',password:pass,role:'SUPERVISOR',permissions:['accounts.manage']}})).status,403);
});

test('configured API origin can write with cookie and CSRF; unrelated origins and missing tokens remain blocked', async () => {
  const path=`${base}/api/v1/platform-categories`;
  const send=(origin,csrf)=>fetch(path,{method:'POST',headers:{Origin:origin,Cookie:admin.cookie,'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':admin.csrfToken}:{})},body:JSON.stringify({code:'DOCS-WRITE',name:'Docs write'})});
  assert.equal((await send('http://localhost:3001',false)).status,403);
  assert.equal((await send('https://untrusted.example',true)).status,403);
  assert.equal((await send('http://localhost:3001',true)).status,201);
});

test('worker suspension invalidates login; stale edits do not mutate worker or audit', async () => {
  const stale = await request(`/workers/${workerId}/status`,{method:'PATCH',session:admin,body:{status:'SUSPENDED',revision:99,reason:'Review'}});
  assert.equal(stale.status,409);
  assert.equal((await request('/auth/me',{session:employee})).status,200);
  assert.equal((await request(`/workers/${workerId}/status`,{method:'PATCH',session:admin,body:{status:'SUSPENDED',revision:1,reason:'Review'}})).status,200);
  assert.equal((await request('/auth/me',{session:employee})).status,401);
  assert.equal((await request('/auth/login',{method:'POST',body:{email:'employee@example.com',password:pass}})).status,401);
  assert.equal((await request(`/accounts/${employee.user.id}/access`,{method:'PATCH',session:admin,body:{status:'ACTIVE'}})).status,409);
});

test('password change and logout revoke credentials; expired sessions are rejected', async () => {
  const second = await login('outsider@example.com');
  assert.equal((await request('/auth/change-password',{method:'POST',session:outsider,body:{currentPassword:'incorrect',newPassword:'Another-long-password-42'}})).status,401);
  assert.equal((await request('/auth/change-password',{method:'POST',session:outsider,body:{currentPassword:pass,newPassword:'Another-long-password-42'}})).status,204);
  assert.equal((await request('/auth/me',{session:second})).status,401);
  const latest = await login('supervisor@example.com');
  assert.equal((await request('/auth/logout',{method:'POST',session:latest})).status,204);
  assert.equal((await request('/auth/me',{session:latest})).status,401);
  await db.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",[admin.user.id]);
  assert.equal((await request('/auth/me',{session:admin})).status,401);
});

test('configuration rejects insecure production origins', () => {
  assert.throws(() => readConfig({DATABASE_URL:'postgresql://unused',NODE_ENV:'production',FRONTEND_ORIGIN:origin}),/HTTPS/);
  assert.throws(() => readConfig({DATABASE_URL:'postgresql://unused',FRONTEND_ORIGIN:`${origin}/path`}),/origin/);
});

test('health/readiness and invalid query inputs return bounded responses', async () => {
  assert.equal((await fetch(`${base}/health`)).status,200);
  assert.equal((await fetch(`${base}/ready`)).status,200);
  assert.equal((await request('/workers?pageSize=100000',{session:supervisor})).status,422);
  assert.equal((await request('/workers?page=0',{session:supervisor})).status,422);
  assert.equal((await request('/platforms/not-a-uuid/activate',{method:'POST',session:supervisor,body:{revision:1}})).status,422);
});

test('login attempts are rate limited', async () => {
  let last;
  for (let i=0;i<21;i++) {
    last = await request('/auth/login',{method:'POST',body:{email:'nobody@example.com',password:pass}});
    if (last.status === 429) break;
  }
  assert.equal(last.status,429);
  assert.equal(last.data.error.code,'RATE_LIMIT');
});

test('Swagger UI and generated JSON are accessible and serve local assets under security headers', async () => {
  const specResponse = await fetch(`${base}/api-docs.json`);
  assert.equal(specResponse.status,200);
  const spec = await specResponse.json();
  assert.equal(spec.openapi,'3.0.3');
  assert.ok(spec.paths['/api/v1/workers'].post);
  const ui = await fetch(`${base}/api-docs/`);
  assert.equal(ui.status,200);
  assert.match(await ui.text(),/swagger-ui-bundle\.js/);
  assert.match(ui.headers.get('content-security-policy'),/script-src 'self'/);
  for (const asset of ['swagger-ui.css','swagger-ui-bundle.js','swagger-ui-init.js']) {
    const response = await fetch(`${base}/api-docs/${asset}`);
    assert.equal(response.status,200,asset);
    if (asset === 'swagger-ui-init.js') {
      const init=await response.text();
      assert.match(init,/"withCredentials": true/);
      assert.match(init,/requestInterceptor/);
      assert.match(init,/X-CSRF-Token/);
    }
  }
  assert.equal((await request('/auth/logout',{method:'POST',session:supervisor,trustedOrigin:false})).status,403);
});
