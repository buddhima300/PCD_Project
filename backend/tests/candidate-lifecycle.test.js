import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { hashPassword } from '../src/shared/security.js';
import { importOperations } from '../scripts/import-operations.js';

test('candidate lifecycle preserves logins, releases failed seats, extends training and issues final staff numbers atomically',async()=>{
  const engine=new PGlite();let tail=Promise.resolve(),server;
  const db={query:(sql,p)=>engine.query(sql,p),connect:async()=>{const previous=tail;let release;tail=new Promise(resolve=>release=resolve);await previous;return {query:(sql,p)=>engine.query(sql,p),release};}};
  try {
    for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await engine.exec(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
    const password='Lifecycle-test-password-42',adminId=randomUUID();
    await db.query("INSERT INTO users(id,email,name,role,password_hash) VALUES($1,'admin@lifecycle.test','Supervisor','SUPERVISOR',$2)",[adminId,await hashPassword(password)]);
    await db.query("INSERT INTO user_permissions(user_id,permission) VALUES($1,'accounts.manage')",[adminId]);
    await importOperations(db,{backup:false,nodeEnv:'test'});
    const origin='http://localhost:5173';
    server=createApp(db,readConfig({NODE_ENV:'test',DATABASE_URL:'postgresql://unused',FRONTEND_ORIGIN:origin})).listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    async function request(path,body,session){
      const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',Origin:origin}:{}),...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken}:{})},...(body?{body:JSON.stringify(body)}:{})});
      const data=response.status===204?null:await response.json();
      return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
    }
    const login=async email=>{const r=await request('/auth/login',{email,password});assert.equal(r.status,200);return {cookie:r.cookie,...r.data};};
    const admin=await login('admin@lifecycle.test');
    const call=(method,args=[],session=admin)=>request('/operations/workflows/'+method,{args},session);
    const run=async(method,args=[],session=admin)=>{const r=await call(method,args,session);assert.equal(r.status,200,`${method}: ${JSON.stringify(r.data)}`);return r.data;};
    await run('createPlatformCategory',[{code:'PIPE',name:'Pipeline',description:''}]);
    for(const code of ['PIPE-1','PIPE-2']){
      await run('createPlatform',[{categoryCode:'PIPE',code,name:code,description:''}]);
      await run('configurePlatformCapacity',[code,{departments:{DP:1},staffingTargets:{DP:{MORNING:1,NIGHT:1}},expectedRevision:1}]);
      await run('activatePlatform',[code]);
    }
    async function register(type,name){
      const email=name.toLowerCase()+'@lifecycle.test';
      const r=await request('/staff/register',{name,email,password,dept:'DP',position:'Agent',employmentType:type,interviewResult:'SELECTED',notes:''},admin);
      assert.equal(r.status,201,JSON.stringify(r.data));assert.match(r.data.workerId,/^CND-\d{5}$/);
      assert.equal(r.data.candidate.id,r.data.workerId);assert.equal(r.data.candidate.registeredWorkerId,r.data.workerId);
      const session=await login(email);
      assert.equal((await request('/auth/me',null,session)).data.user.id,r.data.user.id);
      const table=type==='PERMANENT'?'listEmployees':'listFreelancers';
      assert.equal((await run(table,[{search:email}])).items.length,0);
      assert.ok((await run('listCandidates')).some(c=>c.candidateReference===r.data.workerId));
      return {...r.data,session,email};
    }
    const initialTotals=(await run('getWorkforceOverview')).totals;
    const a=await register('PERMANENT','Alpha'),b=await register('FREELANCER','Beta'),c=await register('PERMANENT','Gamma');
    assert.equal((await run('getWorkforceOverview')).totals.permanent,initialTotals.permanent);
    assert.equal((await run('getWorkforceOverview')).totals.freelancers,initialTotals.freelancers);
    const start=(person,shift='MORNING',platform='PIPE-1')=>call('assignPlatformWorker',[platform,{workerId:person.user.id,kind:'TRAINING',dept:'DP',shift,trainingDays:1,trainingNotes:'Supervised training'}]);
    assert.equal((await start(a)).status,200);assert.equal((await start(b,'NIGHT')).status,200);
    assert.equal((await start(c)).data.error.code,'CAPACITY_CONFLICT');
    assert.equal((await run('listCandidates')).some(candidate=>candidate.candidateReference===a.workerId),false);
    let vacancy=(await run('getWorkforceVacancies')).find(p=>p.code==='PIPE-1').departments[0];
    assert.equal(vacancy.shifts.MORNING.available,0);assert.equal(vacancy.shifts.NIGHT.available,0);
    let training=(await run('listTrainings')).find(t=>t.workerId===a.user.id);
    assert.equal(training.trainingNotes,'Supervised training');
    const review=(result,extra={})=>({platformKnowledge:5,departmentKnowledge:5,processAccuracy:5,systemUsage:5,qualityStandards:5,result,feedback:'Supervisor reviewed training',...extra});
    assert.equal((await call('assignQualifiedWorker',[training.id,{platformCode:'PIPE-1',shift:'MORNING'}])).data.error.code,'TRAINING_REQUIRED');
    await run('logTrainingProgress',[training.id,1]);
    await run('evaluateTraining',[training.id,review('FAILED')]);
    assert.ok((await run('listCandidates')).some(candidate=>candidate.candidateReference===a.workerId));
    assert.equal((await run('listTrainings')).some(t=>t.id===training.id),false);
    assert.equal((await run('getWorkforceVacancies')).find(p=>p.code==='PIPE-1').departments[0].shifts.MORNING.available,1);
    assert.ok((await run('listTrainings',[{history:true}])).some(t=>t.id===training.id&&t.trainingStatus==='TRAINING_FAILED'));
    assert.equal((await request('/auth/me',null,a.session)).status,200);
    assert.equal((await start(a)).status,200);
    training=(await run('listTrainings')).find(t=>t.workerId===a.user.id);
    await run('logTrainingProgress',[training.id,1]);
    assert.equal((await call('evaluateTraining',[training.id,review('EXTEND',{extensionDays:2,feedback:''})])).status,422);
    await run('evaluateTraining',[training.id,review('EXTEND',{extensionDays:2})]);
    // Supervisor advancement is sequential, but does not wait for calendar dates.
    assert.equal((await call('logTrainingProgress',[training.id,3])).status,422);
    await run('logTrainingProgress',[training.id,2]);
    assert.equal((await call('logTrainingProgress',[training.id,2])).status,422);
    await run('logTrainingProgress',[training.id,3]);
    await run('evaluateTraining',[training.id,review('PASSED')]);
    assert.ok((await run('listTrainings')).some(t=>t.id===training.id&&t.trainingStatus==='TRAINING_COMPLETED'));
    const beforeMax=(await db.query("SELECT MAX(substring(id FROM 5)::int) AS n FROM ops_employees WHERE id ~ '^EMP-[0-9]+$'")).rows[0].n;
    const assigned=await run('assignQualifiedWorker',[training.id,{platformCode:'PIPE-1',shift:'MORNING'}]);
    assert.equal(assigned.staffNumber,`EMP-${String(Number(beforeMax)+1).padStart(5,'0')}`);
    assert.equal(assigned.workerId,a.user.id);assert.equal(assigned.candidateReference,a.workerId);
    assert.equal((await run('listTrainings')).some(t=>t.id===training.id),false);
    assert.equal((await run('listEmployees',[{search:a.email}])).items[0].staffNumber,assigned.staffNumber);
    assert.equal((await run('getWorkforceOverview')).totals.permanent,initialTotals.permanent+1);
    assert.equal((await request('/auth/me',null,a.session)).data.user.id,a.user.id);
    assert.equal((await run('getMyWork',[],a.session)).platform.code,'PIPE-1');
    assert.equal((await db.query('SELECT worker_id FROM operational_accounts WHERE user_id=$1',[a.user.id])).rows[0].worker_id,assigned.staffNumber);
    assert.equal((await db.query('SELECT worker_number FROM workers WHERE user_id=$1',[a.user.id])).rows[0].worker_number,assigned.staffNumber);
    assert.ok((await run('listTrainings',[{history:true}])).some(t=>t.trainingStatus==='TRAINING_FAILED'&&t.workerId===a.user.id));
    assert.equal((await call('assignQualifiedWorker',[training.id,{platformCode:'PIPE-1',shift:'MORNING'}])).status,409);
    const beta=(await run('listTrainings')).find(t=>t.workerId===b.user.id);
    await run('logTrainingProgress',[beta.id,1]);await run('evaluateTraining',[beta.id,review('PASSED')]);
    const freelance=await run('assignQualifiedWorker',[beta.id,{platformCode:'PIPE-2',shift:'MORNING'}]);
    assert.match(freelance.staffNumber,/^FL-\d{5}$/);
    assert.equal((await run('listFreelancers',[{search:b.email}])).items[0].staffNumber,freelance.staffNumber);
    assert.equal((await run('getWorkforceOverview')).totals.freelancers,initialTotals.freelancers+1);
    assert.equal((await run('getMyWork',[],b.session)).platform.code,'PIPE-2');
    vacancy=(await run('getWorkforceVacancies')).find(p=>p.code==='PIPE-1').departments[0];
    assert.equal(vacancy.shifts.NIGHT.available,1);assert.equal(vacancy.shifts.MORNING.available,0);
    assert.equal((await call('getWorkforceVacancies',[],b.session)).status,403);
    const d=await register('PERMANENT','Delta');
    const race=await Promise.all([start(c,'NIGHT','PIPE-2'),start(d,'NIGHT','PIPE-2')]);
    assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  } finally {if(server)await new Promise(resolve=>server.close(resolve));await engine.close();}
});
