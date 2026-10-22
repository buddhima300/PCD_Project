import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendanceSchedules, addDays } from '../src/modules/operations/attendance-schedule.js';

const date = '2026-10-20';
const now = new Date('2026-10-01T00:00:00Z');
function fixture() {
  return {
    employees: [{id:'EMP-1',name:'Employee',dept:'DP',platformCode:'P1',shift:'NIGHT',status:'ACTIVE',accountStatus:'ACTIVE',joinedAt:'2025-01-01'}],
    freelancers: [], platforms:[{code:'P1',status:'ACTIVE',lifecycle:'ACTIVE',departments:{DP:2}}],
    trainingAssignments:[],offDays:[],replacements:[],rotationCycles:[],profile:{events:[]},
    roster:{version:1,requests:[],plans:[],entitlements:[]},
  };
}
test('night occurrences retain their roster start date across midnight and month boundaries', () => {
  const s = fixture();
  const [work] = attendanceSchedules(s,['2026-10-31'],now);
  assert.equal(work.rosterDate,'2026-10-31');
  assert.equal(work.effectiveStart,'2026-10-31T14:00:00.000Z');
  assert.equal(work.effectiveEnd,'2026-11-01T02:00:00.000Z');
  assert.equal(addDays('2026-12-31',1),'2027-01-01');
});
test('approved off-days remove work while pending leave preserves the scheduled interval', () => {
  const s = fixture();
  s.offDays.push({id:'O1',employeeId:'EMP-1',date,status:'APPROVED',createdAt:now.toISOString()});
  assert.deepEqual(attendanceSchedules(s,[date],now),[]);
  s.offDays = [];
  s.roster.requests.push({id:'L1',employeeId:'EMP-1',kind:'HALF_DAY',dates:[date],status:'PENDING',createdAt:now.toISOString()});
  const [work] = attendanceSchedules(s,[date],now);
  assert.equal(Date.parse(work.effectiveEnd)-Date.parse(work.effectiveStart),12*3600000);
});
test('approved partial leave resolves the remaining exact interval and changes the source version', () => {
  const s = fixture();
  const [original] = attendanceSchedules(s,[date],now);
  s.roster.requests.push({id:'L1',employeeId:'EMP-1',kind:'HALF_DAY',portion:'FIRST',dates:[date],status:'APPROVED',createdAt:now.toISOString()});
  const [partial] = attendanceSchedules(s,[date],now);
  assert.equal(partial.effectiveStart,'2026-10-20T20:00:00.000Z');
  assert.equal(partial.effectiveEnd,original.effectiveEnd);
  assert.notEqual(partial.sourceVersion,original.sourceVersion);
  s.roster.requests[0].kind = 'EIGHT_HOUR';
  assert.equal(Date.parse(attendanceSchedules(s,[date],now)[0].effectiveEnd)-Date.parse(attendanceSchedules(s,[date],now)[0].effectiveStart),8*3600000);
});
test('scheduled rotations determine the occurrence shift', () => {
  const s = fixture();
  s.rotationCycles.push({start:'2026-10-15',status:'SCHEDULED',executedAt:null});
  assert.equal(attendanceSchedules(s,[date],now)[0].shift,'MORNING');
});
test('training, inactive logins and missing platform capacity never create eligible attendance', () => {
  for (const change of [w=>w.accountStatus='SUSPENDED',w=>w.qualifiedForProduction=false,w=>w.lifecycle='IN_PLATFORM_TRAINING',w=>w.status='TERMINATED']) {
    const s = fixture(); change(s.employees[0]);
    assert.deepEqual(attendanceSchedules(s,[date],now),[]);
  }
  const s = fixture(); s.platforms[0].departments.DP = 0;
  assert.deepEqual(attendanceSchedules(s,[date],now),[]);
});
test('freelancer availability alone is not an assignment; dated coverage keeps exact partial hours', () => {
  const s = fixture(); s.employees = [];
  s.freelancers.push({id:'FL-1',name:'Freelancer',dept:'DP',status:'ACTIVE',accountStatus:'ACTIVE'});
  assert.deepEqual(attendanceSchedules(s,[date],now),[]);
  s.replacements.push({id:'R1',freelancerId:'FL-1',date,shift:'NIGHT',platformCode:'P1',dept:'DP',status:'ASSIGNED',shiftStart:`${date}T19:30:00+05:30`,shiftEnd:`${date}T23:30:00+05:30`});
  const [work] = attendanceSchedules(s,[date],now);
  assert.equal(work.sourceKey,'replacement:R1');
  assert.equal(Date.parse(work.effectiveEnd)-Date.parse(work.effectiveStart),4*3600000);
  s.replacements[0].status = 'CANCELLED';
  assert.deepEqual(attendanceSchedules(s,[date],now),[]);
});
