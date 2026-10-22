import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { shiftAttendanceOperation as operation } from '../src/modules/operations/attendance-confirmations.js';
import { projectShiftAttendanceProfile } from '../src/modules/operations/attendance-profile.js';
import { dashboardAnalytics } from '../src/modules/operations/dashboard-analytics.js';

const now=new Date('2026-10-20T02:30:00Z'); // 08:00 Colombo
async function fixture() {
  const db=new PGlite();
  for(const f of (await readdir(new URL('../migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(`../migrations/${f}`,import.meta.url),'utf8'));
  const users=[];
  for(const [i,role] of ['EMPLOYEE','EMPLOYEE','FREELANCER','SUPERVISOR'].entries()){
    const user={id:randomUUID(),name:`Person ${i}`,role};users.push(user);
    await db.query('INSERT INTO users(id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5)',[user.id,`user${i}@test.example`,user.name,role,'unused-test-hash']);
    if(role!=='SUPERVISOR')await db.query('INSERT INTO workers(id,worker_number,user_id,name,email,worker_type,department_code,joined_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),`W${i}`,user.id,user.name,`user${i}@test.example`,role,'DP','2025-01-01']);
  }
  for(const asset of ['L1','L2'])await db.query('INSERT INTO ops_laptops(id,ordinal,data) VALUES($1,0,$2)',[asset,JSON.stringify({assetId:asset})]);
  const person=(i)=>({id:`W${i}`,name:users[i].name,dept:'DP',status:'ACTIVE',accountStatus:'ACTIVE',qualifiedForProduction:true,joinedAt:'2025-01-01',platformCode:'P1',shift:'MORNING'});
  const state={employees:[person(0),person(1)],freelancers:[{...person(2),platformCode:undefined}],platforms:[{code:'P1',status:'ACTIVE',lifecycle:'OPERATIONAL',departments:{DP:2}}],trainingAssignments:[],rotationCycles:[],offDays:[],replacements:[],profile:{events:[]},notifications:[],audit:[],incidents:[],
    laptops:['L1','L2'].map((assetId,i)=>({assetId,platformCode:'P1',dept:'DP',workstationId:`WS-P1-DP-0${i+1}`,status:'AVAILABLE',condition:'GOOD',serial:assetId,model:'Test laptop',currentUserId:null}))};
  const auth=i=>({user:users[i],workerId:`W${i}`,permissions:i===3?['attendance.correct']:[]});
  const call=async(i,method,args=[],at=now)=>{
    await db.exec('BEGIN');const before=structuredClone(state);
    try{const result=await operation(db,auth(i),state,method,args,at);await db.exec('COMMIT');return result;}
    catch(e){await db.exec('ROLLBACK');Object.assign(state,before);throw e;}
  };
  const context=i=>call(i,'getMyAttendanceContext');
  const input=async(i,extra={})=>{const c=await context(i),w=c.occurrences.find(w=>w.rosterDate==='2026-10-20');return {occurrenceId:w.id,expectedRevision:w.revision,department:'DP',assetId:'L1',attendanceOnly:false,notes:'',equipmentIssue:'',exceptionReason:'',declaration:true,deviceTimestamp:'2026-10-20T02:15:00Z',timezoneOffsetMinutes:-330,idempotencyKey:randomUUID(),...extra};};
  return {db,state,call,context,input,auth};
}
test('new attendance persistence, reviewed device clock, custody conflicts, returns, ownership and history',async t=>{
  const f=await fixture();t.after(()=>f.db.close());
  await t.test('device timestamp is authoritative, exactly 15 minutes is on time, server receipt is independent',async()=>{
    const input=await f.input(0);const record=await f.call(0,'confirmMyShiftAttendance',[input]);
    assert.equal(record.status,'CONFIRMED');assert.equal(record.punctuality,'ON_TIME');
    assert.equal(record.deviceTimestamp,new Date(input.deviceTimestamp).toISOString());assert.equal(record.acceptedAt,now.toISOString());
    assert.equal(record.custody.releasedAt,null);assert.equal(f.state.laptops[0].currentUserId,'W0');
    assert.equal((await f.call(0,'confirmMyShiftAttendance',[input])).id,record.id);
    await assert.rejects(f.call(0,'confirmMyShiftAttendance',[{...input,notes:'Changed'}]),e=>e.code==='IDEMPOTENCY_CONFLICT');
    const profile=await projectShiftAttendanceProfile(f.db,{attendance:[],events:[],hours:0,days:0},'W0','2026-10-20','2026-10-20');
    assert.equal(profile.hours,0);assert.equal(profile.days,1);
  });
  await t.test('other workers cannot claim a held laptop or read private evidence',async()=>{
    await assert.rejects(f.call(1,'confirmMyShiftAttendance',[await f.input(1)]),e=>e.code==='DEVICE_UNAVAILABLE');
    const record=(await f.context(0)).openCustody;
    await assert.rejects(f.call(1,'getShiftAttendanceDetail',[record.id]),e=>e.code==='FORBIDDEN');
    await assert.rejects(f.call(1,'returnMyShiftDevice',[{confirmationId:record.id,expectedRevision:1,notes:'',physicallyReturned:true,idempotencyKey:randomUUID()}]),e=>e.code==='FORBIDDEN');
  });
  await t.test('explicit physical return releases inventory once and creates durable separate events',async()=>{
    const record=(await f.context(0)).openCustody;
    const payload={confirmationId:record.id,expectedRevision:1,notes:'Returned to department',physicallyReturned:true,idempotencyKey:randomUUID()};
    await assert.rejects(f.call(0,'returnMyShiftDevice',[{...payload,expectedRevision:2}]),e=>e.code==='CONCURRENCY_CONFLICT');
    const returned=await f.call(0,'returnMyShiftDevice',[payload],new Date('2026-10-20T04:00:00Z'));
    assert.ok(returned.custody.releasedAt);assert.equal(f.state.laptops[0].currentUserId,null);
    assert.equal((await f.call(0,'returnMyShiftDevice',[payload])).id,record.id);
    const detail=await f.call(0,'getShiftAttendanceDetail',[record.id]);assert.deepEqual(detail.events.map(e=>e.kind),['RECEIPT','RETURN']);
    const profile=await projectShiftAttendanceProfile(f.db,{attendance:[],events:[],hours:0,days:0},'W0','2026-10-20','2026-10-20');assert.equal(profile.hours,1.75);
  });
  await t.test('equipment exceptions require a reason and supervisor review without claiming custody',async()=>{
    const input=await f.input(1,{attendanceOnly:true,assetId:undefined,exceptionReason:'All laptops are unavailable',deviceTimestamp:'2026-10-20T02:15:00.001Z'});
    await assert.rejects(f.call(1,'confirmMyShiftAttendance',[{...input,exceptionReason:''}]),e=>e.code==='REASON_REQUIRED');
    const record=await f.call(1,'confirmMyShiftAttendance',[input]);assert.equal(record.status,'NEEDS_REVIEW');assert.equal(record.punctuality,'LATE');assert.equal(record.custody,null);
    await assert.rejects(f.call(1,'reviewShiftAttendance',[record.id,{expectedRevision:1,status:'CONFIRMED',reason:'Verified worker presence'}]),e=>e.code==='FORBIDDEN');
    const reviewed=await f.call(3,'reviewShiftAttendance',[record.id,{expectedRevision:1,status:'CONFIRMED',reason:'Verified worker presence'}]);
    assert.equal(reviewed.status,'CONFIRMED');assert.equal(reviewed.deviceTimestamp,input.deviceTimestamp);assert.equal(reviewed.corrections.length,1);
    await assert.rejects(f.call(3,'reviewShiftAttendance',[record.id,{expectedRevision:1,status:'VOIDED',reason:'Stale review request'}]),e=>e.code==='CONCURRENCY_CONFLICT');
  });
  await t.test('register and directory share persisted evidence and correct date/type filters',async()=>{
    const rows=await f.call(3,'listShiftAttendance',[{from:'2026-10-20',to:'2026-10-20',workerType:'EMPLOYEE',status:'CONFIRMED'}]);assert.equal(rows.total,2);
    const summary=await f.call(3,'getDirectoryAttendance',[{date:'2026-10-20',shift:'MORNING',workerIds:['W0','W1','W2']}]);assert.equal(summary.W0.status,'CONFIRMED');assert.equal(summary.W2.status,'NOT_SCHEDULED');
    assert.equal((await f.call(3,'listShiftAttendance',[{from:'2026-10-21',to:'2026-10-21'}])).total,0);
  });
});
test('confirmation stays available hours before the shift using both server and device clocks',async t=>{
  const f=await fixture();t.after(()=>f.db.close());
  const early=new Date('2026-10-19T20:00:00Z');
  const context=await f.call(0,'getMyAttendanceContext',[],early);
  const work=context.occurrences.find(w=>w.rosterDate==='2026-10-20');
  assert.equal(work.canSubmit,true);assert.equal(work.reason,null);
  assert.equal(context.occurrences.every(w=>w.canSubmit),true);
  const record=await f.call(0,'confirmMyShiftAttendance',[await f.input(0,{deviceTimestamp:early.toISOString()})],early);
  assert.equal(record.status,'CONFIRMED');assert.equal(record.punctuality,'ON_TIME');
  assert.equal(record.acceptedAt,early.toISOString());assert.equal(record.deviceTimestamp,early.toISOString());
  const refreshed=await f.call(0,'getMyAttendanceContext',[],early);
  assert.equal(refreshed.occurrences.find(w=>w.id===work.id).canSubmit,false);
});

test('live changes, late review, freelancer assignments and unique custody constraints',async t=>{
  const f=await fixture();t.after(()=>f.db.close());
  const input=await f.input(0);
  f.state.laptops[1].currentUserId='W0';
  await assert.rejects(f.call(0,'confirmMyShiftAttendance',[input]),e=>e.code==='CURRENT_CUSTODY');
  f.state.laptops[1].currentUserId=null;
  f.state.employees[0].shift='NIGHT';
  await assert.rejects(f.call(0,'confirmMyShiftAttendance',[input]),e=>e.code==='SCHEDULE_CHANGED');
  f.state.employees[0].shift='MORNING';
  const late=await f.call(0,'confirmMyShiftAttendance',[{...input,deviceTimestamp:'2026-10-20T14:00:00.001Z'}]);assert.equal(late.status,'NEEDS_REVIEW');
  assert.equal((await f.context(2)).occurrences.length,0);
  f.state.replacements.push({id:'R1',freelancerId:'W2',date:'2026-10-20',shift:'MORNING',platformCode:'P1',dept:'DP',status:'ASSIGNED',shiftStart:'2026-10-20T07:30:00+05:30',shiftEnd:'2026-10-20T11:30:00+05:30'});
  const freelancer=await f.call(2,'confirmMyShiftAttendance',[await f.input(2,{assetId:'L2'})]);assert.equal(freelancer.workerType,'FREELANCER');assert.equal(freelancer.effectiveEnd,'2026-10-20T06:00:00.000Z');
  const worker=(await f.db.query("SELECT id FROM workers WHERE worker_number='W1'")).rows[0];
  await assert.rejects(f.db.query('INSERT INTO equipment_custody_sessions(id,confirmation_id,worker_id,asset_id,received_at) VALUES($1,$2,$3,$4,$5)',[randomUUID(),freelancer.id,worker.id,'L2',now]),e=>e.code==='23505');
});

test('attendance laptop options and submission stay within assigned platform, department and configured workstation seats',async t=>{
  const f=await fixture();t.after(()=>f.db.close());
  const payload=await f.input(0,{assetId:'L2'});
  const original=structuredClone(f.state.laptops[1]);
  for(const change of [
    {platformCode:'OTHER'}, {dept:'WD'}, {workstationId:'WS-P1-DP03'},
    {workstationId:null}, {status:'ASSIGNED'}, {status:'MAINTENANCE'},
    {status:'RETIRED'}, {condition:'DAMAGED'}, {currentUserId:'W1'},
  ]){
    f.state.laptops[1]={...original,...change};
    const options=await f.call(0,'getMyAttendanceDevices',[payload.occurrenceId]);
    assert.deepEqual(options.map(d=>d.assetId),['L1'],JSON.stringify(change));
    assert.equal(options[0].workstationId,'WS-P1-DP01');
    await assert.rejects(f.call(0,'confirmMyShiftAttendance',[payload]),e=>e.code==='DEVICE_UNAVAILABLE',JSON.stringify(change));
  }
  f.state.laptops[1]={...original,workstationId:'WS-P1-DP02'};
  assert.equal((await f.call(0,'getMyAttendanceDevices',[payload.occurrenceId])).length,2);
  f.state.incidents.push({assetId:'L2',status:'OPEN'});
  assert.deepEqual((await f.call(0,'getMyAttendanceDevices',[payload.occurrenceId])).map(d=>d.assetId),['L1']);
  f.state.incidents=[];
  await f.call(0,'confirmMyShiftAttendance',[payload]);
  // An active SQL custody session still excludes a device if inventory custody is stale.
  Object.assign(f.state.laptops[1],{currentUserId:null,status:'AVAILABLE'});
  const other=await f.input(1);
  assert.deepEqual((await f.call(1,'getMyAttendanceDevices',[other.occurrenceId])).map(d=>d.assetId),['L1']);
});

test('dashboard compares database attendance and device custody by operational shift date',async t=>{
  const f=await fixture();t.after(()=>f.db.close());
  let analytics=await dashboardAnalytics(f.db,f.state,now);
  assert.equal(analytics.currentShift,'MORNING');
  assert.equal(analytics.date,'2026-10-20');
  assert.equal(analytics.shifts.MORNING.scheduled,2);
  assert.equal(analytics.shifts.MORNING.confirmed,0);
  assert.equal(analytics.shifts.NIGHT.scheduled,0);
  assert.equal(analytics.shifts.NIGHT.target,2);
  const record=await f.call(0,'confirmMyShiftAttendance',[await f.input(0)]);
  analytics=await dashboardAnalytics(f.db,f.state,now);
  assert.equal(analytics.shifts.MORNING.confirmed,1);
  assert.deepEqual(analytics.workforce.attendance.MORNING,{assigned:2,confirmed:1});
  assert.equal(analytics.shifts.MORNING.devicesHeld,1);
  await f.call(0,'returnMyShiftDevice',[{confirmationId:record.id,expectedRevision:1,notes:'Returned',physicallyReturned:true,idempotencyKey:randomUUID()}]);
  analytics=await dashboardAnalytics(f.db,f.state,new Date('2026-10-20T20:00:00Z'));
  assert.equal(analytics.currentShift,'NIGHT');
  assert.equal(analytics.date,'2026-10-20'); // 01:30 Colombo on October 21
  assert.equal(analytics.shifts.MORNING.devicesHeld,0);
  assert.equal(analytics.shifts.MORNING.confirmed,1);
});
