import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { importOperations } from '../scripts/import-operations.js';
import { loadState, saveState } from '../src/modules/operations/store.js';
import { executeOperation } from '../src/modules/operations/service.js';
import { shiftContext } from '../src/modules/operations/equipment.js';
import { offDayBalance } from '../src/modules/operations/employee-platform.js';

test('monthly off-day balance uses Colombo month, approved unique days and employee allowance', () => {
  const employee={id:'E1',offDaysAllowance:4};
  const state={offDays:[['2026-11-01','APPROVED'],['2026-11-01','OVERRIDE_APPROVED'],['2026-11-02','APPROVED'],['2026-11-03','REJECTED'],['2026-10-30','APPROVED']].map(([date,status]) => ({employeeId:'E1',date,status}))};
  assert.deepEqual(offDayBalance(state,employee,new Date('2026-10-31T19:00:00Z')),{month:'2026-11',allowance:4,used:2,remaining:2});
  assert.equal(offDayBalance(state,{...employee,offDaysAllowance:0},new Date('2026-10-31T19:00:00Z')).remaining,0);
});

test('platform assignments persist atomically without named device or pending handover requirements', async () => {
  const engine=new PGlite(); let tail=Promise.resolve();
  const db={query:(s,p) => engine.query(s,p),connect:async () => {const prior=tail;let release;tail=new Promise(r => {release=r;});await prior;return {query:(s,p) => engine.query(s,p),release};}};
  try {
    for (const file of ['001_foundation.sql','002_operations.sql','003_workflow_records.sql','004_equipment_allocations.sql','005_login_access_controls.sql','007_staff_number_counters.sql']) await engine.exec(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
    const admin={user:{id:randomUUID(),name:'Supervisor',role:'SUPERVISOR',email:'shared-admin@test.local'},permissions:[]};
    const employee={user:{id:randomUUID(),name:'Employee',role:'EMPLOYEE',email:'shared-staff@test.local'},permissions:[]};
    for (const {user:u} of [admin,employee]) await db.query('INSERT INTO users(id,name,role,email,password_hash) VALUES($1,$2,$3,$4,$5)',[u.id,u.name,u.role,u.email,'unused']);
    await importOperations(db,{backup:false,nodeEnv:'test'});
    const state=await loadState(db), original=structuredClone(state), current=shiftContext();
    const [worker,second,third]=state.employees;
    const ids=new Set([worker.id,second.id,third.id]);
    state.offDays=state.offDays.filter(o => !ids.has(o.employeeId));
    state.handovers=state.handovers.filter(h => !ids.has(h.incomingId) && !ids.has(h.outgoingId));
    state.trainingAssignments=state.trainingAssignments.filter(t => !ids.has(t.workerId));
    for (const position of state.platformPositions.filter(p => ids.has(p.assignedWorkerId))) Object.assign(position,{status:'VACANT',assignedWorkerId:null});
    for (const l of state.laptops.filter(l => ids.has(l.currentUserId) || ids.has(l.nextUserId))) Object.assign(l,{status:'AVAILABLE',currentUserId:null,nextUserId:null});
    for (const w of [worker,second,third]) Object.assign(w,{dept:'DP',platformCode:'',poolId:'',categoryCode:'',shift:current.shift,status:'ACTIVE',accountStatus:'ACTIVE',qualifiedForProduction:true,currentWorkstationId:null,workstationState:null});
    const base=state.platforms[0];
    for (const code of ['SHARED-1','SHARED-2']) state.platforms.push({...base,id:`TEST-${code}`,code,name:code,lifecycle:'OPERATIONAL',status:'ACTIVE',departments:{DP:2},staffingTargets:{DP:{MORNING:1,NIGHT:1}}});
    await db.query('UPDATE operational_accounts SET worker_id=$2 WHERE user_id=$1',[employee.user.id,worker.id]);
    await saveState(db,state,original);
    const call=(method,args=[],auth=admin) => executeOperation(db,auth,'workflows',method,args);
    const input=(platformCode,expectedPlatform='') => ({platformCode,expectedPlatform,shift:current.shift,reason:'Verified staffing change'});
    const rejects=(promise,code) => assert.rejects(promise,e => e.code === code);
    await rejects(call('setEmployeePlatform',[worker.id,input('SHARED-1')],employee),'FORBIDDEN');
    const options=await call('getEmployeePlatformOptions',[worker.id,current.shift]);
    assert.equal(options.find(p => p.code === 'SHARED-1').available,2);
    await call('setEmployeePlatform',[worker.id,input('SHARED-1')]);
    let saved=await loadState(db);
    assert.equal(saved.employees.find(e => e.id === worker.id).currentWorkstationId,null);
    assert.equal(saved.laptops.some(l => l.currentUserId === worker.id),false);
    assert.ok(saved.platformPositions.some(p => p.assignedWorkerId === worker.id && !p.workstationId));
    await rejects(call('setEmployeePlatform',[worker.id,input('SHARED-2')]),'CONCURRENCY_CONFLICT');
    await call('setEmployeePlatform',[second.id,input('SHARED-1')]);
    const beforeAudit=saved.audit.length;
    await rejects(call('setEmployeePlatform',[third.id,input('SHARED-1')]),'CAPACITY_CONFLICT');
    assert.equal((await loadState(db)).employees.find(e => e.id === third.id).platformCode,'');
    // The same physical count supports the other shift independently.
    await call('setEmployeePlatform',[third.id,{...input('SHARED-1'),shift:current.shift === 'MORNING' ? 'NIGHT' : 'MORNING'}]);
    for (const n of [1,2]) await call('registerPlatformDevice',[{poolId:'POOL-SHARED1-DP',assetId:`SHARED-LAP-${n}`,serial:`SHARED-SERIAL-${n}`,model:'Shared test device'}]);
    await rejects(call('registerPlatformDevice',[{poolId:'POOL-SHARED1-DP',assetId:'THIRD',serial:'THIRD',model:'Test'}]),'CAPACITY_CONFLICT');
    await rejects(call('registerPlatformDevice',[{poolId:'POOL-SHARED1-DP',assetId:'SHARED-LAP-1',serial:'DUPLICATE',model:'Test'}]),'DUPLICATE_DEVICE');
    await rejects(call('receiveSharedDevice',['SHARED-LAP-1'],employee),'WORKFLOW_RETIRED');
    const pending=await loadState(db),pendingPrevious=structuredClone(pending);
    pending.handovers.push({id:'IGNORED-PENDING',incomingId:worker.id,outgoingId:worker.id,scheduledAt:new Date().toISOString(),receivedAt:null,outgoingConfirmedAt:null,status:'PENDING'});
    await saveState(db,pending,pendingPrevious);
    await call('setEmployeePlatform',[worker.id,input('SHARED-2','SHARED-1')]);
    const detail=await call('getEmployee',[worker.id]);
    assert.equal(detail.employee.platformCode,'SHARED-2');
    assert.equal(detail.platformHistory.length,2);
    assert.equal(detail.platformHistory[1].platformCode,'SHARED-1');
    assert.ok(detail.platformHistory[1].to);
    assert.ok((await loadState(db)).audit.length > beforeAudit);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM equipment_allocations')).rows[0].n,0);
  } finally {await engine.close();}
});
