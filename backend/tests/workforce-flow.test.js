import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignQualifiedWorker, trainingRecoveryOperation } from '../src/modules/operations/workforce-flow.js';
const supervisor={user:{id:'SUP',name:'Supervisor',role:'SUPERVISOR'}};
function fixture(freelancer=false){
  const worker={id:'W1',name:'Registered worker',dept:'DP',status:'ACTIVE',accountStatus:'ACTIVE',qualifiedForProduction:false,lifecycle:'TRAINING_COMPLETED',platformCode:'TRAIN-1'};
  return {employees:freelancer?[]:[worker],freelancers:freelancer?[worker]:[],platforms:[{code:'TRAIN-1',status:'ACTIVE',departments:{DP:1}},{code:'PROD-1',status:'ACTIVE',departments:{DP:1}}],trainingAssignments:[{id:'T1',workerId:'W1',dept:'DP',platformCode:'TRAIN-1',shift:'MORNING',trainingOnly:true,trainingStatus:'TRAINING_COMPLETED',evaluation:{result:'PASSED'}}],platformPositions:[],laptops:[],handovers:[{incomingId:'W1',status:'PENDING'}],audit:[]};
}
for(const freelancer of [false,true]) test(`${freelancer?'freelancer':'employee'} qualification requires explicit assignment and preserves training location`,()=>{
  const state=fixture(freelancer);
  const result=assignQualifiedWorker(supervisor,state,['T1',{platformCode:'PROD-1',shift:'NIGHT'}]);
  assert.equal(result.platformCode,'TRAIN-1');assert.equal(result.productionPlatformCode,'PROD-1');assert.equal(result.productionShift,'NIGHT');assert.ok(result.promotedAt);
  const worker=(freelancer?state.freelancers:state.employees)[0];
  assert.equal(worker.id,'W1');assert.equal(worker.qualifiedForProduction,true);assert.equal(worker.lifecycle,'PRODUCTION_ACTIVE');
  assert.equal(freelancer?worker.currentPlatform:worker.platformCode,'PROD-1');
  assert.equal(state.handovers[0].status,'PENDING');assert.equal(state.laptops.length,0);
  assert.throws(()=>assignQualifiedWorker(supervisor,state,['T1',{platformCode:'PROD-1',shift:'NIGHT'}]),e=>e.code==='TRAINING_REQUIRED');
});
test('assignment fails closed for unauthorized, unqualified, blocked, inactive and full destinations',()=>{
  const args=['T1',{platformCode:'PROD-1',shift:'MORNING'}];
  assert.throws(()=>assignQualifiedWorker({user:{role:'EMPLOYEE'}},fixture(),args),e=>e.status===403);
  for(const [change,code] of [
    [s=>s.trainingAssignments[0].evaluation.result='FAILED','TRAINING_REQUIRED'],
    [s=>s.employees[0].accountStatus='LOCKED','WORKER_INELIGIBLE'],
    [s=>s.platforms[1].status='INACTIVE','PLATFORM_INELIGIBLE'],
    [s=>s.employees.push({id:'W2',dept:'DP',platformCode:'PROD-1',shift:'MORNING',status:'ACTIVE'}),'CAPACITY_CONFLICT']
  ]){const state=fixture();change(state);const before=structuredClone(state);assert.throws(()=>assignQualifiedWorker(supervisor,state,args),e=>e.code===code);assert.deepEqual(state,before);}
});
test('assignment resolves an explicit candidate registration link without guessing from staff names',()=>{
  const state=fixture();state.trainingAssignments[0].workerId='CND-OLD';state.candidates=[{id:'CND-OLD',registeredWorkerId:'W1'}];
  assignQualifiedWorker(supervisor,state,['T1',{platformCode:'PROD-1',shift:'MORNING'}]);assert.equal(state.trainingAssignments[0].workerId,'W1');assert.ok(state.audit.some(a=>a.action==='TRAINING_STAFF_LINK_REPAIRED'));
});
for(const freelancer of [false,true])test(`${freelancer?'freelancer':'employee'} orphan training can be explicitly linked to the same registered person and assigned`,()=>{
  const state=fixture(freelancer),t=state.trainingAssignments[0];t.workerType=freelancer?'FREELANCER':'PERMANENT';t.workerId='MISSING';state.candidates=[];
  assert.throws(()=>assignQualifiedWorker(supervisor,state,['T1',{platformCode:'PROD-1',shift:'MORNING'}]),e=>e.code==='STAFF_RECORD_MISSING');
  const context=trainingRecoveryOperation(supervisor,state,'getTrainingStaffContext',['T1'],new Set(['W1']));assert.equal(context.missing,true);assert.equal(context.options.length,1);
  const args=['T1',{workerId:'W1',samePerson:true,reason:'Verified this is the same registered trainee',expectedWorkerId:'MISSING'}];
  assert.throws(()=>trainingRecoveryOperation({user:{role:'EMPLOYEE'}},state,'linkTrainingStaff',args,new Set(['W1'])),e=>e.status===403);
  assert.throws(()=>trainingRecoveryOperation(supervisor,state,'linkTrainingStaff',args,new Set()),e=>e.code==='WORKER_INELIGIBLE');
  trainingRecoveryOperation(supervisor,state,'linkTrainingStaff',args,new Set(['W1']));assert.equal(t.workerId,'W1');assert.equal(t.originalWorkerId,'MISSING');
  assignQualifiedWorker(supervisor,state,['T1',{platformCode:'PROD-1',shift:'MORNING'}]);assert.ok(t.promotedAt);
});
