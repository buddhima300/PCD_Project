import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { importOperations } from '../scripts/import-operations.js';
import { loadState, saveState } from '../src/modules/operations/store.js';
import { executeOperation } from '../src/modules/operations/service.js';
import { shiftContext } from '../src/modules/operations/equipment.js';

test('Colombo shift date follows the preceding night through midnight', () => {
  assert.deepEqual(shiftContext(new Date('2026-10-15T20:00:00Z')),{date:'2026-10-15',shift:'NIGHT'});
  assert.deepEqual(shiftContext(new Date('2026-10-16T02:00:00Z')),{date:'2026-10-16',shift:'MORNING'});
  assert.deepEqual(shiftContext(new Date('2026-10-16T14:00:00Z')),{date:'2026-10-16',shift:'NIGHT'});
});

test('retired device reservations and handover actions cannot create or change records', async () => {
  const engine = new PGlite(); let tail = Promise.resolve();
  const db = {query:(s,p) => engine.query(s,p),connect:async () => {const prior=tail;let release;tail=new Promise(r => {release=r;});await prior;return {query:(s,p) => engine.query(s,p),release};}};
  try {
    for (const file of ['001_foundation.sql','002_operations.sql','003_workflow_records.sql','004_equipment_allocations.sql','005_login_access_controls.sql','007_staff_number_counters.sql']) await engine.exec(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
    const supervisor = {id:randomUUID(),name:'Supervisor',role:'SUPERVISOR',email:'sup@equipment.test'};
    const workerUser = {id:randomUUID(),name:'Employee',role:'EMPLOYEE',email:'emp@equipment.test'};
    for (const u of [supervisor,workerUser]) await db.query('INSERT INTO users(id,name,role,email,password_hash) VALUES($1,$2,$3,$4,$5)',[u.id,u.name,u.role,u.email,'unused']);
    await importOperations(db,{backup:false,nodeEnv:'test'});
    const historicalTransfers=(await db.query('SELECT count(*)::int AS n FROM ops_handovers')).rows[0].n;
    await engine.exec(await readFile(new URL('../migrations/006_retire_pending_handovers.sql',import.meta.url),'utf8'));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM ops_handovers')).rows[0].n,historicalTransfers);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM ops_laptops WHERE data->>'status'='HANDOVER_PENDING' OR data->>'nextUserId' IS NOT NULL")).rows[0].n,0);
    const state = await loadState(db), original=structuredClone(state), current=shiftContext();
    const p = {...state.platforms[0],id:'TEST-EQUIPMENT',code:'EQUIP-1',name:'Equipment test',lifecycle:'OPERATIONAL',status:'ACTIVE',departments:{DP:2},staffingTargets:{DP:{MORNING:1,NIGHT:1}}};
    state.platforms.push(p);
    const [morning,night,extra] = state.employees;
    state.offDays=state.offDays.filter(o => ![morning.id,night.id,extra.id].includes(o.employeeId));
    state.handovers=state.handovers.filter(h => ![morning.id,night.id,extra.id].includes(h.incomingId) && ![morning.id,night.id,extra.id].includes(h.outgoingId));
    for (const [w,shift] of [[morning,'MORNING'],[night,'NIGHT'],[extra,current.shift]]) Object.assign(w,{platformCode:p.code,dept:'DP',poolId:'POOL-EQUIP1-DP',shift,status:'ACTIVE',accountStatus:'ACTIVE',qualifiedForProduction:true,currentWorkstationId:null});
    for (const l of state.laptops.filter(l => [morning.id,night.id,extra.id].includes(l.currentUserId))) Object.assign(l,{currentUserId:null,currentUserName:null,currentShift:null,status:'AVAILABLE'});
    await db.query('UPDATE operational_accounts SET worker_id=$2 WHERE user_id=$1',[workerUser.id,extra.id]);
    const base = state.laptops[0];
    for (let slot=1;slot<=2;slot++) state.laptops.push({...base,assetId:`TEST-ASSET-${slot}`,workstationId:`WS-EQUIP1-DP-0${slot}`,poolId:'POOL-EQUIP1-DP',platformCode:p.code,dept:'DP',status:'AVAILABLE',condition:'GOOD',currentUserId:null,currentUserName:null,currentShift:null,nextUserId:null,openIncidentId:null});
    await saveState(db,state,original);
    const admin={user:supervisor,permissions:[]}, employee={user:workerUser,permissions:[]};
    const call=(method,args=[],auth=admin) => executeOperation(db,auth,'workflows',method,args);
    const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
    const ctx={poolId:'POOL-EQUIP1-DP',date,shift:'MORNING'};
    const reserve=(workerId,assetId='TEST-ASSET-1',shift='MORNING',d=date) => call('reserveEquipment',[{...ctx,date:d,shift,workerId,assetId}]);
    const rejects=(promise,code) => assert.rejects(promise,e => e.code === code);
    const before=await loadState(db);
    for(const method of ['reserveEquipment','receiveSharedDevice','returnSharedDevice','submitHandoverConfirmation','confirmOutgoing','confirmReceipt','submitHandover','correctHandover','cancelEquipmentAllocation']) {
      await rejects(call(method,[]),'WORKFLOW_RETIRED');
      await rejects(call(method,[],employee),'WORKFLOW_RETIRED');
    }
    const saved=await loadState(db);
    assert.deepEqual(saved.handovers,before.handovers);
    assert.deepEqual(saved.laptops,before.laptops);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM equipment_allocations')).rows[0].n,0);
    const dashboard=await call('getDashboard',[{}]);
    assert.equal(dashboard.kpis.pendingHandovers,0);
  } finally {await engine.close();}
});
