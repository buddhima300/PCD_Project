import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { incrementEvidence,incrementProgress } from '../src/modules/operations/increment-eligibility.js';
import { incrementExamOperation } from '../src/modules/operations/increment-exams.js';
import { notificationFeed } from '../src/modules/operations/notification-feed.js';
import { addDays } from '../src/modules/operations/attendance-schedule.js';

const now=new Date('2026-10-23T04:00:00Z');
const employee={id:'EMP-1',name:'Employee One',dept:'DP',platformCode:'P1',joinedAt:'2026-07-01',shift:'MORNING',status:'ACTIVE',accountStatus:'ACTIVE'};
const state=()=>({employees:[structuredClone(employee)],offDays:[],handovers:[],replacements:[],roster:{requests:[]},profile:{events:[]},notifications:[],audit:[]});
const attendance=(date,extra={})=>({worker_number:'EMP-1',date,shift:'MORNING',effective_end:`${date}T14:00:00Z`,status:'CONFIRMED',...extra});
test('joining-date credit includes off-days, halves half-days and excludes leave without fabricating missing work',()=>{
  const s=state(),days=Array.from({length:95},(_,i)=>addDays('2026-07-01',i)),records=days.map(d=>attendance(d));
  // Training may precede production; only actual evidence earns credit.
  s.employees[0].qualifiedForProduction=false;
  s.offDays.push({employeeId:'EMP-1',date:days[1],status:'APPROVED'});records.splice(1,1);
  s.roster.requests.push({employeeId:'EMP-1',dates:[days[2]],status:'APPROVED',kind:'HALF_DAY'},
    {employeeId:'EMP-1',dates:[days[3]],status:'APPROVED',kind:'EIGHT_HOUR'},
    {employeeId:'EMP-1',dates:[days[4]],status:'APPROVED',kind:'ANNUAL_LEAVE'},
    {employeeId:'EMP-1',dates:[days[5]],status:'PENDING',kind:'MEDICAL_LEAVE'});
  s.profile.events.push({workerId:'EMP-1',date:days[6],kind:'UNINFORMED_ABSENCE'});
  s.replacements.push({absentEmployeeId:'EMP-1',date:days[7],status:'ASSIGNED'});
  records.push(attendance(days[0],{shift:'NIGHT'}),attendance('2026-06-30'));
  const p=incrementProgress(employee,incrementEvidence(s,records),null,now);
  assert.equal(p.creditedDays,91.5);assert.equal(p.breakdown.offDays,1);assert.equal(p.breakdown.halfDays,.5);assert.equal(p.breakdown.excluded,3);
  assert.equal(p.eligible,true);assert.equal(p.eligibleSince,days[93]);assert.ok(p.breakdown.unverified>0);
});
test('exact 90 boundary, overnight end and unreviewed/void evidence are respected',()=>{
  const s=state(),dates=Array.from({length:90},(_,i)=>addDays('2026-07-01',i));
  let rows=dates.map(d=>attendance(d));
  assert.equal(incrementProgress(employee,incrementEvidence(s,rows),null,now).eligible,true);
  rows[89].status='NEEDS_REVIEW';assert.equal(incrementProgress(employee,incrementEvidence(s,rows),null,now).creditedDays,89);
  rows[89].status='VOIDED';s.handovers.push({incomingId:'EMP-1',incomingShift:'MORNING',scheduledAt:`${dates[89]}T07:30:00+05:30`,receivedAt:`${dates[89]}T02:00:00Z`,selfConfirmationReason:'Historical receipt'});
  assert.equal(incrementProgress(employee,incrementEvidence(s,rows),null,now).creditedDays,89);
  const end='2026-10-23T02:00:00Z',night=[attendance('2026-10-22',{shift:'NIGHT',effective_end:end})];
  assert.equal(incrementProgress(employee,incrementEvidence(state(),night),null,new Date(Date.parse(end)-1)).creditedDays,0);
  assert.equal(incrementProgress(employee,incrementEvidence(state(),night),null,new Date(end)).creditedDays,1);
  const rotated=state();rotated.rotationCycles=[{start:'2026-10-22',status:'SCHEDULED',executedAt:null}];
  rotated.offDays.push({employeeId:'EMP-1',date:'2026-10-22',status:'APPROVED'});
  assert.equal(incrementProgress(employee,incrementEvidence(rotated,[]),null,new Date('2026-10-22T15:00:00Z'),rotated).creditedDays,0);
  assert.equal(incrementProgress(employee,incrementEvidence(rotated,[]),null,new Date(end),rotated).creditedDays,1);
});
test('verified history replaces its covered period and invalid balances never make an employee eligible',()=>{
  const evidence=incrementEvidence(state(),[attendance('2026-10-01'),attendance('2026-10-02')]);
  const baseline={through_date:'2026-10-01',credited_days:'89.5',revision:1,reason:'Verified paper attendance'};
  const p=incrementProgress(employee,evidence,baseline,now);assert.equal(p.creditedDays,90.5);assert.equal(p.breakdown.working,1);
  assert.equal(incrementProgress({...employee,joinedAt:'2026-10-10'},evidence,baseline,now).eligible,false);
  assert.equal(incrementProgress({...employee,status:'INACTIVE'},evidence,baseline,now).eligible,false);
});

