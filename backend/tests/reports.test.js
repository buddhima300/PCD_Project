import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { databaseReport } from '../src/modules/operations/reports.js';
import { executeOperation } from '../src/modules/operations/service.js';
import { importOperations } from '../scripts/import-operations.js';
import { loadState, saveState } from '../src/modules/operations/store.js';

const admin={user:{role:'SUPERVISOR'},permissions:['reports.export']};
function fixture(){return {
  categories:[{code:'CAT',name:'Category',status:'ACTIVE'}],
  platforms:[{code:'P1',name:'Platform one',categoryCode:'CAT',departments:{DP:3},status:'ACTIVE',lifecycle:'OPERATIONAL'}],
  employees:[{id:'EMP-1',name:'Alice',email:'alice@example.test',dept:'DP',platformCode:'P1',categoryCode:'CAT',shift:'MORNING',status:'ACTIVE',offDaysAllowance:4}],
  freelancers:[],trainingAssignments:[],offDays:[],incidents:[],laptops:[{assetId:'A1',platformCode:'P1',dept:'DP',status:'AVAILABLE',condition:'GOOD'}],
  replacements:[{id:'R1',date:'2026-10-01',platformCode:'P1',dept:'DP',shift:'MORNING',absentEmployeeId:'EMP-1',status:'PENDING'}],
  breaks:{sessions:[0,1].map((n)=>({id:`S${n}`,workerId:'EMP-1',workerName:'Alice',workerType:'EMPLOYEE',platform:'P1',department:'DP',shift:'MORNING',shiftDate:'2026-10-01',shiftStart:'2026-10-01T02:30:00Z',shiftEnd:'2026-10-01T14:30:00Z',startedAt:`2026-10-01T0${3+n}:00:00Z`,endedAt:`2026-10-01T0${3+n}:40:00Z`,status:'ENDED',overrun:false})),policies:[{effectiveAt:'2026-01-01T00:00:00Z',allowanceMinutes:60}],requests:[]},
};}
test('report scopes, totals, employee details and cumulative break excess',async()=>{
  const state=fixture(),report=(key,f={})=>databaseReport(null,admin,state,key,f);
  const v=await report('platform-vacancies',{shift:'MORNING'});assert.equal(v.rows.length,1);assert.equal(v.rows[0][9],2);
  assert.equal((await report('platform-vacancies',{search:'missing'})).rows.length,0);
  assert.equal((await report('employee-directory')).rows[0][0],'EMP-1');
  assert.equal((await report('employee-directory',{platform:'missing'})).rows.length,0);
  assert.ok((await report('employee-detail',{employeeId:'EMP-1'})).rows.some(r=>r[0]==='Email'&&r[1]==='alice@example.test'));
  await assert.rejects(report('employee-detail'),e=>e.code==='VALIDATION');
  await assert.rejects(report('employee-detail',{employeeId:'missing'}),e=>e.code==='NOT_FOUND');
  const over=await report('break-exceeded',{month:'2026-10'});assert.equal(over.rows.length,1);assert.equal(over.rows[0][6],'80.00');assert.equal(over.rows[0][8],'20.00');
  assert.equal((await report('break-history',{employeeId:'EMP-1',month:'2026-09'})).rows.length,0);
  assert.equal((await report('break-history',{overrun:'yes'})).rows.length,2);
  assert.equal((await report('break-history',{overrun:'no'})).rows.length,0);
  state.breaks.requests.push({workerId:'EMP-1',shiftDate:'2026-10-01',context:{shift:'MORNING'},status:'Approved',approvedMinutes:30});
  assert.equal((await report('break-exceeded')).rows.length,0);
  assert.equal((await report('replacement-summary',{from:'2026-10-02'})).rows.length,0);
  assert.equal((await report('equipment-inventory')).sections[0].rows[0][4],1);
  await assert.rejects(report('employee-directory',{from:'2026-10-03',to:'2026-10-01'}),e=>e.code==='VALIDATION');
  await assert.rejects(report('employee-directory',{from:'2026-02-30'}),e=>e.code==='VALIDATION');
  await assert.rejects(databaseReport(null,{user:{role:'EMPLOYEE'},permissions:[]},state,'employee-directory'),e=>e.status===403);
  await assert.rejects(databaseReport(null,{...admin,permissions:[]},state,'break-summary'),e=>e.status===403);
});

