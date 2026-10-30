import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createDomain} from '../src/modules/operations/runtime.js';
import {seatRequestOperation} from '../src/modules/operations/seat-requests.js';
import {saveState,loadState} from '../src/modules/operations/store.js';
import {executeOperation} from '../src/modules/operations/service.js';
import {businessDate} from '../src/modules/operations/roster.js';
import {randomUUID} from 'node:crypto';
const now=new Date('2026-10-23T04:30:00Z');
const actor=(id='F1',role='FREELANCER')=>({workerId:id,user:{id,name:id,role},permissions:[]});
const sup=actor('S1','SUPERVISOR');
async function fixture(){
 const state=(await createDomain()).snapshot();
 Object.assign(state,{employees:[{id:'E1',name:'Employee',platformCode:'P1',categoryCode:'CAT',dept:'DP',slot:1,shift:'MORNING',status:'ACTIVE',accountStatus:'ACTIVE',joinedAt:'2025-01-01'}],freelancers:['F1','F2'].map((id,i)=>({id,name:id,dept:'DP',priority:i+1,status:'ACTIVE',accountStatus:'ACTIVE',compatibleCategories:['CAT'],qualifiedForProduction:true,joinedAt:'2025-01-01',currentPlatform:null})),platforms:[{id:'P1',code:'P1',categoryCode:'CAT',status:'ACTIVE',lifecycle:'OPERATIONAL',departments:{DP:2}}],trainingAssignments:[],candidates:[],laptops:[],offDays:[],rotationCycles:[],replacements:[{id:'R1',platformCode:'P1',categoryCode:'CAT',dept:'DP',date:'2026-10-25',shift:'MORNING',shiftStart:'2026-10-25T07:30:00+05:30',shiftEnd:'2026-10-25T19:30:00+05:30',absentEmployeeId:'E1',absentEmployeeName:'Employee',status:'PENDING',type:'PLANNED',freelancerId:null,candidates:[],timeline:[],failureReasons:[],reason:'Private medical reason'}],availability:{F1:{'2026-10-25':{MORNING:'AVAILABLE',NIGHT:'UNAVAILABLE'}},F2:{'2026-10-25':{MORNING:'AVAILABLE',NIGHT:'UNAVAILABLE'}}},seatRequests:[],notifications:[],audit:[],profile:{events:[],photos:{}},roster:{requests:[],plans:[],entitlements:[]}});
 return state;
}
const call=(s,a,m,args=[])=>seatRequestOperation(s,a,m,args,now);
test('freelancers see dated department vacancies without private absence details; duplicate requests notify only once',async()=>{
 const s=await fixture();s.replacements.push({...s.replacements[0],id:'R2',dept:'GS'});
 let view=await call(s,actor(),'getMySeatVacancies',['2026-10']);assert.equal(view.vacancies.length,1);assert.equal(view.vacancies[0].eligible,true);assert.equal(view.vacancies[0].shiftStart,'2026-10-25T02:00:00.000Z');assert.ok(!JSON.stringify(view).includes('Private medical reason'));
 const r=await call(s,actor(),'requestVacancySeat',['R1',{note:'Happy to cover'}]);
 await call(s,actor(),'requestVacancySeat',['R1',{note:'Retry'}]);assert.equal(s.seatRequests.length,1);assert.equal(s.notifications.length,1);assert.equal(s.freelancers[0].priority,1);assert.equal(s.availability.F1['2026-10-25'].MORNING,'AVAILABLE');assert.equal(s.replacements[0].freelancerId,null);
 assert.equal((await call(s,sup,'listSeatRequests'))[0].note,'Happy to cover');
 await assert.rejects(()=>call(s,actor('F2'),'withdrawSeatRequest',[r.id,r.version]),e=>e.code==='NOT_FOUND');
 await assert.rejects(()=>call(s,actor(),'listSeatRequests'),e=>e.code==='FORBIDDEN');
});
test('eligibility is checked for requests and again for allocation; withdrawal supports safe reapplication',async()=>{
 const s=await fixture();s.availability.F1['2026-10-25'].MORNING='UNAVAILABLE';
 await assert.rejects(()=>call(s,actor(),'requestVacancySeat',['R1',{note:''}]),e=>e.code==='NOT_ELIGIBLE');
 s.availability.F1['2026-10-25'].MORNING='AVAILABLE';let r=await call(s,actor(),'requestVacancySeat',['R1',{note:''}]);
 await call(s,actor(),'withdrawSeatRequest',[r.id,r.version]);r=await call(s,actor(),'requestVacancySeat',['R1',{note:'Available again'}]);assert.equal(r.version,3);
 s.freelancers[0].accountStatus='LOCKED';await assert.rejects(()=>call(s,sup,'decideSeatRequest',[r.id,{version:r.version,decision:'ALLOCATE'}]),e=>e.code==='NOT_ELIGIBLE');assert.equal(s.replacements[0].freelancerId,null);
 s.freelancers[0].accountStatus='ACTIVE';s.freelancers[0].qualifiedForProduction=false;await assert.rejects(()=>call(s,actor(),'requestVacancySeat',['R1',{note:''}]),e=>e.code==='NOT_ELIGIBLE');
});
test('supervisor allocation uses existing assignment workflow; competitors close and cannot allocate the same seat',async()=>{
 const s=await fixture();const first=await call(s,actor(),'requestVacancySeat',['R1',{note:''}]),second=await call(s,actor('F2'),'requestVacancySeat',['R1',{note:''}]);
 await assert.rejects(()=>call(s,actor(),'decideSeatRequest',[first.id,{version:1,decision:'ALLOCATE'}]),e=>e.code==='FORBIDDEN');
 const result=await call(s,sup,'decideSeatRequest',[first.id,{version:1,decision:'ALLOCATE'}]);assert.equal(result.status,'ALLOCATED');assert.equal(s.replacements[0].freelancerId,'F1');assert.equal(s.availability.F1['2026-10-25'].MORNING,'ASSIGNED');assert.ok(s.notifications.some(n=>n.recipientId==='F1'));assert.equal(s.freelancers[1].priority,2);
 const other=await call(s,actor('F2'),'getMySeatVacancies',['2026-10']);assert.equal(other.vacancies.length,0);assert.equal(other.requests[0].status,'NOT_SELECTED');
 await assert.rejects(()=>call(s,sup,'decideSeatRequest',[second.id,{version:1,decision:'ALLOCATE'}]),e=>e.code==='REQUEST_CLOSED');
});
test('reject, stale review, changed vacancy and production overlap are handled explicitly',async()=>{
 const s=await fixture();let r=await call(s,actor(),'requestVacancySeat',['R1',{note:''}]);
 await assert.rejects(()=>call(s,sup,'decideSeatRequest',[r.id,{version:2,decision:'REJECT'}]),e=>e.code==='STALE_VERSION');
 assert.equal((await call(s,sup,'decideSeatRequest',[r.id,{version:1,decision:'REJECT'}])).status,'REJECTED');
 r=await call(s,actor('F2'),'requestVacancySeat',['R1',{note:''}]);s.replacements[0].shiftEnd='2026-10-25T13:30:00+05:30';assert.equal((await call(s,actor('F2'),'getMySeatVacancies',['2026-10'])).requests[0].status,'CLOSED');
 await assert.rejects(()=>call(s,sup,'decideSeatRequest',[r.id,{version:1,decision:'ALLOCATE'}]),e=>e.code==='REQUEST_CLOSED');
 const t=await fixture();t.freelancers[0].compatiblePlatforms=['P2'];assert.ok((await call(t,actor(),'getMySeatVacancies',['2026-10'])).vacancies[0].reasons.includes('Not cleared for this platform'));
 t.freelancers[0].compatiblePlatforms=['P1'];t.freelancers[0].currentPlatform='P1';t.freelancers[0].shift='MORNING';assert.equal((await call(t,actor(),'getMySeatVacancies',['2026-10'])).vacancies[0].eligible,false);
});
test('requests and audit survive database persistence and a fresh runtime',async()=>{
 const db=new PGlite();try{
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  const s=await fixture();await db.query("INSERT INTO ops_state(key,data) VALUES('initialized','true')");await saveState(db,s);
  const before=structuredClone(s);const r=await call(s,actor(),'requestVacancySeat',['R1',{note:'Persist this request'}]);await saveState(db,s,before);
  const restored=await loadState(db);assert.equal(restored.seatRequests[0].id,r.id);assert.equal((await call(restored,sup,'listSeatRequests'))[0].note,'Persist this request');assert.ok(restored.audit.some(a=>a.action==='SEAT_REQUESTED'));
 }finally{await db.close();}
});
test('authenticated operations persist requests and enforce supervisor review across linked account IDs',async()=>{
 const pg=new PGlite();
 try{
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await pg.exec(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  const s=await fixture(),date=businessDate(new Date(Date.now()+2*86400000));s.replacements[0].date=date;s.replacements[0].shiftStart=`${date}T07:30:00+05:30`;s.replacements[0].shiftEnd=`${date}T19:30:00+05:30`;s.availability.F1[date]={MORNING:'AVAILABLE',NIGHT:'UNAVAILABLE'};
  await pg.query("INSERT INTO ops_state(key,data) VALUES('initialized','true')");await saveState(pg,s);
  const actors=[];
  for(const [workerId,role] of [['F1','FREELANCER'],['S1','SUPERVISOR'],['F2','FREELANCER']]){
   const user={id:randomUUID(),name:workerId,email:`${workerId.toLowerCase()}@test.local`,role};await pg.query('INSERT INTO users(id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5)',[user.id,user.email,user.name,role,'unused']);await pg.query('INSERT INTO operational_accounts(user_id,worker_id,role) VALUES($1,$2,$3)',[user.id,workerId,role]);actors.push({user,permissions:[]});
  }
  const db={query:(sql,p)=>pg.query(sql,p),connect:async()=>({query:(sql,p)=>pg.query(sql,p),release:()=>{}})};
  const run=(a,method,args=[])=>executeOperation(db,a,'workflows',method,args);
  assert.equal((await run(actors[0],'getMySeatVacancies',[date.slice(0,7)])).vacancies.length,1);
  const r=await run(actors[0],'requestVacancySeat',['R1',{note:'Linked request'}]);assert.equal(r.freelancerId,actors[0].user.id);
  assert.equal((await run(actors[1],'listSeatRequests'))[0].id,r.id);
  await assert.rejects(()=>run(actors[2],'decideSeatRequest',[r.id,{decision:'ALLOCATE',version:1}]),e=>e.code==='FORBIDDEN');
  await run(actors[1],'decideSeatRequest',[r.id,{decision:'ALLOCATE',version:1}]);
  const fresh=await loadState(pg);assert.equal(fresh.replacements[0].freelancerId,'F1');assert.equal(fresh.seatRequests[0].status,'ALLOCATED');assert.equal(fresh.availability.F1[date].MORNING,'ASSIGNED');
 }finally{await pg.close();}
});
