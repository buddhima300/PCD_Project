import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { rosterOperation, rosterProjection, scheduledWindow, projectRosterProfile } from '../src/modules/operations/roster.js';
import { executeOperation } from '../src/modules/operations/service.js';
import { importOperations } from '../scripts/import-operations.js';
import { loadState,saveState } from '../src/modules/operations/store.js';

const now=new Date('2026-10-01T00:00:00Z');
const staff=(id='E1')=>({user:{id,name:id,role:'EMPLOYEE'},workerId:id,permissions:[]});
const admin={user:{id:'S1',name:'Supervisor',role:'SUPERVISOR'},workerId:'S1',permissions:[]};
function fixture(){return {employees:['E1','E2','E3','E4'].map((id,i)=>({id,name:id,platformCode:i===3?'P2':'P1',categoryCode:'P',dept:'DP',shift:i===1?'NIGHT':'MORNING',status:'ACTIVE',accountStatus:'ACTIVE',joinedAt:'2025-01-01',offDaysAllowance:4,poolId:'POOL-P1-DP'})),platforms:[{code:'P1',departments:{DP:2}}],offDays:[],replacements:[],notifications:[],audit:[],rotationCycles:[],profile:{events:[]},availability:{}};}
const call=(s,actor,method,args=[],at=now)=>rosterOperation(s,actor,method,args,at);
const plan=(s,id='E1',month='2026-10')=>call(s,staff(id),'completeOffDayPlan',[month]);
const input=(kind='HALF_DAY',date='2026-10-10',extra={})=>({kind,startDate:date,endDate:date,reason:'Requested personal time',portion:'SECOND',idempotencyKey:randomUUID(),...extra});
const submit=(s,data=input(),actor=staff())=>call(s,actor,'submitLeaveRequest',[data]);
const approve=(s,r)=>call(s,admin,'decideLeaveRequest',[r.id,{decision:'APPROVED',reason:'Coverage reviewed',expectedVersion:r.version}]);
const rejects=(fn,code)=>assert.throws(fn,e=>e.code===code);

