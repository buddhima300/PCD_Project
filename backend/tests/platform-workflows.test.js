import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { hashPassword } from '../src/shared/security.js';
import { importOperations } from '../scripts/import-operations.js';

test('supervisor platform setup persists SQL records, validates assignments and updates live statistics', async () => {
  const engine = new PGlite(); let server; let tail = Promise.resolve();
  const db = { query:(sql,params) => engine.query(sql,params), connect:async () => { const previous = tail; let release; tail = new Promise(resolve => { release = resolve; }); await previous; return { query:(sql,params) => engine.query(sql,params), release }; } };
  const origin = 'http://localhost:5173'; const password = 'Platform-test-password-42';
  try {
    for (const file of ['001_foundation.sql','002_operations.sql','003_workflow_records.sql','004_equipment_allocations.sql','005_login_access_controls.sql','007_staff_number_counters.sql']) await engine.exec(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
    const hash = await hashPassword(password);
    for (const role of ['SUPERVISOR','EMPLOYEE','FREELANCER']) {
      const id = randomUUID(); await db.query('INSERT INTO users(id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5)',[id,`${role.toLowerCase()}@platform.test`,role,role,hash]);
      if (role === 'SUPERVISOR') await db.query("INSERT INTO user_permissions(user_id,permission) VALUES($1,'accounts.manage')",[id]);
    }
    await importOperations(db,{backup:false,nodeEnv:'test'});
    server = createApp(db,readConfig({NODE_ENV:'test',DATABASE_URL:'postgresql://unused',FRONTEND_ORIGIN:origin})).listen(0,'127.0.0.1');
    await new Promise(resolve => server.once('listening',resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const request = async (path,body,session,csrf=true) => {
      const response = await fetch(base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(session ? {Cookie:session.cookie,...(csrf ? {'X-CSRF-Token':session.csrfToken} : {})} : {})},body:JSON.stringify(body)});
      return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
    };
    const sessions = {};
    for (const role of ['SUPERVISOR','EMPLOYEE','FREELANCER']) { const response = await request('/auth/login',{email:`${role.toLowerCase()}@platform.test`,password}); assert.equal(response.status,200); sessions[role] = {cookie:response.cookie,...response.data}; }
    const admin = sessions.SUPERVISOR;
    const call = async (method,args=[],actor=admin) => request(`/operations/workflows/${method}`,{args},actor);
    const run = async (method,args=[]) => { const result = await call(method,args); assert.equal(result.status,200,`${method}: ${JSON.stringify(result.data)}`); return result.data; };
    const capacity = {departments:{DP:2},staffingTargets:{DP:{MORNING:2,NIGHT:0}},expectedRevision:1};
    const category = {code:'LANKA',name:'Lanka service operations',description:'Category created through existing frontend'};
    const platform = {categoryCode:'LANKA',code:'LANKA-1',name:'Colombo operations',description:'Database-backed setup'};
    for (const role of ['EMPLOYEE','FREELANCER']) for (const [method,args] of [['createPlatformCategory',[category]],['createPlatform',[platform]],['configurePlatformCapacity',['LANKA-1',capacity]],['assignPlatformWorker',['LANKA-1',{workerId:'EMP-00421',kind:'PRODUCTION',dept:'DP',shift:'MORNING'}]],['activatePlatform',['LANKA-1']],['updatePlatformConfig',['LANKA-1',{departments:{DP:3},status:'ACTIVE',reason:'Unauthorized edit'}]]]) assert.equal((await call(method,args,sessions[role])).status,403,`${role}/${method}`);
    assert.equal((await call('createPlatformCategory',[category],null)).status,401);
    assert.equal((await request('/operations/workflows/createPlatformCategory',{args:[category]},admin,false)).status,403);
    const initial = await run('getDashboard',[{}]);
    await run('createPlatformCategory',[category]);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM platform_categories WHERE code='LANKA'")).rows[0].n,1);
    assert.equal((await call('createPlatformCategory',[category])).status,409);
    assert.equal((await call('createPlatform',[{...platform,category:{code:'FAILCAT',name:'Must rollback',description:''},code:'WRONG-1'}])).status,422);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM ops_categories WHERE data->>'code'='FAILCAT'")).rows[0].n,0);
    await run('createPlatform',[platform]);
    assert.equal((await call('activatePlatform',['LANKA-1'])).status,422);
    assert.ok(!(await run('listPlatforms',[{status:'ACTIVE'}])).some(row => row.code === 'LANKA-1'));
    assert.equal((await call('configurePlatformCapacity',['LANKA-1',{departments:{DP:1},staffingTargets:{DP:{MORNING:2,NIGHT:0}}}])).status,422);
    await run('configurePlatformCapacity',['LANKA-1',capacity]);
    assert.equal((await call('configurePlatformCapacity',['LANKA-1',{...capacity,departments:{DP:3}}])).status,409);
    assert.equal((await call('configurePlatformCapacity',['LANKA-1',{departments:{OTHER:2},staffingTargets:{}}])).status,422);
    assert.equal((await call('assignPlatformWorker',['LANKA-1',{workerId:'missing',kind:'INVALID',dept:'DP',shift:'MORNING'}])).status,422);
    await run('activatePlatform',['LANKA-1']);
    const staff = [];
    for (const employmentType of ['PERMANENT','FREELANCER']) {
      const created = await request('/staff/register',{name:`New ${employmentType}`,email:`new-${employmentType.toLowerCase()}@platform.test`,password,phone:'',dept:'DP',position:'Agent',employmentType,interviewResult:'SELECTED',notes:''},admin);
      assert.equal(created.status,201,JSON.stringify(created.data)); staff.push(created.data);
      const options = await run('listPlatformAssignmentOptions',['LANKA-1','DP']);
      assert.equal(options.training.filter(option => option.id === created.data.user.id).length,1);
      assert.equal((await call('assignPlatformWorker',['LANKA-1',{workerId:created.data.user.id,kind:'PRODUCTION',dept:'DP',shift:'MORNING'}])).status,422);
      await run('assignPlatformWorker',['LANKA-1',{workerId:created.data.user.id,kind:'TRAINING',dept:'DP',shift:'MORNING',trainingDays:1}]);
      assert.equal((await call('assignPlatformWorker',['LANKA-1',{workerId:created.data.user.id,kind:'TRAINING',dept:'DP',shift:'NIGHT',trainingDays:1}])).status,409);
    }
    assert.equal((await call('configurePlatformCapacity',['LANKA-1',{departments:{DP:1},staffingTargets:{DP:{MORNING:1,NIGHT:0}}}])).status,409);
    await run('activatePlatform',['LANKA-1']);
    assert.ok((await run('listPlatforms',[{status:'ACTIVE'}])).some(row => row.code === 'LANKA-1'));
    const after = await run('getDashboard',[{}]); assert.equal(after.kpis.activePlatforms,initial.kpis.activePlatforms+1); assert.equal(after.kpis.totalWorkstations,initial.kpis.totalWorkstations+2);
    let detail = await run('getPlatform',['LANKA-1']);
    await run('updatePlatformConfig',['LANKA-1',{departments:{DP:3},status:'ACTIVE',reason:'Increase shared capacity',expectedRevision:detail.platform.revision}]);
    assert.equal((await db.query("SELECT c.seats,c.morning_target FROM platform_capacities c JOIN platforms p ON p.id=c.platform_id WHERE p.code='LANKA-1' AND c.department_code='DP'")).rows[0].seats,3);
    const trainings = await run('listTrainings',[{platform:'LANKA-1'}]); assert.equal(trainings.length,2);
    for (const training of trainings) {
      await run('logTrainingProgress',[training.id,1]);
      await run('evaluateTraining',[training.id,{platformKnowledge:5,departmentKnowledge:5,processAccuracy:5,systemUsage:5,qualityStandards:5,result:'PASSED',feedback:'Qualified'}]);
      const assigned=await run('assignQualifiedWorker',[training.id,{platformCode:'LANKA-1',shift:'MORNING'}]);
      const person=staff.find(person=>person.user.id===assigned.workerId);
      person.workerId=assigned.staffNumber;
    }
    detail = await run('getPlatform',['LANKA-1']); assert.equal(detail.platform.morningWorkforce,2); assert.equal(detail.platform.totalWorkstations,3);
    const scoped = await run('getDashboard',[{category:'LANKA'}]); assert.equal(scoped.kpis.activePlatforms,1); assert.equal(scoped.kpis.totalWorkstations,3); assert.equal(scoped.kpis.morningWorkforce,2); assert.equal(scoped.kpis.freelancers,1);
    for (const person of staff) { assert.equal((await db.query('SELECT worker_id FROM operational_accounts WHERE user_id=$1',[person.user.id])).rows[0].worker_id,person.workerId); assert.equal((await db.query('SELECT lifecycle FROM workers WHERE worker_number=$1',[person.workerId])).rows[0].lifecycle,'PRODUCTION_ACTIVE'); }
    for (const person of staff) {
      const login=await request('/auth/login',{email:person.user.email,password});
      const work=await call('getMyWork',[],{cookie:login.cookie,...login.data});
      assert.equal(work.status,200);
      assert.equal(work.data.platform.code,'LANKA-1');
      assert.equal(work.data.shift,'MORNING');
      assert.deepEqual(work.data.handovers,[]);
    }
    assert.equal((await db.query("SELECT status FROM platforms WHERE code='LANKA-1'")).rows[0].status,'ACTIVE');
    await run('createPlatform',[{...platform,code:'LANKA-2',name:'Second operations platform'}]);
    await run('configurePlatformCapacity',['LANKA-2',{departments:{DP:1},staffingTargets:{DP:{MORNING:1,NIGHT:0}},expectedRevision:1}]);
    await run('activatePlatform',['LANKA-2']);
    const employee = staff.find(person => person.user.role === 'EMPLOYEE');
    assert.ok((await run('listPlatformAssignmentOptions',['LANKA-2','DP'])).production.some(option => option.id === employee.user.id));
    await run('assignPlatformWorker',['LANKA-2',{workerId:employee.user.id,kind:'PRODUCTION',dept:'DP',shift:'MORNING'}]);
    assert.equal((await run('getPlatform',['LANKA-2'])).platform.morningWorkforce,1);
    assert.equal((await run('getPlatform',['LANKA-1'])).platform.morningWorkforce,1);
    await run('updatePlatformConfig',['LANKA-1',{departments:{DP:3},status:'INACTIVE',reason:'Pause the operating platform',expectedRevision:detail.platform.revision}]);
    assert.ok(!(await run('listPlatforms',[{status:'ACTIVE'}])).some(row => row.code === 'LANKA-1'));
    assert.equal((await run('getDashboard',[{platform:'LANKA-1'}])).kpis.activePlatforms,0);
    // Inventory is a projection of SQL-backed capacity, including seats without hardware.
    await run('createPlatform',[{...platform,code:'LANKA-13',name:'Inventory capacity test'}]);
    await run('configurePlatformCapacity',['LANKA-13',{departments:{GS:1,DP:5,WD:5},staffingTargets:{}}]);
    let inventory=await run('listWorkstations',[{platform:'LANKA-13',pageSize:25}]);
    assert.equal(inventory.total,11);
    assert.deepEqual(inventory.items.map(row=>row.workstationId),['WS-LANKA13-GS01',...Array.from({length:5},(_,i)=>`WS-LANKA13-DP0${i+1}`),...Array.from({length:5},(_,i)=>`WS-LANKA13-WD0${i+1}`)]);
    assert.equal(inventory.items[0].laptop,null);
    const device=await run('registerPlatformDevice',[{poolId:'POOL-LANKA13-DP',assetId:'INV-TEST',serial:'INV-SERIAL',model:'Latitude test'}]);
    assert.equal((await run('getWorkstation',['WS-LANKA13-DP01'])).workstation.laptop.assetId,device.assetId);
    assert.equal((await run('listWorkstations',[{platform:'LANKA-13',search:'Latitude test'}])).total,1);
    assert.equal((await run('listWorkstations',[{platform:'LANKA-13',dept:'WD',page:2,pageSize:2}])).items.length,2);
    await run('registerPlatformDevice',[{poolId:'POOL-LANKA13-DP',workstationId:'WS-LANKA13-DP05',assetId:'INV-EXACT',serial:'INV-EXACT-SERIAL',model:'Selected seat device'}]);
    assert.equal((await run('getWorkstation',['WS-LANKA13-DP05'])).workstation.laptop.assetId,'INV-EXACT');
    assert.equal((await call('registerPlatformDevice',[{poolId:'POOL-LANKA13-DP',workstationId:'WS-LANKA13-DP05',assetId:'INV-CONFLICT',serial:'INV-CONFLICT-SERIAL',model:'Duplicate seat'}])).status,409);
    assert.equal((await call('listWorkstations',[{}],sessions.EMPLOYEE)).status,403);
    assert.equal((await call('getWorkstation',['WS-LANKA13-DP01'],sessions.FREELANCER)).status,403);
    await run('configurePlatformCapacity',['LANKA-13',{departments:{GS:1,DP:2},staffingTargets:{}}]);
    inventory=await run('listWorkstations',[{platform:'LANKA-13'}]);
    assert.equal(inventory.total,3);
    assert.equal((await call('getWorkstation',['WS-LANKA13-DP05'])).status,404);
    assert.equal((await run('getWorkstation',['WS-LANKA13-DP01'])).workstation.laptop.model,'Latitude test');
    await run('configurePlatformCapacity',['LANKA-13',{departments:{GS:1,DP:6},staffingTargets:{}}]);
    assert.equal((await run('listWorkstations',[{platform:'LANKA-13'}])).total,7);
    assert.ok((await run('listLaptopModels')).includes('Latitude test'));
    assert.equal(await run('addLaptopModel',['  ThinkPad T14 Gen 6  ']),'ThinkPad T14 Gen 6');
    assert.equal(await run('addLaptopModel',['thinkpad t14 gen 6']),'ThinkPad T14 Gen 6');
    assert.equal((await run('listLaptopModels')).filter(m=>m.toLowerCase()==='thinkpad t14 gen 6').length,1);
    assert.equal((await call('addLaptopModel',['   '])).status,422);
    assert.equal((await call('addLaptopModel',['Unauthorized model'],sessions.EMPLOYEE)).status,403);
    assert.equal((await call('updateLaptopModel',['INV-TEST',{model:'ThinkPad T14 Gen 6',expectedModel:'Latitude test'}],sessions.EMPLOYEE)).status,403);
    await run('updateLaptopModel',['INV-TEST',{model:'ThinkPad T14 Gen 6',expectedModel:'Latitude test'}]);
    assert.equal((await db.query("SELECT data->>'model' AS model FROM ops_laptops WHERE id='INV-TEST'")).rows[0].model,'ThinkPad T14 Gen 6');
    assert.equal((await run('getWorkstation',['WS-LANKA13-DP01'])).workstation.laptop.model,'ThinkPad T14 Gen 6');
    assert.equal((await call('updateLaptopModel',['INV-TEST',{model:'Latitude test',expectedModel:'Latitude test'}])).status,409);
    assert.equal((await call('updateLaptopModel',['INV-TEST',{model:'Unknown model',expectedModel:'ThinkPad T14 Gen 6'}])).status,422);
  } finally { if (server) await new Promise(resolve => server.close(resolve)); await engine.close(); }
});
