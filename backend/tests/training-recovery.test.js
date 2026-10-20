import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { registerStaff } from '../src/modules/workforce/registration.service.js';
import { importOperations } from '../scripts/import-operations.js';
import { executeOperation } from '../src/modules/operations/service.js';
import { loadState,saveState } from '../src/modules/operations/store.js';

test('registering an unlinked legacy candidate restores their completed training without duplicate identities or lost evaluation',async()=>{
  const engine=new PGlite();let tail=Promise.resolve();
  const db={query:(s,p)=>engine.query(s,p),connect:async()=>{const before=tail;let release;tail=new Promise(r=>{release=r;});await before;return {query:(s,p)=>engine.query(s,p),release};}};
  try{
    for(const f of (await readdir(new URL('../migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await engine.exec(await readFile(new URL(`../migrations/${f}`,import.meta.url),'utf8'));
    const actor={id:randomUUID(),name:'Supervisor',role:'SUPERVISOR',email:'recovery-admin@test.local'};
    await db.query('INSERT INTO users(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5)',[actor.id,actor.name,actor.email,actor.role,'unused']);
    await importOperations(db,{backup:false,nodeEnv:'test'});
    const state=await loadState(db),before=structuredClone(state);
    state.platforms.push({...state.platforms[0],id:'REPAIR-PLATFORM',code:'REPAIR-1',departments:{DP:2},status:'ACTIVE',lifecycle:'OPERATIONAL'});
    for(const [index,type] of ['PERMANENT','FREELANCER'].entries()){
      const id=`CND-${90001+index}`,name=`Recovered ${type}`,email=`recovered-${type.toLowerCase()}@test.local`;
      state.candidates.push({id,name,email,phone:'',dept:'DP',employmentType:type,position:'Agent',status:'PLACED',createdAt:'2025-01-01'});
      state.trainingAssignments.push({id:`REPAIR-${type}`,workerId:id,workerName:name,workerType:type,platformCode:'OLD-PLATFORM',dept:'DP',shift:'MORNING',trainingOnly:true,trainingStatus:'TRAINING_COMPLETED',requiredTrainingDays:3,completedTrainingDays:3,evaluation:{result:'PASSED',feedback:'Original qualification'},dailyLogs:[1,2,3].map(day=>({day,date:'2025-01-01',status:'COMPLETED'}))});
    }
    const oldAudit={id:'AUD-KEPT',action:'CANDIDATE_CREATED',entityId:'UNRELATED-CANDIDATE'};state.audit.unshift(oldAudit);
    await saveState(db,state,before);
    for(const [index,type] of ['PERMANENT','FREELANCER'].entries()){
      const id=`CND-${90001+index}`,email=`recovered-${type.toLowerCase()}@test.local`,details={name:`Recovered ${type}`,email,password:'Recovery-password-42',phone:'',dept:'DP',employmentType:type,position:'Agent',interviewResult:'SELECTED',notes:'Restore verified registration'};
      const registered=await registerStaff(db,actor,details);assert.equal(registered.workerId,id);assert.equal(registered.candidate.createdAt,'2025-01-01');
      const result=await executeOperation(db,{user:actor,permissions:[]},'workflows','assignQualifiedWorker',[`REPAIR-${type}`,{platformCode:'REPAIR-1',shift:'MORNING'}]);assert.ok(result.promotedAt);assert.match(result.staffNumber,type==='PERMANENT'?/^EMP-/:/^FL-/);
      const fresh=await loadState(db),training=fresh.trainingAssignments.find(t=>t.id===`REPAIR-${type}`);assert.equal(training.evaluation.feedback,'Original qualification');assert.equal(training.dailyLogs.length,3);assert.equal(fresh.candidates.filter(c=>c.email===email).length,1);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM users WHERE email=$1',[email])).rows[0].n,1);
      await assert.rejects(registerStaff(db,actor,details),e=>e.code==='CONFLICT');
      assert.equal(fresh.audit.find(a=>a.id==='AUD-KEPT').entityId,'UNRELATED-CANDIDATE');
    }
  }finally{await engine.close();}
});
