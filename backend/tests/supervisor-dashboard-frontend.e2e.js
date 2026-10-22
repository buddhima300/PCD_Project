// Authenticated dashboard against isolated PostgreSQL; weather alone is stubbed.
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
import { shiftContext } from '../src/modules/operations/equipment.js';
import { businessDate } from '../src/modules/operations/roster.js';
import { addDays } from '../src/modules/operations/attendance-schedule.js';
const engine=new PGlite();let server,vite,browser,tail=Promise.resolve();
const db={query:(sql,args)=>engine.query(sql,args),connect:async()=>{const prior=tail;let release;tail=new Promise(r=>{release=r;});await prior;return {query:(sql,args)=>engine.query(sql,args),release};}};
const origin='http://localhost:5197',password='Dashboard-browser-password-42';
try{
  for(const f of (await readdir(new URL('../migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await engine.exec(await readFile(new URL(`../migrations/${f}`,import.meta.url),'utf8'));
  await db.query('INSERT INTO users(id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5)',[randomUUID(),'dashboard-supervisor@example.test','Dashboard Supervisor','SUPERVISOR',await hashPassword(password)]);
  await importOperations(db,{backup:false,nodeEnv:'test'});
  const state=await loadState(db),before=structuredClone(state),now=new Date(),current=shiftContext(now);
  const start=new Date(`${current.date}T${current.shift==='MORNING'?'07':'19'}:30:00+05:30`),end=new Date(start.getTime()+12*3600000);
  const session={...state.breaks.sessions[0],id:'BR-DASHBOARD-ACTIVE',shift:current.shift,shiftDate:current.date,shiftStart:start.toISOString(),shiftEnd:end.toISOString(),startedAt:new Date(Math.max(start.getTime(),now.getTime()-300000)).toISOString(),endedAt:null,status:'ACTIVE',overrun:false,review:null};
  state.breaks.sessions=[session];state.breaks.requests=[];
  const today=businessDate(now),absent=state.employees.find(e=>e.platformCode===session.platform&&e.status==='ACTIVE'),off=state.employees.find(e=>e.id!==absent.id&&e.platformCode&&e.status==='ACTIVE');
  state.profile.events=state.profile.events.filter(e=>e.workerId!==absent.id||e.date!==addDays(today,-1));
  state.profile.events.push({workerId:absent.id,date:addDays(today,-1),kind:'UNINFORMED_ABSENCE',note:'Dashboard browser fixture',actor:'Supervisor',recordedAt:now.toISOString()});
  state.offDays.push({id:'OFF-DASHBOARD-TODAY',employeeId:off.id,employeeName:off.name,platformCode:off.platformCode,dept:off.dept,shift:off.shift,date:today,status:'APPROVED',reason:'Dashboard browser fixture',createdAt:now.toISOString()});
  const date=addDays(today,1),shiftStart=`${date}T${absent.shift==='MORNING'?'07':'19'}:30:00+05:30`;
  state.replacements.push({...state.replacements[0],id:'REP-DASHBOARD-UPCOMING',absentEmployeeId:absent.id,absentEmployeeName:absent.name,platformCode:absent.platformCode,dept:absent.dept,date,shift:absent.shift,shiftStart,shiftEnd:new Date(Date.parse(shiftStart)+12*3600000).toISOString(),status:'PENDING',freelancerId:null,freelancerName:null});
  await saveState(db,state,before);
  server=createApp(db,readConfig({NODE_ENV:'test',DATABASE_URL:'postgresql://unused',FRONTEND_ORIGIN:origin})).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  vite=spawn(process.execPath,[fileURLToPath(new URL('../../node_modules/vite/bin/vite.js',import.meta.url)),'--host','127.0.0.1','--port','5197','--strictPort'],{cwd:fileURLToPath(new URL('../../',import.meta.url)),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PCD_API_TARGET:`http://127.0.0.1:${server.address().port}`,VITE_API_BASE_URL:'/api/v1',VITE_BREAK_ENABLED:'true',VITE_BREAK_ADAPTER:'real'}});
  let logs='';vite.stdout.on('data',d=>logs+=d);vite.stderr.on('data',d=>logs+=d);
  for(let attempt=0;;attempt++){try{if((await fetch(origin)).ok)break;}catch{}if(attempt>200||vite.exitCode!==null)throw new Error(logs);await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:process.env.PCD_TEST_BROWSER??'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://api.open-meteo.com/**',route=>route.fulfill({json:{current:{temperature_2m:29,relative_humidity_2m:72,weather_code:2,wind_speed_10m:10,time:'2026-10-22T14:00'}}}));
  await page.goto(`${origin}/login`);await page.getByLabel('Work email',{exact:true}).fill('dashboard-supervisor@example.test');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Login',exact:true}).click();
  await expect(page.getByRole('heading',{name:/Good (morning|afternoon|evening), Dashboard Supervisor/})).toBeVisible({timeout:20000});
  await expect(page.getByText('Partly cloudy')).toBeVisible();
  await expect(page.getByRole('progressbar',{name:'On break',exact:true})).toHaveAttribute('aria-valuenow','1');
  await expect(page.getByText(session.workerName,{exact:true})).toBeVisible();
  await expect(page.getByRole('progressbar',{name:`${current.shift} Scheduled workforce`})).toBeVisible();
  await expect(page.getByRole('progressbar',{name:`${current.shift} employee attendance`})).toBeVisible();
  await expect(page.getByRole('table',{name:'Employees with recorded absences'}).getByText(absent.name,{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Employees off today'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Platforms needing replacements'})).toBeVisible();
  await expect(page.getByRole('img',{name:'Daily recorded absence trend'})).toBeVisible();
  await expect(page.getByRole('img',{name:'Absence days per employee distribution'})).toBeVisible();
  const table=page.getByRole('table',{name:'Platform operations'});await expect(table.getByRole('columnheader',{name:'Status',exact:true})).toHaveCount(0);
  await mkdir(new URL('../../test-results/dashboard/',import.meta.url),{recursive:true});
  await page.screenshot({path:fileURLToPath(new URL('../../test-results/dashboard/desktop.png',import.meta.url)),fullPage:true});
  for(const width of [768,375]){
    await page.setViewportSize({width,height:1000});
    const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll("#main *")].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).position!=="absolute").slice(0,8).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,65)}))}));if(bounds.scroll>bounds.width)console.log(JSON.stringify(bounds));expect(bounds.scroll<=bounds.width).toBe(true);
    await page.screenshot({path:fileURLToPath(new URL(`../../test-results/dashboard/${width}.png`,import.meta.url)),fullPage:true});
  }
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Dashboard browser checks passed: authenticated SQL metrics, active break worker, clock/weather, current shift charts, no status column, responsive widths 1440/768/375.');
}finally{
  if(browser)await browser.close();if(vite){vite.kill();await new Promise(r=>{if(vite.exitCode!==null)r();else vite.once('exit',r);});}if(server)await new Promise(r=>server.close(r));await engine.close();
}


