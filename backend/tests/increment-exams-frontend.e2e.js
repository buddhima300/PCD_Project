// Real supervisor/employee sessions and SQL persistence, using isolated fixtures only.
import { readFile,readdir,mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { chromium,expect } from '@playwright/test';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { hashPassword } from '../src/shared/security.js';
import { importOperations } from '../scripts/import-operations.js';
import { loadState,saveState } from '../src/modules/operations/store.js';
import { businessDate } from '../src/modules/operations/roster.js';
import { addDays } from '../src/modules/operations/attendance-schedule.js';

const engine=new PGlite();let server,vite,browser,tail=Promise.resolve();
const db={query:(sql,args)=>engine.query(sql,args),connect:async()=>{const before=tail;let release;tail=new Promise(r=>{release=r;});await before;return {query:(sql,args)=>engine.query(sql,args),release};}};
const origin='http://localhost:5197',password='Increment-browser-password-42',today=businessDate(),examDate=addDays(today,7);
const output=new URL('../../test-results/increment-exams/',import.meta.url);
try {
  for(const f of (await readdir(new URL('../migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await engine.exec(await readFile(new URL(`../migrations/${f}`,import.meta.url),'utf8'));
  const users=[],hash=await hashPassword(password);
  for(const role of ['SUPERVISOR','EMPLOYEE']){const u={id:randomUUID(),name:`Exam ${role}`,email:`exam-${role.toLowerCase()}@example.test`,role};users.push(u);await db.query('INSERT INTO users(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5)',[u.id,u.name,u.email,u.role,hash]);}
  await db.query("INSERT INTO user_permissions(user_id,permission) VALUES($1,'attendance.correct')",[users[0].id]);
  await importOperations(db,{backup:false,nodeEnv:'test'});
  const state=await loadState(db),before=structuredClone(state);
  const workerId=(await db.query('SELECT worker_id FROM operational_accounts WHERE user_id=$1',[users[1].id])).rows[0].worker_id;
  Object.assign(state.employees.find(e=>e.id===workerId),{name:'Increment Test Employee',joinedAt:addDays(today,-120),status:'ACTIVE',accountStatus:'ACTIVE'});
  await saveState(db,state,before);
  server=createApp(db,readConfig({NODE_ENV:'test',DATABASE_URL:'postgresql://unused',FRONTEND_ORIGIN:origin})).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  vite=spawn(process.execPath,[fileURLToPath(new URL('../../node_modules/vite/bin/vite.js',import.meta.url)),'--host','127.0.0.1','--port','5197','--strictPort'],{cwd:fileURLToPath(new URL('../../',import.meta.url)),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PCD_API_TARGET:`http://127.0.0.1:${server.address().port}`,VITE_API_BASE_URL:'/api/v1',VITE_BREAK_ENABLED:'false',VITE_BREAK_ADAPTER:'real'}});
  let logs='';vite.stdout.on('data',d=>logs+=d);vite.stderr.on('data',d=>logs+=d);
  for(let i=0;;i++){try{if((await fetch(origin)).ok)break;}catch{}if(i>200||vite.exitCode!==null)throw new Error(logs);await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:process.env.PCD_TEST_BROWSER??'chrome',headless:true});
  const pages=[],errors=[];
  for(const user of users){const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));await page.goto(`${origin}/login`);await page.getByLabel('Work email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Login',exact:true}).click();await expect(page.locator('#main h1').first()).toBeVisible({timeout:20000});}
  const [supervisor,employee]=pages,panel=supervisor.getByRole('region',{name:'Increment exam eligibility'});
  await panel.getByLabel('Increment eligibility filter').selectOption('ALL');await panel.getByLabel('Search increment employees').fill('Increment Test Employee');
  try{await expect(panel.getByRole('button',{name:'Verify historical days'})).toBeVisible({timeout:15000});}catch(e){console.log('ELIGIBILITY PANEL',await panel.innerText());throw e;}await panel.getByRole('button',{name:'Verify historical days'}).click();
  let dialog=supervisor.getByRole('dialog');await dialog.getByLabel('Verified through roster date').fill(addDays(today,-2));await dialog.getByLabel('Verified qualifying days',{exact:true}).fill('90');await dialog.getByLabel('Verification evidence and reason').fill('Historical signed attendance ledger checked against leave and approved off-days.');await dialog.getByRole('button',{name:'Save verified balance'}).click();await expect(dialog).toHaveCount(0);
  await employee.goto(`${origin}/notifications`);await employee.getByLabel('Type',{exact:true}).selectOption('INCREMENT_EXAM');
  await panel.getByRole('button',{name:'Appoint physical exam'}).click();dialog=supervisor.getByRole('dialog');await dialog.getByLabel('Physical exam date and time').fill(`${examDate}T10:00`);await dialog.getByLabel('Exam location',{exact:true}).fill('Colombo head office, Exam Room 2');await dialog.getByLabel('Exam details and instructions').fill('Bring employee ID and report to the physical exam coordinator.');await dialog.getByRole('button',{name:'Save exam appointment'}).click();await expect(dialog).toHaveCount(0);
  await expect(employee.getByRole('button',{name:/Your increment exam is appointed/})).toBeVisible({timeout:8000});
  await employee.goto(`${origin}/profile#increment-exam`);await expect(employee.getByRole('progressbar',{name:'Increment exam qualifying days'})).toHaveAttribute('aria-valuenow','90');await expect(employee.getByText('Colombo head office, Exam Room 2',{exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Reschedule exam'}).click();dialog=supervisor.getByRole('dialog');await dialog.getByLabel('Physical exam date and time').fill(`${addDays(examDate,1)}T11:00`);await dialog.getByRole('button',{name:'Save exam appointment'}).click();await expect(dialog).toHaveCount(0);
  await employee.goto(`${origin}/notifications`);await expect(employee.getByRole('button',{name:/Increment exam rescheduled/})).toBeVisible();
  await supervisor.reload();await expect(supervisor.getByRole('region',{name:'Increment exam eligibility'}).getByText('Colombo head office, Exam Room 2',{exact:true})).toBeVisible();
  await mkdir(output,{recursive:true});await supervisor.getByRole('region',{name:'Increment exam eligibility'}).screenshot({path:fileURLToPath(new URL('supervisor-panel.png',output))});
  await supervisor.setViewportSize({width:375,height:1000});await expect(supervisor.getByRole('button',{name:'Reschedule exam'})).toBeVisible();expect(await supervisor.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await employee.setViewportSize({width:375,height:1000});await employee.goto(`${origin}/profile#increment-exam`);await expect(employee.getByText('Colombo head office, Exam Room 2',{exact:true})).toBeVisible();expect(await employee.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await employee.locator('#increment-exam').screenshot({path:fileURLToPath(new URL('employee-progress.png',output))});
  const me=await (await employee.request.get(`${origin}/api/v1/auth/me`)).json();const denied=await employee.request.post(`${origin}/api/v1/operations/workflows/listIncrementEligibility`,{headers:{Origin:origin,'X-CSRF-Token':me.csrfToken},data:{args:[{}]}});expect(denied.status()).toBe(403);
  expect((await db.query('SELECT count(*)::int AS n FROM increment_exam_appointments')).rows[0].n).toBe(1);
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Increment browser checks passed: verified eligibility, physical exam appointment/reschedule, employee notification within 8s, profile progress, persistence, authorization and mobile layout.');
}finally{if(browser)await browser.close();if(vite){vite.kill();await new Promise(r=>{if(vite.exitCode!==null)r();else vite.once('exit',r);});}if(server)await new Promise(r=>server.close(r));await engine.close();}
