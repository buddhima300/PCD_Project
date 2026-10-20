// Real UI + cookie/CSRF authentication + isolated PostgreSQL, without touching developer data.
import { readFile,mkdir } from 'node:fs/promises';
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

const engine=new PGlite();let server,vite,browser;let tail=Promise.resolve();
const db={query:(sql,args)=>engine.query(sql,args),connect:async()=>{const prior=tail;let release;tail=new Promise(r=>{release=r;});await prior;return {query:(sql,args)=>engine.query(sql,args),release};}};
const origin='http://localhost:5191',password='Roster-browser-password-42';
const date=new Date(`${businessDate().slice(0,7)}-01T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()+1);
const month=date.toISOString().slice(0,7),offDate=`${month}-10`,leaveDate=`${month}-11`,annualDate=`${month}-14`;
const output=new URL('../../test-results/roster/',import.meta.url);
try{
  for(const f of ['001_foundation.sql','002_operations.sql','003_workflow_records.sql','004_equipment_allocations.sql','005_login_access_controls.sql','007_staff_number_counters.sql','008_roster_management.sql'])await engine.exec(await readFile(new URL(`../migrations/${f}`,import.meta.url),'utf8'));
  const hash=await hashPassword(password),users=[];
  for(const role of ['SUPERVISOR','EMPLOYEE','FREELANCER']){const user={id:randomUUID(),name:`Roster ${role}`,email:`roster-${role.toLowerCase()}@example.test`,role};users.push(user);await db.query('INSERT INTO users(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5)',[user.id,user.name,user.email,role,hash]);}
  await importOperations(db,{backup:false,nodeEnv:'test'});const state=await loadState(db),previous=structuredClone(state);
  const employeeId=(await db.query('SELECT worker_id FROM operational_accounts WHERE user_id=$1',[users[1].id])).rows[0].worker_id;
  const employee=state.employees.find(e=>e.id===employeeId);Object.assign(employee,{name:'Kasun Perera',status:'ACTIVE',accountStatus:'ACTIVE',qualifiedForProduction:true});
  state.offDays=state.offDays.filter(o=>o.employeeId!==employeeId);state.profile.events=state.profile.events.filter(e=>e.workerId!==employeeId);await saveState(db,state,previous);
  server=createApp(db,readConfig({NODE_ENV:'test',DATABASE_URL:'postgresql://unused',FRONTEND_ORIGIN:origin})).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  vite=spawn(process.execPath,[fileURLToPath(new URL('../../node_modules/vite/bin/vite.js',import.meta.url)),'--host','127.0.0.1','--port','5191','--strictPort'],{cwd:fileURLToPath(new URL('../../',import.meta.url)),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PCD_API_TARGET:`http://127.0.0.1:${server.address().port}`,VITE_API_BASE_URL:'/api/v1',VITE_BREAK_ENABLED:'true',VITE_BREAK_ADAPTER:'real'}});
  let logs='';vite.stdout.on('data',d=>{logs+=d;});vite.stderr.on('data',d=>{logs+=d;});
  for(let attempt=0;;attempt++){try{if((await fetch(origin)).ok)break;}catch{}if(attempt>200||vite.exitCode!==null)throw new Error(logs);await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:process.env.PCD_TEST_BROWSER??'chrome',headless:true});
  const errors=[],pages=[];
  for(const user of users){const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));pages.push(page);await page.goto(`${origin}/login`);await page.getByLabel('Work email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Login',exact:true}).click();await expect(page.locator('#main h1').first()).toBeVisible({timeout:20000});}
  const [supervisor,staff,freelancer]=pages;
  await supervisor.goto(`${origin}/roster?month=${month}&view=requests&platform=${employee.platformCode}&dept=${employee.dept}`);
  await expect(supervisor.getByRole('heading',{name:/Team roster/})).toBeVisible();
  await staff.goto(`${origin}/my/schedule?month=${month}`);await expect(staff.getByText('Start with a little time for yourself')).toBeVisible();
  await staff.getByRole('button',{name:'New request',exact:true}).click();let dialog=staff.getByRole('dialog');
  await dialog.getByLabel('Date',{exact:true}).fill(offDate);await dialog.getByRole('button',{name:'Request off-day',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(staff.getByText('1 approved · 3 unused', {exact:false})).toBeVisible();
  await staff.getByRole('button',{name:'Finish planning',exact:true}).click();await expect(staff.getByText('Your off-day plan is ready')).toBeVisible();
  await staff.getByRole('button',{name:'New request',exact:true}).click();dialog=staff.getByRole('dialog');await dialog.getByLabel('Request type',{exact:true}).selectOption('HALF_DAY');await dialog.getByLabel('Date',{exact:true}).fill(leaveDate);await dialog.getByLabel('Reason',{exact:true}).fill('Family appointment after the first half of my shift.');await dialog.getByRole('button',{name:'Send request',exact:true}).click();await expect(dialog).toHaveCount(0);
  // The other session receives this request by polling, without a page reload.
  await expect(supervisor.locator('.roster-request-row').filter({hasText:'Family appointment'})).toBeVisible({timeout:22000});
  const row=supervisor.locator('.roster-request-row').filter({hasText:'Family appointment'});await row.getByRole('button',{name:'Review',exact:true}).click();dialog=supervisor.getByRole('dialog');await dialog.getByLabel('Decision reason').fill('Coverage checked and approved.');await dialog.getByRole('button',{name:'Approve request',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(row.getByText('Approved',{exact:true})).toBeVisible();
  await staff.getByRole('button',{name:'My requests',exact:false}).click();await expect(staff.locator('.roster-request-row').filter({hasText:'Family appointment'}).getByText('Approved',{exact:true})).toBeVisible({timeout:22000});
  // Annual requests remain pending until a real entitlement is configured.
  await staff.getByRole('button',{name:'New request',exact:true}).click();dialog=staff.getByRole('dialog');await dialog.getByLabel('Request type',{exact:true}).selectOption('ANNUAL_LEAVE');await dialog.getByLabel('From',{exact:true}).fill(annualDate);await dialog.getByLabel('Through',{exact:true}).fill(annualDate);await dialog.getByLabel('Reason',{exact:true}).fill('Planned annual time with family.');await dialog.getByRole('button',{name:'Send request',exact:true}).click();await expect(dialog).toHaveCount(0);
  await supervisor.getByRole('button',{name:'Refresh roster',exact:true}).click();const annual=supervisor.locator('.roster-request-row').filter({hasText:'Planned annual'});await expect(annual).toBeVisible();await annual.getByRole('button',{name:'Review',exact:true}).click();dialog=supervisor.getByRole('dialog');await dialog.getByLabel('Decision reason').fill('Annual leave reviewed.');await dialog.getByRole('button',{name:'Approve request',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('configure');await dialog.getByRole('button',{name:'Close',exact:true}).click();
  await supervisor.getByRole('button',{name:'Leave entitlements',exact:true}).click();dialog=supervisor.getByRole('dialog');await dialog.getByLabel('Employee',{exact:true}).selectOption(users[1].id);await dialog.getByLabel('Annual leave days',{exact:true}).fill('14');await dialog.getByLabel('Medical leave days',{exact:true}).fill('7');await dialog.getByLabel('Reason for this allocation').fill('Verified employee entitlement for this year.');await dialog.getByRole('button',{name:'Save entitlements',exact:true}).click();await expect(dialog).toHaveCount(0);
  await annual.getByRole('button',{name:'Review',exact:true}).click();dialog=supervisor.getByRole('dialog');await dialog.getByLabel('Decision reason').fill('Verified annual entitlement.');await dialog.getByRole('button',{name:'Approve request',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(annual.getByText('Approved',{exact:true})).toBeVisible();
  const staffAnnual=staff.locator('.roster-request-row').filter({hasText:'Planned annual'});await expect(staffAnnual.getByText('Approved',{exact:true})).toBeVisible({timeout:22000});await staffAnnual.getByRole('button',{name:'Change dates',exact:true}).click();dialog=staff.getByRole('dialog');await expect(dialog).toContainText('original leave remains approved');await dialog.getByLabel('From',{exact:true}).fill(`${month}-15`);await dialog.getByLabel('Through',{exact:true}).fill(`${month}-15`);await dialog.getByLabel('Reason',{exact:true}).fill('Changed annual leave request.');await dialog.getByRole('button',{name:'Send request',exact:true}).click();await expect(dialog).toHaveCount(0);
  await supervisor.getByRole('button',{name:'Refresh roster',exact:true}).click();const amendment=supervisor.locator('.roster-request-row').filter({hasText:'Changed annual leave'});await expect(amendment).toBeVisible();await amendment.getByRole('button',{name:'Review',exact:true}).click();dialog=supervisor.getByRole('dialog');await dialog.getByLabel('Decision reason').fill('Changed dates and coverage reviewed.');await dialog.getByRole('button',{name:'Approve request',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(annual.getByText('Superseded',{exact:true})).toBeVisible();
  await supervisor.getByRole('button',{name:'Timeline',exact:true}).click();await expect(supervisor.locator('.roster-band').first()).toBeVisible();await supervisor.locator('.roster-timeline-heading').getByRole('button').filter({hasText:'11'}).click();dialog=supervisor.getByRole('dialog');await expect(dialog).toContainText('6 hours need coverage');await dialog.getByRole('button',{name:'Find replacement',exact:true}).click();await expect(supervisor).toHaveURL(/\/replacements\/REP-/);
  await supervisor.goto(`${origin}/roster?month=${month}&platform=${employee.platformCode}&dept=${employee.dept}`);await expect(supervisor.locator('.roster-band').first()).toBeVisible();await mkdir(output,{recursive:true});await supervisor.screenshot({path:fileURLToPath(new URL('supervisor-timeline.png',output)),fullPage:true});
  for(const width of [768,375]){await supervisor.setViewportSize({width,height:1000});await supervisor.getByRole('button',{name:'Calendar',exact:true}).click();await expect(supervisor.locator('.roster-calendar')).toBeVisible();const overflow=await supervisor.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);expect(overflow).toBe(false);}
  await staff.setViewportSize({width:375,height:1000});await staff.getByRole('button',{name:'My calendar',exact:true}).click();await staff.screenshot({path:fileURLToPath(new URL('employee-mobile.png',output)),fullPage:true});expect(await staff.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);
  await staff.getByRole('button',{name:'Agenda',exact:true}).click();await expect(staff.getByRole('button',{name:/11, Half-day/})).toBeVisible();await staff.screenshot({path:fileURLToPath(new URL('employee-mobile-agenda.png',output)),fullPage:true});
  await staff.reload();await staff.getByRole('button',{name:'My requests',exact:false}).click();await expect(staff.locator('.roster-request-row').filter({hasText:'Changed annual leave'}).getByText('Approved',{exact:true})).toBeVisible();
  await freelancer.goto(`${origin}/my/availability?month=${month}`);await expect(freelancer.getByRole('heading',{name:'My availability',exact:true})).toBeVisible();
  // API remains protected even if UI controls are bypassed.
  const csrf=(await (await staff.request.get(`${origin}/api/v1/auth/me`)).json()).csrfToken;
  const unauthorized=await staff.request.post(`${origin}/api/v1/operations/workflows/setLeaveEntitlement`,{headers:{Origin:origin,'X-CSRF-Token':csrf},data:{args:[{employeeId:users[1].id,year:Number(month.slice(0,4)),annual:100,medical:100,reason:'Unauthorized override',expectedVersion:1}]}});expect(unauthorized.status()).toBe(403);
  const noCsrf=await staff.request.post(`${origin}/api/v1/operations/workflows/completeOffDayPlan`,{headers:{Origin:origin},data:{args:[month]}});expect(noCsrf.status()).toBe(403);
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Roster browser checks passed: employee off-day planning and submission, cross-session review, entitlement configuration, partial coverage, persistence, authorization/CSRF, and responsive layouts.');
  console.log(`Screenshots: ${fileURLToPath(output)}`);
}finally{
  if(browser)await browser.close();if(vite){vite.kill();await new Promise(r=>{if(vite.exitCode!==null)r();else vite.once('exit',r);});}if(server)await new Promise(r=>server.close(r));await engine.close();
}