async function fixture(){
  const db=new PGlite();
  for(const f of (await readdir(new URL('../migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(`../migrations/${f}`,import.meta.url),'utf8'));
  const users=[];for(const [i,role] of ['SUPERVISOR','SUPERVISOR','EMPLOYEE','EMPLOYEE','FREELANCER'].entries()){
    const u={id:randomUUID(),name:`User ${i}`,role};users.push(u);
    await db.query('INSERT INTO users(id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5)',[u.id,`exam-${i}@test.local`,u.name,role,'unused']);
    await db.query('INSERT INTO operational_accounts(user_id,worker_id,role) VALUES($1,$2,$3)',[u.id,i===2?'EMP-1':i===3?'EMP-2':`U${i}`,role]);
  }
  for(const [index,number] of [[2,'EMP-1'],[3,'EMP-2']])await db.query('INSERT INTO workers(id,worker_number,user_id,name,email,worker_type,department_code,joined_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),number,users[index].id,number,`${number.toLowerCase()}@test.local`,'EMPLOYEE','DP','2026-07-01']);
  const s=state();s.employees.push({...employee,id:'EMP-2',name:'Employee Two'});
  const auth=i=>({user:users[i],workerId:i===2?'EMP-1':i===3?'EMP-2':`U${i}`,permissions:i===0?['attendance.correct']:[]});
  const call=async(i,method,args=[])=>{const previous=structuredClone(s);await db.exec('BEGIN');try{const r=await incrementExamOperation(db,auth(i),s,method,args,now);await db.exec('COMMIT');return r;}catch(e){await db.exec('ROLLBACK');Object.assign(s,previous);throw e;}};
  const balance=(extra={})=>({throughDate:'2026-09-30',creditedDays:90,reason:'Verified signed attendance ledger including off-days',expectedRevision:0,...extra});
  return {db,s,auth,call,balance,users};
}
test('persisted eligibility, secure opening balance, appointments, retries, review changes and notifications',async t=>{
  const f=await fixture();t.after(()=>f.db.close());
  await assert.rejects(f.call(2,'listIncrementEligibility',[{}]),e=>e.code==='FORBIDDEN');
  await assert.rejects(f.call(2,'getIncrementProgress',['EMP-2']),e=>e.code==='FORBIDDEN');
  await assert.rejects(f.call(4,'getIncrementProgress',[]),e=>e.code==='FORBIDDEN');
  await assert.rejects(f.call(1,'setIncrementOpeningBalance',['EMP-1',f.balance()]),e=>e.code==='FORBIDDEN');
  await assert.rejects(f.call(0,'setIncrementOpeningBalance',['EMP-1',f.balance({creditedDays:100})]),e=>e.code==='INVALID_BALANCE');
  const opening=await f.call(0,'setIncrementOpeningBalance',['EMP-1',f.balance()]);assert.equal(opening.progress.eligible,true);
  const own=await f.call(2,'getIncrementProgress',[]);assert.equal(own.progress.creditedDays,90);assert.equal(own.history.length,1);
  assert.equal((await f.call(0,'listIncrementEligibility',[{status:'ELIGIBLE'}])).total,1);
  const input={startsAt:'2026-11-02T10:00:00+05:30',location:'Colombo office, Room 2',instructions:'Bring staff ID and report 15 minutes early.',expectedRevision:0,expectedEligibilityVersion:opening.progress.eligibilityVersion,idempotencyKey:randomUUID()};
  await assert.rejects(f.call(0,'scheduleIncrementExam',['EMP-2',input]),e=>e.code==='NOT_ELIGIBLE');
  await assert.rejects(f.call(2,'scheduleIncrementExam',['EMP-1',input]),e=>e.code==='FORBIDDEN');
  const scheduled=await f.call(0,'scheduleIncrementExam',['EMP-1',input]);assert.equal(scheduled.appointment.status,'SCHEDULED');
  const count=f.s.notifications.length;assert.deepEqual(await f.call(0,'scheduleIncrementExam',['EMP-1',input]),scheduled);assert.equal(f.s.notifications.length,count);
  await assert.rejects(f.call(0,'scheduleIncrementExam',['EMP-1',{...input,location:'Another room'}]),e=>e.code==='IDEMPOTENCY_CONFLICT');
  await assert.rejects(f.call(1,'scheduleIncrementExam',['EMP-1',{...input,idempotencyKey:randomUUID()}]),e=>e.code==='CONCURRENCY_CONFLICT');
  const rescheduled=await f.call(1,'scheduleIncrementExam',['EMP-1',{...input,startsAt:'2026-11-03T10:00:00+05:30',expectedRevision:1,idempotencyKey:randomUUID()}]);assert.equal(rescheduled.appointment.revision,2);
  assert.ok(f.s.notifications.some(n=>n.title==='Increment exam rescheduled'));
  // Feed reads durable notification records, respects ownership, and reports unread state.
  await f.db.query('INSERT INTO ops_notifications(id,ordinal,data) SELECT value->>\'id\',ordinality::integer,value FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY',[JSON.stringify(f.s.notifications)]);
  const mine=await notificationFeed(f.db,f.auth(2),[{}]),other=await notificationFeed(f.db,f.auth(3),[{}]);
  assert.equal(mine.items.length,count+1);assert.equal(other.items.length,0);assert.ok(mine.items.some(n=>n.body.includes('Room 2')&&n.link==='/profile#increment-exam'));
  await f.call(0,'setIncrementOpeningBalance',['EMP-1',f.balance({creditedDays:89.5,expectedRevision:1})]);
  const changed=await f.call(2,'getIncrementProgress',[]);assert.equal(changed.appointmentNeedsReview,true);assert.equal(changed.appointment.status,'SCHEDULED');
  const cancelled=await f.call(0,'cancelIncrementExam',['EMP-1',{expectedRevision:2,reason:'Eligibility records need reconciliation',idempotencyKey:randomUUID()}]);assert.equal(cancelled.appointment.status,'CANCELLED');
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM increment_exam_appointments')).rows[0].n,1);
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM increment_exam_events')).rows[0].n,5);
  await f.db.query("UPDATE workers SET worker_number='EMP-9' WHERE worker_number='EMP-1'");
  f.s.employees[0].id='EMP-9';
  const renamed=await f.call(0,'getIncrementProgress',['EMP-9']);assert.equal(renamed.progress.baseline.creditedDays,89.5);assert.equal(renamed.appointment.id,cancelled.appointment.id);assert.equal(renamed.history.length,5);
});
