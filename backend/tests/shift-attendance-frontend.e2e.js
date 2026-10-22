// Real browser, authenticated HTTP operations and isolated PostgreSQL; no developer data.
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
const engine=new PGlite();let server,vite,browser,tail=Promise.resolve();
const db={query:(sql,args)=>engine.query(sql,args),connect:async()=>{const prior=tail;let release;tail=new Promise(r=>{release=r;});await prior;return {query:(sql,args)=>engine.query(sql,args),release};}};
const origin='http://localhost:5193',password='Attendance-browser-password-42',output=new URL('../../test-results/shift-attendance/',import.meta.url);
try {
  for(const f of (await readdir(new URL('../migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await engine.exec(await readFile(new URL(`../migrations/${f}`,import.meta.url),'utf8'));
  const users=[],hash=await hashPassword(password);
  for(const role of ['SUPERVISOR','EMPLOYEE','FREELANCER']){const user={id:randomUUID(),name:`Attendance ${role}`,email:`attendance-${role.toLowerCase()}@example.test`,role};users.push(user);await db.query('INSERT INTO users(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5)',[user.id,user.name,user.email,role,hash]);}
  await db.query("INSERT INTO user_permissions(user_id,permission) VALUES($1,'attendance.correct')",[users[0].id]);
  await importOperations(db,{backup:false,nodeEnv:'test'});
  const state=await loadState(db),before=structuredClone(state),ids=[];
  const now=new Date(),today=businessDate(now),time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Colombo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
  const shift=time>='07:30'&&time<'19:30'?'MORNING':'NIGHT',rosterDate=time<'07:30'?new Date(Date.parse(`${today}T12:00:00Z`)-86400000).toISOString().slice(0,10):today;
  const platform=state.platforms.find(p=>p.status==='ACTIVE'&&p.departments.DP>0);for(const c of state.rotationCycles)if(c.status==='SCHEDULED')c.start='2100-01-01';
  for(const i of [1,2]){
    const id=(await db.query('SELECT worker_id FROM operational_accounts WHERE user_id=$1',[users[i].id])).rows[0].worker_id;ids.push(id);
    const person=[...state.employees,...state.freelancers].find(p=>p.id===id);
    Object.assign(person,{name:`Attendance ${i===1?'Employee':'Freelancer'}`,dept:'DP',status:'ACTIVE',accountStatus:'ACTIVE',qualifiedForProduction:true,lifecycle:'PRODUCTION_ACTIVE',shift,platformCode:platform.code,currentPlatform:platform.code,joinedAt:'2025-01-01'});
    for(const laptop of state.laptops.filter(l=>l.currentUserId===id))Object.assign(laptop,{currentUserId:null,currentUserName:null,currentShift:null,status:'AVAILABLE'});
    state.trainingAssignments=state.trainingAssignments.filter(t=>t.workerId!==id);state.offDays=state.offDays.filter(o=>o.employeeId!==id);state.profile.events=state.profile.events.filter(e=>e.workerId!==id);state.replacements=state.replacements.filter(r=>r.absentEmployeeId!==id&&r.freelancerId!==id);
  }
  const poolId=`POOL-${platform.code}-DP`;
  for(const n of [1,2])state.laptops.push({assetId:`ATT-L${n}`,serial:`ATT-S${n}`,model:'Attendance test laptop',poolId,platformCode:platform.code,dept:'DP',workstationId:`ATT-WS${n}`,status:'AVAILABLE',condition:'GOOD',currentUserId:null});
  await saveState(db,state,before);
  server=createApp(db,readConfig({NODE_ENV:'test',DATABASE_URL:'postgresql://unused',FRONTEND_ORIGIN:origin})).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  vite=spawn(process.execPath,[fileURLToPath(new URL('../../node_modules/vite/bin/vite.js',import.meta.url)),'--host','127.0.0.1','--port','5193','--strictPort'],{cwd:fileURLToPath(new URL('../../',import.meta.url)),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PCD_API_TARGET:`http://127.0.0.1:${server.address().port}`,VITE_API_BASE_URL:'/api/v1',VITE_BREAK_ENABLED:'true',VITE_BREAK_ADAPTER:'real'}});
  let logs='';vite.stdout.on('data',d=>logs+=d);vite.stderr.on('data',d=>logs+=d);
  for(let attempt=0;;attempt++){try{if((await fetch(origin)).ok)break;}catch{}if(attempt>200||vite.exitCode!==null)throw new Error(logs);await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:process.env.PCD_TEST_BROWSER??'chrome',headless:true});
  const pages=[],errors=[];
  for(const user of users){const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));await page.goto(`${origin}/login`);await page.getByLabel('Work email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Login',exact:true}).click();try{await expect(page.locator('#main h1').first()).toBeVisible({timeout:20000});}catch(e){console.log(user.role,page.url(),await page.locator('body').innerText(),errors);throw e;}}
  const [supervisor,employee,freelancer]=pages;
  await supervisor.goto(`${origin}/shifts?date=${rosterDate}`);await expect(supervisor.getByText('No submitted confirmations match',{exact:false})).toBeVisible();
  await employee.getByRole('button',{name:'Confirm handover & attendance',exact:true}).last().click();let dialog=employee.getByRole('dialog');
  await dialog.getByLabel('Search department laptops').fill('ATT-L1');await dialog.getByLabel('Available laptop',{exact:true}).selectOption('ATT-L1');await dialog.getByLabel('Special notes',{exact:true}).fill('Morning/night receipt verified through browser.');await dialog.getByLabel('I am present for this shift and have physically received the selected laptop.').check();await dialog.getByRole('button',{name:'Confirm my shift',exact:true}).click();
  await expect(dialog.getByText('Server receipt time',{exact:true})).toBeVisible({timeout:15000});await expect(dialog.getByText('Confirmed',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Close dialog'}).click();
  await expect(supervisor.getByRole('cell',{name:'Attendance Employee',exact:false})).toBeVisible({timeout:23000});
  await supervisor.goto(`${origin}/employees`);await supervisor.getByLabel('Attendance roster date').fill(rosterDate);await supervisor.getByPlaceholder('Search ID, name, email').fill('Attendance Employee');await expect(supervisor.getByText('Confirmed',{exact:true})).toBeVisible();await supervisor.getByLabel('Attendance filter').selectOption('NOT_SUBMITTED');await expect(supervisor.getByText('No employees match these filters')).toBeVisible();await supervisor.getByLabel('Attendance filter').selectOption('CONFIRMED');await expect(supervisor.getByText('Confirmed',{exact:true})).toBeVisible();
  await employee.getByRole('button',{name:'Return laptop',exact:true}).click();dialog=employee.getByRole('dialog');await dialog.getByLabel('I have physically returned this laptop.').check();await dialog.getByRole('button',{name:'Confirm return',exact:true}).click();await expect(dialog).toHaveCount(0);
  await freelancer.getByRole('button',{name:'Confirm handover & attendance',exact:true}).last().click();dialog=freelancer.getByRole('dialog');await dialog.getByLabel('I cannot receive a usable laptop',{exact:false}).check();await dialog.getByLabel('Why laptop receipt cannot be confirmed').fill('No suitable laptop available at arrival.');await dialog.getByLabel('I am present for this shift and the exception details are accurate.').check();await dialog.getByRole('button',{name:'Confirm my shift',exact:true}).click();await expect(dialog.getByText('Needs review',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Close dialog'}).click();
  await supervisor.goto(`${origin}/freelancers`);await supervisor.getByLabel('Attendance roster date').fill(rosterDate);await supervisor.getByPlaceholder('Search ID or name').fill('Attendance Freelancer');await expect(supervisor.getByRole('table').getByText('Needs review',{exact:true})).toBeVisible();await supervisor.getByRole('link',{name:/No laptop/}).click();dialog=supervisor.getByRole('dialog');await dialog.getByLabel('Review / correction reason').fill('Presence verified in department.');await dialog.getByRole('button',{name:'Confirm after review'}).click();await expect(dialog.getByText('Confirmed',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Close dialog'}).click();
  await employee.reload();await expect(employee.getByRole('button',{name:'View confirmation'}).first()).toBeVisible();
  await mkdir(output,{recursive:true});await supervisor.screenshot({path:fileURLToPath(new URL('supervisor-register.png',output)),fullPage:true});
  await employee.setViewportSize({width:375,height:1000});await employee.getByRole('button',{name:'View confirmation'}).first().click();await expect(employee.getByRole('dialog')).toBeVisible();expect(await employee.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);await employee.screenshot({path:fileURLToPath(new URL('employee-mobile.png',output)),fullPage:true});
  const rows=(await db.query('SELECT status FROM attendance_confirmations')).rows;expect(rows).toHaveLength(2);expect(rows.every(r=>r.status==='CONFIRMED')).toBe(true);
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Attendance browser checks passed: dashboard receipt, physical return, both directory projections/filters, supervisor exception review, cross-session polling, reload persistence and mobile layout.');
}finally{if(browser)await browser.close();if(vite){vite.kill();await new Promise(r=>{if(vite.exitCode!==null)r();else vite.once('exit',r);});}if(server)await new Promise(r=>server.close(r));await engine.close();}