test('off-days share a two-person platform/department/date limit across shifts; retries and cancellation are safe',()=>{
  const s=fixture();const request=id=>call(s,staff(id),'requestOffDay',[id,'2026-10-12']);
  assert.equal(request('E1').outcome,'APPROVED');assert.equal(request('E2').outcome,'APPROVED');assert.equal(request('E3').outcome,'REJECTED');assert.equal(request('E4').outcome,'APPROVED');
  assert.equal(request('E1').outcome,'APPROVED');assert.equal(s.offDays.filter(o=>o.employeeId==='E1').length,1);
  const full=s.offDays.find(o=>o.employeeId==='E3');rejects(()=>call(s,admin,'overrideOffDay',[full.id,'Manager exception requested']),'CAPACITY_CONFLICT');
  const first=s.offDays.find(o=>o.employeeId==='E1');call(s,staff(),'cancelOffDay',[first.id]);call(s,staff(),'cancelOffDay',[first.id]);assert.equal(request('E3').outcome,'APPROVED');
});
test('monthly planning permits unused days and urgent medical bypasses planning only',()=>{
  const s=fixture();rejects(()=>submit(s),'PLAN_REQUIRED');plan(s);assert.equal(s.roster.plans.length,1);assert.equal(submit(s).status,'PENDING');
  const urgent=submit(s,input('MEDICAL_LEAVE','2026-10-14',{urgent:true}),staff('E2'));assert.equal(urgent.status,'PENDING');rejects(()=>approve(s,urgent),'ENTITLEMENT_REQUIRED');
});
test('pending requests reserve monthly limits and cancellation restores them; separate 8-hour allowance',()=>{
  const s=fixture();plan(s);const r=submit(s);rejects(()=>submit(s,input('HALF_DAY','2026-10-11')),'MONTHLY_LIMIT');
  assert.equal(submit(s,input('EIGHT_HOUR','2026-10-12')).status,'PENDING');rejects(()=>submit(s,input('EIGHT_HOUR','2026-10-13')),'MONTHLY_LIMIT');
  call(s,staff(),'cancelLeaveRequest',[r.id,r.version]);assert.equal(submit(s,input('HALF_DAY','2026-10-11')).status,'PENDING');
});
test('notice is measured against exact shift start, including night shifts',()=>{
  const s=fixture();plan(s);const start=scheduledWindow(s,s.employees[0],'2026-10-10').start;
  assert.equal(call(s,staff(),'submitLeaveRequest',[input('INFORMED_ABSENCE')],new Date(Date.parse(start)-48*3600000)).status,'PENDING');
  const t=fixture();plan(t);rejects(()=>call(t,staff(),'submitLeaveRequest',[input('INFORMED_ABSENCE')],new Date(Date.parse(start)-48*3600000+1)),'NOTICE_REQUIRED');
  plan(t,'E2');const night=scheduledWindow(t,t.employees[1],'2026-10-10');assert.equal(night.end,'2026-10-11T02:00:00.000Z');
  assert.equal(call(t,staff('E2'),'submitLeaveRequest',[input('INFORMED_ABSENCE')],new Date(Date.parse(night.start)-48*3600000)).status,'PENDING');
});
test('approved leave projects exact coverage while pending requests preserve staffing',()=>{
  const s=fixture();plan(s);const r=submit(s);const q=()=>rosterProjection(s,admin,{month:'2026-10'},now).rows[0].cells.find(c=>c.date==='2026-10-10');
  assert.equal(q().workingHours,12);assert.deepEqual(q().pending,['HALF_DAY']);approve(s,r);assert.equal(q().workingHours,6);assert.equal(q().uncoveredHours,6);
  const rep=call(s,admin,'createRosterReplacement',[r.id,'2026-10-10']);assert.equal(Date.parse(rep.shiftEnd)-Date.parse(rep.shiftStart),6*3600000);rep.status='ASSIGNED';rep.freelancerId='F1';rep.freelancerName='Freelancer';s.availability.F1={'2026-10-10':{MORNING:'ASSIGNED'}};
  assert.equal(q().state,'REPLACED');assert.equal(q().kind,'HALF_DAY');assert.equal(q().uncoveredHours,0);
  call(s,staff(),'cancelLeaveRequest',[r.id,r.version]);assert.equal(rep.status,'CANCELLED');assert.equal(s.availability.F1['2026-10-10'].MORNING,'AVAILABLE');assert.equal(q().workingHours,12);
});
test('8-hour shifts keep working status and four missing hours; dates use rotation records',()=>{
  const s=fixture();s.rotationCycles.push({start:'2026-10-05',status:'SCHEDULED',executedAt:null});plan(s);const r=submit(s,input('EIGHT_HOUR'));approve(s,r);
  const d=rosterProjection(s,admin,{month:'2026-10'},now).rows[0].cells.find(c=>c.date==='2026-10-10');assert.equal(d.shift,'NIGHT');assert.equal(d.workingHours,8);assert.equal(d.uncoveredHours,4);assert.equal(d.state,'WORKING');
});
test('annual entitlement is configured explicitly; pending days reserve it and yearly limits are rechecked',()=>{
  const s=fixture();plan(s);const r=submit(s,input('ANNUAL_LEAVE','2026-10-10',{endDate:'2026-10-11'}));rejects(()=>approve(s,r),'ENTITLEMENT_REQUIRED');
  call(s,admin,'setLeaveEntitlement',[{employeeId:'E1',year:2026,annual:2,medical:4,reason:'Verified allocation',expectedVersion:0}]);approve(s,r);
  rejects(()=>submit(s,input('ANNUAL_LEAVE','2026-10-15')),'INSUFFICIENT_BALANCE');
  rejects(()=>call(s,admin,'setLeaveEntitlement',[{employeeId:'E1',year:2026,annual:1,medical:4,reason:'Reduce allocation',expectedVersion:1}]),'INSUFFICIENT_BALANCE');
});
test('cross-month requests require planning and reserve entitlement in each year',()=>{
  const s=fixture();plan(s,'E1','2026-12');rejects(()=>submit(s,input('ANNUAL_LEAVE','2026-12-31',{endDate:'2027-01-01'})),'PLAN_REQUIRED');plan(s,'E1','2027-01');
  const r=submit(s,input('ANNUAL_LEAVE','2026-12-31',{endDate:'2027-01-01'}));
  for(const year of [2026,2027])call(s,admin,'setLeaveEntitlement',[{employeeId:'E1',year,annual:1,medical:0,reason:'Verified yearly allocation',expectedVersion:0}]);approve(s,r);
  assert.equal(rosterProjection(s,staff(),{month:'2027-01'},now).balance.annual.used,1);
});
test('mid-month joining does not fabricate earlier work or permit leave before employment starts',()=>{
  const s=fixture();s.employees[0].joinedAt='2026-10-20';plan(s);
  rejects(()=>call(s,staff(),'requestOffDay',['E1','2026-10-12']),'NOT_EMPLOYED');rejects(()=>submit(s),'NOT_EMPLOYED');
  const w=rosterProjection(s,staff(),{month:'2026-10'},now);assert.equal(w.rows[0].cells[18].scheduled,false);assert.equal(w.rows[0].cells[18].workingHours,0);assert.equal(w.rows[0].cells[19].workingHours,12);
  assert.equal(call(s,admin,'getDailyRoster',['2026-10-19',{}]).some(r=>r.employeeId==='E1'),false);
  const platform=call(s,admin,'getPlatformRoster',['P1','2026-10-19']);assert.equal(platform.depts.flatMap(d=>d.shifts.flatMap(x=>x.entries)).some(e=>e.id==='E1'),false);
});
test('half-day accrual is reserved, legacy ledger usage is deduplicated, and profile totals reconcile without fabricated attendance',()=>{
  const s=fixture();s.employees[0].joinedAt='2026-10-01';plan(s);rejects(()=>submit(s,input('CASUAL_LEAVE')),'INSUFFICIENT_BALANCE');const r=submit(s);approve(s,r);
  s.profile.events.push({workerId:'E1',kind:'HALF_DAY',date:'2026-10-10'});
  const profile=projectRosterProfile(s,{role:'EMPLOYEE',halfDays:99,attendance:[],hours:0,allowance:[{month:'2026-10',eligible:true}]},'E1','2026-10-31');assert.equal(profile.halfDays,0);assert.equal(profile.hours,0);assert.deepEqual(profile.attendance,[]);
});
test('ownership, stale decisions, idempotency, overlap, and invalid dates are enforced',()=>{
  const s=fixture();plan(s);const payload=input(),r=submit(s,payload);assert.equal(submit(s,payload).id,r.id);assert.equal(s.roster.requests.length,1);
  rejects(()=>submit(s,{...payload,reason:'Different reason'}),'IDEMPOTENCY_CONFLICT');rejects(()=>submit(s,input('CASUAL_LEAVE')),'OVERLAP');
  rejects(()=>call(s,staff('E2'),'cancelLeaveRequest',[r.id,1]),'FORBIDDEN');rejects(()=>call(s,staff(),'decideLeaveRequest',[r.id,{decision:'APPROVED',reason:'Trying approval',expectedVersion:1}]),'FORBIDDEN');approve(s,r);
  rejects(()=>call(s,admin,'decideLeaveRequest',[r.id,{decision:'REJECTED',reason:'Stale decision',expectedVersion:1}]),'CONCURRENCY_CONFLICT');
  assert.throws(()=>call(s,staff(),'requestOffDay',['E1','2026-02-30']),{name:'ZodError'});
  assert.equal(rosterProjection(s,staff(),{month:'2026-10'},now).rows.length,1);
});
test('freelancer calendars materialize real dates, persist new availability, and keep assignments locked',()=>{
  const s=fixture(),auth={user:{id:'F1',role:'FREELANCER',name:'Freelancer'},workerId:'F1',permissions:[]};s.freelancers=[{id:'F1',name:'Freelancer',dept:'DP'}];
  const calendar=call(s,auth,'getFreelancer',['F1','2026-11']);assert.equal(calendar.availability.length,30);assert.equal(calendar.availability[0].MORNING,'UNAVAILABLE');
  assert.equal(call(s,auth,'setAvailability',['F1','2026-11-01','MORNING','AVAILABLE']).MORNING,'AVAILABLE');
  s.replacements.push({freelancerId:'F1',date:'2026-11-01',shift:'MORNING',status:'ASSIGNED'});
  rejects(()=>call(s,auth,'setAvailability',['F1','2026-11-01','MORNING','OFF']),'ASSIGNED_SHIFT');
  rejects(()=>call(s,staff(),'getFreelancer',['F1','2026-11']),'FORBIDDEN');
  rejects(()=>call(s,auth,'setAvailability',['F1','2027-01-01','MORNING','AVAILABLE']),'OUT_OF_RANGE');
});
test('amendments preserve the approved schedule until review, reserve only the larger balance, and replace coverage atomically',()=>{
  const s=fixture();plan(s);const original=submit(s);approve(s,original);const rep=call(s,admin,'createRosterReplacement',[original.id,'2026-10-10']);
  const change=call(s,staff(),'amendLeaveRequest',[original.id,input('HALF_DAY','2026-10-12'),original.version]);
  let w=rosterProjection(s,staff(),{month:'2026-10'},now);assert.equal(w.balance.halfDayUsed,1);assert.equal(w.balance.halfUnitsReserved,0);assert.equal(w.rows[0].cells.find(c=>c.date==='2026-10-10').workingHours,6);assert.equal(w.rows[0].cells.find(c=>c.date==='2026-10-12').workingHours,12);
  approve(s,change);w=rosterProjection(s,staff(),{month:'2026-10'},now);assert.equal(original.status,'SUPERSEDED');assert.equal(rep.status,'CANCELLED');assert.equal(w.balance.halfDayUsed,1);assert.equal(w.rows[0].cells.find(c=>c.date==='2026-10-10').workingHours,12);assert.equal(w.rows[0].cells.find(c=>c.date==='2026-10-12').workingHours,6);
});
test('declining an amendment keeps the original approval and releasing a parent also releases its pending amendment',()=>{
  const s=fixture();plan(s);const original=submit(s);approve(s,original);const change=call(s,staff(),'amendLeaveRequest',[original.id,input('HALF_DAY','2026-10-12'),original.version]);
  call(s,admin,'decideLeaveRequest',[change.id,{decision:'REJECTED',reason:'Keep the agreed dates',expectedVersion:change.version}]);assert.equal(original.status,'APPROVED');
  const next=call(s,staff(),'amendLeaveRequest',[original.id,input('HALF_DAY','2026-10-13'),original.version]);call(s,staff(),'cancelLeaveRequest',[original.id,original.version]);assert.equal(next.status,'CANCELLED');assert.equal(rosterProjection(s,staff(),{month:'2026-10'},now).balance.halfDayUsed,0);
});
test('annual amendments reserve a maximum rather than double-counting original days, including across years',()=>{
  const s=fixture();plan(s,'E1','2026-12');plan(s,'E1','2027-01');for(const year of [2026,2027])call(s,admin,'setLeaveEntitlement',[{employeeId:'E1',year,annual:3,medical:0,reason:'Verified yearly allocation',expectedVersion:0}]);
  const original=submit(s,input('ANNUAL_LEAVE','2026-12-30',{endDate:'2026-12-31'}));approve(s,original);
  const change=call(s,staff(),'amendLeaveRequest',[original.id,input('ANNUAL_LEAVE','2026-12-31',{endDate:'2027-01-02'}),original.version]);
  const w=year=>rosterProjection(s,staff(),{month:`${year}-01`},now).balance.annual;
  assert.deepEqual(w(2026),{allowance:3,used:2,reserved:0});assert.deepEqual(w(2027),{allowance:3,used:0,reserved:2});approve(s,change);assert.equal(w(2026).used,1);assert.equal(w(2027).used,2);
});
test('PostgreSQL workflow serialization preserves the cap, role boundaries and requests across fresh domain runtimes',async()=>{
  const engine=new PGlite();let tail=Promise.resolve();
  const db={query:(s,p)=>engine.query(s,p),connect:async()=>{const before=tail;let release;tail=new Promise(r=>{release=r;});await before;return {query:(s,p)=>engine.query(s,p),release};}};
  try{
    for(const f of ['001_foundation.sql','002_operations.sql','003_workflow_records.sql','004_equipment_allocations.sql','005_login_access_controls.sql','007_staff_number_counters.sql','008_roster_management.sql'])await engine.exec(await readFile(new URL(`../migrations/${f}`,import.meta.url),'utf8'));
    const actors=Array.from({length:4},(_,i)=>({user:{id:randomUUID(),name:`Roster ${i}`,email:`roster${i}@test.local`,role:i===0?'SUPERVISOR':'EMPLOYEE'},permissions:[]}));
    for(const a of actors)await db.query('INSERT INTO users(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5)',[a.user.id,a.user.name,a.user.email,a.user.role,'unused']);
    await importOperations(db,{backup:false,nodeEnv:'test'});const s=await loadState(db),old=structuredClone(s),ids=[];
    for(let i=1;i<actors.length;i++){const id=(await db.query('SELECT worker_id FROM operational_accounts WHERE user_id=$1',[actors[i].user.id])).rows[0].worker_id;ids.push(id);Object.assign(s.employees.find(e=>e.id===id),{platformCode:'KANE-13',dept:'DP',shift:i===2?'NIGHT':'MORNING',status:'ACTIVE',accountStatus:'ACTIVE',qualifiedForProduction:true});}
    s.offDays=s.offDays.filter(o=>!ids.includes(o.employeeId));s.profile.events=s.profile.events.filter(e=>!ids.includes(e.workerId));await saveState(db,s,old);
    const date='2090-03-12',results=await Promise.all(actors.slice(1).map(a=>executeOperation(db,a,'workflows','requestOffDay',[a.user.id,date])));
    assert.equal(results.filter(r=>r.outcome==='APPROVED').length,2);assert.equal(results.filter(r=>r.outcome==='REJECTED').length,1);
    const a=actors[1];await executeOperation(db,a,'workflows','completeOffDayPlan',['2090-03']);
    const r=await executeOperation(db,a,'workflows','submitLeaveRequest',[input('HALF_DAY','2090-03-15')]);
    const w=await executeOperation(db,actors[0],'workflows','getRosterWorkspace',[{month:'2090-03',platform:'KANE-13'}]);assert.ok(w.requests.some(x=>x.id===r.id));
    await assert.rejects(executeOperation(db,actors[2],'workflows','cancelLeaveRequest',[r.id,1]),e=>e.status===403);
    assert.equal((await loadState(db)).roster.requests[0].status,'PENDING');
    await executeOperation(db,actors[0],'workflows','decideLeaveRequest',[r.id,{decision:'APPROVED',reason:'Confirmed allocation',expectedVersion:1}]);
    // Executing a legacy domain workflow cannot erase the new native module.
    await executeOperation(db,a,'workflows','getProfile',[a.user.id,'2090-03-01','2090-03-31']);
    const fresh=await executeOperation(db,a,'workflows','getRosterWorkspace',[{month:'2090-03'}]);assert.equal(fresh.requests.find(x=>x.id===r.id).status,'APPROVED');assert.equal(fresh.rows[0].cells.find(x=>x.date==='2090-03-15').workingHours,6);
  }finally{await engine.close();}
});
