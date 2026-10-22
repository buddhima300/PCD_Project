import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workforceDashboard } from '../src/modules/operations/workforce-dashboard.js';
const now=new Date('2026-10-29T03:00:00Z');
function fixture(){return {
  employees:[{id:'E1',name:'Amali',platformCode:'P1',dept:'DP',shift:'MORNING',status:'ACTIVE',accountStatus:'ACTIVE',qualifiedForProduction:true,joinedAt:'2025-01-01'},{id:'E2',name:'Nimal',platformCode:'P1',dept:'DP',shift:'NIGHT',status:'ACTIVE',accountStatus:'ACTIVE',qualifiedForProduction:true,joinedAt:'2025-01-01'}],
  freelancers:[],platforms:[{code:'P1',status:'ACTIVE',lifecycle:'OPERATIONAL',departments:{DP:2}}],trainingAssignments:[],offDays:[],replacements:[],rotationCycles:[],profile:{events:[]},roster:{version:1,requests:[],plans:[],entitlements:[]},
};}
const run=(s,records=[],at=now,current={date:'2026-10-29',shift:'MORNING'})=>workforceDashboard(s,records,true,at,current);
test('employee-only attendance uses assigned employee denominator, not freelancers or missing declarations',()=>{
  const s=fixture();s.offDays.push({id:'O1',employeeId:'E1',date:'2026-10-29',status:'APPROVED',createdAt:now.toISOString()});
  const d=run(s,[{shift:'MORNING',status:'CONFIRMED',worker_type:'EMPLOYEE',operational_worker_id:'E1'},{shift:'MORNING',status:'CONFIRMED',worker_type:'FREELANCER',operational_worker_id:'F1'}]);
  assert.deepEqual(d.attendance.MORNING,{assigned:1,confirmed:1});
  assert.deepEqual(d.attendance.NIGHT,{assigned:1,confirmed:0});
  assert.equal(d.absences.length,0);
  assert.equal(d.offDays[0].name,'Amali');
});
test('absence counts deduplicate approved informed absence and profile events; pending, off-days and future dates are excluded',()=>{
  const s=fixture();s.profile.events=[{workerId:'E1',date:'2026-10-28',kind:'INFORMED_ABSENCE'},{workerId:'E1',date:'2026-10-27',kind:'UNINFORMED_ABSENCE'},{workerId:'E1',date:'2026-10-30',kind:'UNINFORMED_ABSENCE'},{workerId:'E2',date:'2026-10-26',kind:'OFF_DAY'}];
  s.roster.requests=[{id:'R1',employeeId:'E1',dates:['2026-10-28'],kind:'INFORMED_ABSENCE',status:'APPROVED',createdAt:now.toISOString()},{id:'R2',employeeId:'E2',dates:['2026-10-25'],kind:'INFORMED_ABSENCE',status:'PENDING',createdAt:now.toISOString()}];
  const d=run(s);assert.equal(d.absences.length,1);assert.equal(d.absences[0].frequency,2);
  assert.equal(d.absenceTrend.reduce((n,p)=>n+p.count,0),2);
  assert.equal(d.absenceHistogram.find(b=>b.label==='2').count,1);
});
test('today off-days follow calendar date after midnight and only include approved records',()=>{
  const s=fixture();s.offDays=[{id:'O1',employeeId:'E1',date:'2026-10-30',status:'APPROVED',createdAt:now.toISOString()},{id:'O2',employeeId:'E2',date:'2026-10-30',status:'REQUESTED',createdAt:now.toISOString()}];
  const d=run(s,[],new Date('2026-10-29T20:00:00Z'),{date:'2026-10-29',shift:'NIGHT'});
  assert.equal(d.today,'2026-10-30');assert.equal(d.offDays.length,1);assert.equal(d.offDays[0].employeeId,'E1');
});
test('replacement demand crosses month boundaries, excludes assigned cover, deduplicates leave and retains partial coverage',()=>{
  const s=fixture();
  const interval=(date,shift='MORNING')=>{const start=`${date}T${shift==='MORNING'?'07':'19'}:30:00+05:30`,end=new Date(Date.parse(start)+12*3600000).toISOString();return {date,shift,start,end,absentStart:start,absentEnd:end};};
  s.roster.requests=[{id:'R1',employeeId:'E1',dates:['2026-10-30'],kind:'INFORMED_ABSENCE',status:'APPROVED',intervals:[interval('2026-10-30')],createdAt:now.toISOString()},
    {id:'R2',employeeId:'E2',dates:['2026-11-02'],kind:'INFORMED_ABSENCE',status:'APPROVED',intervals:[interval('2026-11-02','NIGHT')],createdAt:now.toISOString()}];
  s.replacements=[{id:'P1',absentEmployeeId:'E1',date:'2026-10-30',platformCode:'P1',dept:'DP',shift:'MORNING',status:'PENDING',shiftStart:interval('2026-10-30').start,shiftEnd:interval('2026-10-30').end},
    {id:'P2',absentEmployeeId:'E1',date:'2026-11-01',platformCode:'P1',dept:'DP',shift:'MORNING',status:'ASSIGNED',freelancerId:'F1',shiftStart:interval('2026-11-01').start,shiftEnd:interval('2026-11-01').end},
    {id:'P3',absentEmployeeId:'E2',date:'2026-11-02',platformCode:'P1',dept:'DP',shift:'NIGHT',status:'ASSIGNED',freelancerId:'F1',shiftStart:interval('2026-11-02','NIGHT').start,shiftEnd:new Date(Date.parse(interval('2026-11-02','NIGHT').start)+6*3600000).toISOString()}];
  const d=run(s);assert.equal(d.nextWeek.from,'2026-10-30');assert.equal(d.nextWeek.to,'2026-11-05');
  assert.equal(d.nextWeek.platforms.length,1);assert.equal(d.nextWeek.platforms[0].slots,2);assert.equal(d.nextWeek.platforms[0].hours,18);
  assert.equal(d.nextWeek.trend.reduce((n,p)=>n+p.count,0),2);
});
