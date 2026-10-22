// Verify real themed modal stacking with isolated data; never use the developer DB.
import { readFile,readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { chromium,expect } from '@playwright/test';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { hashPassword } from '../src/shared/security.js';
import { importOperations } from '../scripts/import-operations.js';

const engine=new PGlite();let server,vite,browser,tail=Promise.resolve();
const db={query:(sql,args)=>engine.query(sql,args),connect:async()=>{const prior=tail;let release;tail=new Promise(r=>{release=r;});await prior;return {query:(sql,args)=>engine.query(sql,args),release};}};
const origin='http://localhost:5195',password='Modal-browser-password-42';
try {
  for(const name of (await readdir(new URL('../migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())await engine.exec(await readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
  await db.query('INSERT INTO users(id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5)',[randomUUID(),'modal-supervisor@example.test','Modal Supervisor','SUPERVISOR',await hashPassword(password)]);
  await importOperations(db,{backup:false,nodeEnv:'test'});
  server=createApp(db,readConfig({NODE_ENV:'test',DATABASE_URL:'postgresql://unused',FRONTEND_ORIGIN:origin})).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  vite=spawn(process.execPath,[fileURLToPath(new URL('../../node_modules/vite/bin/vite.js',import.meta.url)),'--host','127.0.0.1','--port','5195','--strictPort'],{cwd:fileURLToPath(new URL('../../',import.meta.url)),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PCD_API_TARGET:`http://127.0.0.1:${server.address().port}`,VITE_API_BASE_URL:'/api/v1',VITE_BREAK_ENABLED:'false',VITE_BREAK_ADAPTER:'real'}});
  let logs='';vite.stdout.on('data',d=>logs+=d);vite.stderr.on('data',d=>logs+=d);
  for(let attempt=0;;attempt++){try{if((await fetch(origin)).ok)break;}catch{}if(attempt>200||vite.exitCode!==null)throw new Error(logs);await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:process.env.PCD_TEST_BROWSER??'chrome',headless:true});
  const page=await browser.newPage({reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${origin}/login`);await page.getByLabel('Work email',{exact:true}).fill('modal-supervisor@example.test');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Login',exact:true}).click();await expect(page.locator('#main h1').first()).toBeVisible({timeout:20000});
  async function checkLayer(dialog){
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(el=>el.closest('[data-dialog-layer]').parentElement===document.body)).toBe(true);
    const close=dialog.getByRole('button',{name:'Close dialog'});await close.click({trial:true});
    expect(await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;})).toBe(true);
    expect(await page.evaluate(()=>document.body.style.overflow)).toBe('hidden');
  }
  for(const width of [1440,768,375]){
    await page.setViewportSize({width,height:950});await page.goto(`${origin}/platforms`);
    await page.getByRole('button',{name:'Add category',exact:true}).click();let dialog=page.getByRole('dialog',{name:'Add platform category'});await checkLayer(dialog);
    await dialog.getByLabel('Category code').fill('LAYERTEST');await dialog.getByLabel('Category name').fill('Layering regression');await dialog.getByRole('button',{name:'Review',exact:true}).click();await expect(dialog.getByText('LAYERTEST · Layering regression')).toBeVisible();await dialog.getByRole('button',{name:'Back',exact:true}).click();
    await page.keyboard.press('Escape');await dialog.getByRole('button',{name:'Discard',exact:true}).click();await expect(dialog).toHaveCount(0);
    await page.getByRole('button',{name:'Add platform',exact:true}).click();dialog=page.getByRole('dialog',{name:'Add platform',exact:true});await checkLayer(dialog);await dialog.getByRole('button',{name:'Close dialog'}).click();await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
    await page.goto(`${origin}/employees`);await page.getByRole('row').filter({hasText:'EMP-'}).first().click();dialog=page.getByRole('dialog');await checkLayer(dialog);await dialog.getByRole('button',{name:'Close dialog'}).click();await expect(dialog).toHaveCount(0);
  }
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Modal browser checks passed: category review/discard, platform setup, employee detail drawer, pointer hit testing, viewport bounds and scroll restoration at 1440/768/375px.');
} finally {
  if(browser)await browser.close();if(vite){vite.kill();await new Promise(r=>{if(vite.exitCode!==null)r();else vite.once('exit',r);});}if(server)await new Promise(r=>server.close(r));await engine.close();
}
