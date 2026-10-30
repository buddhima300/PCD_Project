import {test} from 'node:test';
import assert from 'node:assert/strict';
import {myPlatformProjection,myPlatformOverview} from '../src/modules/operations/my-platform.js';
import {PGlite} from '@electric-sql/pglite';
const now=new Date('2026-10-23T04:30:00Z');
const auth={user:{role:'EMPLOYEE'},workerId:'E1'};
function fixture(){return {employees:['E1','E2','E3'].map((id,i)=>({id,name:id,platformCode:i===2?'P2':'P1',dept:'DP',shift:'MORNING',status:'ACTIVE',accountStatus:'ACTIVE',joinedAt:'2025-01-01',email:'private@example.com'})),freelancers:[],platforms:[{code:'P1',status:'ACTIVE',departments:{DP:3},description:'Shared operations'},{code:'P2',status:'ACTIVE',departments:{DP:3}}],categories:[],laptops:[],trainingAssignments:[],candidates:[],offDays:[],replacements:[],rotationCycles:[],profile:{events:[]},breaks:{sessions:[]}};}
test('own platform resolves candidate-linked trainees without a production assignment',()=>{
 const s=fixture();s.employees[0].platformCode='';s.employees[0].qualifiedForProduction=false;s.candidates=[{id:'C1',registeredWorkerId:'E1'}];s.trainingAssignments=[{workerId:'C1',platformCode:'P1',dept:'DP',shift:'NIGHT',trainingStatus:'IN_TRAINING',completedTrainingDays:4,requiredTrainingDays:10,evaluation:'private'}];
 const v=myPlatformProjection(s,auth,[],now);assert.equal(v.assignment.kind,'TRAINEE');assert.equal(v.platform.code,'P1');assert.equal(v.assignment.training.completed,4);assert.equal(v.team[0].status,'Training');assert.ok(!JSON.stringify(v).includes('private'));
});
test('live break and attendance use platform scope and do not expose private evidence',()=>{
 const s=fixture();s.breaks.sessions=['E2','E3'].map(workerId=>({id:workerId,workerId,workerName:workerId,platform:workerId==='E2'?'P1':'P2',department:'DP',shiftDate:'2026-10-23',shift:'MORNING',status:'ACTIVE',startedAt:'2026-10-23T04:20:00Z',shiftEnd:'2026-10-23T14:00:00Z',review:{reason:'secret'}}));
 const v=myPlatformProjection(s,auth,[{workerId:'E1',platformCode:'P1',date:'2026-10-23',shift:'MORNING',status:'CONFIRMED',notes:'secret'}],now);
 assert.equal(v.breaks.length,1);assert.equal(v.breaks[0].seconds,600);assert.equal(v.team.find(t=>t.id==='E2').status,'On break');assert.equal(v.team[0].status,'Attendance confirmed');assert.ok(!v.team.some(t=>t.id==='E3'));assert.ok(!JSON.stringify(v).includes('secret'));
});
test('approved off-days only, including next-month dates, and missing attendance is not absence',()=>{
 const s=fixture();s.offDays=[{employeeId:'E2',date:'2026-10-24',status:'APPROVED',createdAt:now.toISOString()},{employeeId:'E1',date:'2026-10-25',status:'PENDING',createdAt:now.toISOString()},{employeeId:'E3',date:'2026-10-24',status:'APPROVED',createdAt:now.toISOString()}];
 const v=myPlatformProjection(s,auth,[],now);assert.deepEqual(v.offDays.map(o=>o.name),['E2']);assert.equal(v.team[0].status,'Attendance not submitted');
 s.offDays.push({employeeId:'E2',date:'2026-11-01',status:'APPROVED',createdAt:now.toISOString()});assert.ok(myPlatformProjection(s,auth,[],new Date('2026-10-29T04:30:00Z')).offDays.some(o=>o.date==='2026-11-01'));
});
test('overnight activity belongs to previous roster date and stale breaks stop being live',()=>{
 const s=fixture();s.employees[0].shift='NIGHT';s.breaks.sessions=[{id:'B1',workerId:'E1',platform:'P1',department:'DP',shiftDate:'2026-10-22',shift:'NIGHT',status:'ACTIVE',startedAt:'2026-10-22T16:00:00Z',shiftEnd:'2026-10-22T17:00:00Z'}];
 const v=myPlatformProjection(s,auth,[],new Date('2026-10-22T20:00:00Z'));assert.equal(v.live.date,'2026-10-22');assert.equal(v.live.shift,'NIGHT');assert.equal(v.breaks[0].active,false);
});
test('self-scoped endpoint denies supervisors and arbitrary platform arguments',async()=>{
 assert.throws(()=>myPlatformProjection(fixture(),{...auth,user:{role:'SUPERVISOR'}},[],now),e=>e.code==='FORBIDDEN');
 await assert.rejects(()=>myPlatformOverview({},fixture(),auth,['P2'],now));
});
test('database attendance query scopes by assigned platform, roster date and live shift',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE workers(id text PRIMARY KEY,worker_number text);
   CREATE TABLE work_occurrences(id text PRIMARY KEY,worker_id text,platform_code text,roster_date date,shift text);
   CREATE TABLE attendance_confirmations(occurrence_id text,status text,notes text);
   INSERT INTO workers VALUES('stable-1','E1'),('stable-2','E2'),('stable-3','E3');
   INSERT INTO work_occurrences VALUES('O1','stable-1','P1','2026-10-23','MORNING'),('O2','stable-2','P1','2026-10-23','NIGHT'),('O3','stable-3','P2','2026-10-23','MORNING');
   INSERT INTO attendance_confirmations VALUES('O1','CONFIRMED','private evidence'),('O2','CONFIRMED','private evidence'),('O3','CONFIRMED','private evidence');`);
  const result=await myPlatformOverview(db,fixture(),auth,[],now);
  assert.equal(result.team[0].status,'Attendance confirmed');assert.equal(result.team.find(t=>t.id==='E2').status,'Attendance not submitted');assert.equal(result.departments[0].confirmed,1);assert.ok(!JSON.stringify(result).includes('private evidence'));
 }finally{await db.close();}
});
