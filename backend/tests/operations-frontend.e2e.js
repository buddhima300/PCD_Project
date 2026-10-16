// Real original screens + HTTP/session middleware + isolated PostgreSQL. No developer DB.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { chromium, expect } from '@playwright/test';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { hashPassword } from '../src/shared/security.js';
import { importOperations } from '../scripts/import-operations.js';

const engine = new PGlite();
let server, vite, browser;
const origin = 'http://localhost:5187';
const password = 'Integration-password-42';
let transactionTail = Promise.resolve();
const db = { query: (sql, values) => engine.query(sql, values), connect: async () => {
  const previous = transactionTail; let release;
  transactionTail = new Promise(resolve => { release = resolve; }); await previous;
  return { query: (sql, values) => engine.query(sql, values), release };
} };
try {
  for (const name of ['001_foundation.sql','002_operations.sql','003_workflow_records.sql']) await engine.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  const hash = await hashPassword(password);
  for (const role of ['SUPERVISOR','EMPLOYEE','FREELANCER']) {
    const id = randomUUID();
    await db.query('INSERT INTO users(id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5)', [id, `${role.toLowerCase()}@example.test`, `${role} Tester`, role, hash]);
    if (role === 'SUPERVISOR') for (const permission of ['accounts.manage','audit.read','reports.export','breaks.policy','breaks.review','attendance.correct','disciplinary.approve']) await db.query('INSERT INTO user_permissions(user_id,permission) VALUES($1,$2)', [id, permission]);
  }
  await importOperations(db, { backup: false, nodeEnv: 'test' });
  server = createApp(db, readConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://unused', FRONTEND_ORIGIN: origin })).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  vite = spawn(process.execPath, [fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url)), '--host', '127.0.0.1', '--port', '5187', '--strictPort'], { cwd: fileURLToPath(new URL('../../', import.meta.url)), windowsHide: true, stdio: ['ignore','pipe','pipe'], env: { ...process.env, PCD_API_TARGET: `http://127.0.0.1:${server.address().port}`, VITE_API_BASE_URL: '/api/v1', VITE_BREAK_ENABLED: 'true', VITE_BREAK_ADAPTER: 'real' } });
  let logs = ''; vite.stdout.on('data', data => { logs += data; }); vite.stderr.on('data', data => { logs += data; });
  for (let attempt = 0;; attempt++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (attempt > 200 || vite.exitCode !== null) throw new Error(`Vite failed: ${logs}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ channel: process.env.PCD_TEST_BROWSER ?? 'chrome', headless: true });
  const errors = [], failures = [], registered = [];
  for (const role of ['SUPERVISOR','EMPLOYEE','FREELANCER']) {
    const context = await browser.newContext(); const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${role}: ${error.message}`));
    page.on('response', response => { if (response.url().includes('/operations/') && response.status() >= 400) failures.push(`${role}: ${response.status()} ${response.url()}`); });
    await page.goto(origin);
    await page.getByLabel('Work email', { exact: true }).fill(`${role.toLowerCase()}@example.test`);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.locator('#main h1').first()).toBeVisible({ timeout: 20000 });
    if (role === 'SUPERVISOR') await expect(page.getByRole('heading', { name: 'Supervisor dashboard', exact: true })).toBeVisible();
    else await expect(page.getByRole('heading', { name: /Good evening|Your next shift|Good morning|Your workday|Welcome/ }).first()).toBeVisible();
    const paths = role === 'SUPERVISOR' ? ['/platforms','/employees','/freelancers','/roster','/candidates','/training','/disciplinary','/breaks','/reports','/profile','/account-admin'] : role === 'EMPLOYEE' ? ['/my/schedule','/my/off-days','/my/workstation','/my/disciplinary','/my/breaks','/profile'] : ['/my/availability','/my/assignments','/my/workstation','/my/disciplinary','/my/breaks','/profile'];
    for (const path of paths) {
      await page.goto(`${origin}${path}`);
      await expect(page.locator('#main h1').first()).toBeVisible({ timeout: 20000 });
      await page.waitForLoadState('networkidle');
      if (failures.length) throw new Error(failures.join('\n'));
    }
    await page.reload(); await expect(page.locator('#main h1').first()).toBeVisible({ timeout: 20000 });
    const me = await page.evaluate(async () => (await fetch('/api/v1/auth/me')).json());
    expect(me.user.role).toBe(role);
    if (role === 'SUPERVISOR') {
      for (const type of ['PERMANENT','FREELANCER']) {
        await page.goto(`${origin}/workforce`);
        await page.getByRole('button',{name:'Register staff',exact:true}).click();
        await expect(page.getByRole('heading',{name:'Register staff',exact:true})).toBeVisible();
        const email = `new-${type.toLowerCase()}@example.test`;
        await page.getByLabel('Full Name',{exact:true}).fill(`New ${type} Worker`);
        await page.getByLabel('Email Address',{exact:true}).fill(email);
        await page.getByLabel('Phone',{exact:true}).fill('+94770000123');
        await page.getByLabel('Employment Type',{exact:true}).selectOption(type);
        await page.getByLabel('Initial password',{exact:true}).fill(password);
        await page.getByLabel('Confirm initial password',{exact:true}).fill(password);
        const [saved] = await Promise.all([page.waitForResponse(response => response.url().endsWith('/staff/register') && response.request().method() === 'POST'),page.getByRole('button',{name:'Register & Proceed to Placement',exact:true}).click()]);
        expect(saved.status()).toBe(201);
        const data = await saved.json();
        expect(data.candidate.registeredWorkerId).toBe(data.workerId);
        await expect(page).toHaveURL(/\/placement-queue$/);
        registered.push({email,id:data.user.id,name:data.user.name});
      }
    }
    await context.close();
  }
  for (const staff of registered) {
    const context = await browser.newContext(); const page = await context.newPage();
    page.on('pageerror',error => errors.push(error.message));
    const signIn = async secret => {
      await page.goto(`${origin}/login`);
      await page.getByLabel('Work email',{exact:true}).fill(staff.email);
      await page.getByLabel('Password',{exact:true}).fill(secret);
      await page.getByRole('button',{name:'Login',exact:true}).click();
      await expect(page.locator('#main h1').first()).toBeVisible({timeout:20000});
      const me = await page.evaluate(async () => (await fetch('/api/v1/auth/me')).json()); expect(me.user.id).toBe(staff.id);
    };
    await signIn(password);
    await page.goto(`${origin}/profile`);
    await expect(page.getByRole('heading',{name:'My profile',exact:true})).toBeVisible();
    await page.getByLabel('Current password',{exact:true}).fill(password);
    await page.getByLabel('New password',{exact:true}).fill('Updated-worker-password-42');
    await page.getByLabel('Confirm new password',{exact:true}).fill('Updated-worker-password-42');
    await page.getByRole('button',{name:'Change password',exact:true}).click();
    await expect(page).toHaveURL(/\/login$/);
    await signIn('Updated-worker-password-42');
    await context.close();
  }
  if (errors.length) throw new Error(errors.join('\n'));
  if (failures.length) throw new Error(failures.join('\n'));
  console.log('Original frontend smoke passed: all three roles, 23 module routes, Workforce → Register staff for both staff types, immediate login, and profile password changes.');
} finally {
  if (browser) await browser.close();
  if (vite) { vite.kill(); await new Promise(resolve => { if (vite.exitCode !== null) resolve(); else vite.once('exit', resolve); }); }
  if (server) await new Promise(resolve => server.close(resolve));
  await engine.close();
}