test('report operation reads saved database records and complete results, including attendance schema',async()=>{
  const engine=new PGlite();const db={query:(s,p)=>engine.query(s,p),connect:async()=>({query:(s,p)=>engine.query(s,p),release(){}})};
  try{
    for(const f of ['001_foundation.sql','002_operations.sql','003_workflow_records.sql','004_equipment_allocations.sql','005_login_access_controls.sql','006_retire_pending_handovers.sql','007_staff_number_counters.sql','008_roster_management.sql','009_attendance_confirmations.sql'])await engine.exec(await readFile(new URL(`../migrations/${f}`,import.meta.url),'utf8'));
    const user={id:randomUUID(),role:'SUPERVISOR',name:'Report supervisor',email:'reports@example.test'};
    await db.query('INSERT INTO users(id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5)',[user.id,user.email,user.name,user.role,'unused']);
    await importOperations(db,{backup:false,nodeEnv:'test'});
    const state=await loadState(db),previous=structuredClone(state);state.employees[0].name='Database report employee';await saveState(db,state,previous);
    const auth={user,permissions:['reports.export']};const call=(key,f={})=>executeOperation(db,auth,'workflows','getReport',[key,f]);
    const directory=await call('employee-directory');assert.equal(directory.rows.length,state.employees.length);assert.ok(directory.rows.some(r=>r[1]==='Database report employee'));
    for(const key of ['platform-vacancies','platform-categories','platform-configuration','platform-operations','equipment-inventory','replacement-summary','break-summary','break-history','break-exceeded','attendance-confirmations']){
      const result=await call(key);assert.ok(Array.isArray(result.rows),key);assert.ok(result.columns.length>0,key);assert.ok(result.generatedAt.endsWith('Z'),key);
    }
    const workerId=randomUUID(),occurrence=randomUUID(),confirmation=randomUUID(),employee=state.employees[0];
    await db.query('INSERT INTO workers(id,worker_number,name,email,worker_type,department_code,joined_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[workerId,'REPORT-ATTENDANCE','Report worker','attendance@example.test','EMPLOYEE','DP','2026-01-01']);
    await db.query(`INSERT INTO work_occurrences(id,worker_id,operational_worker_id,worker_name,worker_type,platform_code,department,roster_date,shift,scheduled_start,scheduled_end,effective_start,effective_end,source_key,source_version)
      VALUES($1,$2,'REPORT-ATTENDANCE','Report worker','EMPLOYEE',$3,'DP','2026-10-01','NIGHT','2026-10-01T14:00:00Z','2026-10-02T02:00:00Z','2026-10-01T14:00:00Z','2026-10-02T02:00:00Z','report-test','1')`,[occurrence,workerId,employee.platformCode]);
    await db.query(`INSERT INTO attendance_confirmations(id,occurrence_id,actor_user_id,accepted_at,device_timestamp,status,punctuality,verification,original_evidence)
      VALUES($1,$2,$3,'2026-10-01T14:00:00Z','2026-10-01T14:00:00Z','CONFIRMED','ON_TIME','SELF_DECLARED','{}')`,[confirmation,occurrence,user.id]);
    const attendance=await call('attendance-confirmations',{from:'2026-10-01',to:'2026-10-01',shift:'NIGHT',department:'DP',status:'CONFIRMED',search:'Report worker'});
    assert.equal(attendance.rows.length,1);assert.equal(attendance.rows[0][0],'REPORT-ATTENDANCE');assert.equal(attendance.rows[0][3],'2026-10-01');
    assert.equal((await call('attendance-confirmations',{from:'2026-10-02'})).rows.length,0);
    assert.equal((await call('attendance-confirmations',{workerType:'FREELANCER'})).rows.length,0);
    const worker={...auth,user:{...user,role:'EMPLOYEE'}};await assert.rejects(executeOperation(db,worker,'workflows','getReport',['employee-directory',{}]),e=>e.status===403);
  }finally{await engine.close();}
});
