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
  for (const name of ['001_foundation.sql','002_operations.sql','003_workflow_records.sql','004_equipment_allocations.sql','005_login_access_controls.sql','007_staff_number_counters.sql']) await engine.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
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
        const [saved] = await Promise.all([page.waitForResponse(response => response.url().endsWith('/staff/register') && response.request().method() === 'POST'),page.getByRole('button',{name:'Register & Review Candidate',exact:true}).click()]);
        expect(saved.status()).toBe(201);
        const data = await saved.json();
        expect(data.candidate.registeredWorkerId).toBe(data.workerId);
        await expect(page).toHaveURL(/\/candidates$/);
        registered.push({email,id:data.user.id,name:data.user.name});
      }
      await page.goto(`${origin}/supervisor-operations`);
      const summary = page.locator('dl[aria-label="Filtered platform summary"]');
      const total = label => summary.locator('dt',{hasText:label}).locator('..').locator('dd');
      await expect(total('Matching platforms')).not.toHaveText('—');
      const previousPlatforms = Number(await total('Matching platforms').textContent());
      const previousSeats = Number(await total('Configured seats').textContent());
      await page.getByRole('button',{name:'Add category',exact:true}).click();
      await page.getByLabel('Category code',{exact:true}).fill('UIOPS');
      await page.getByLabel('Category name',{exact:true}).fill('Browser operations');
      await page.getByRole('button',{name:'Review',exact:true}).click();
      await page.getByRole('button',{name:'Create category',exact:true}).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.getByRole('button',{name:'Add platform',exact:true}).click();
      await page.getByRole('dialog',{name:'Add platform',exact:true}).getByLabel('Platform category',{exact:true}).selectOption('UIOPS');
      await page.getByRole('button',{name:'Continue',exact:true}).click();
      await page.getByLabel('Platform code',{exact:true}).fill('UIOPS-1');
      await page.getByLabel('Platform name',{exact:true}).fill('Browser verified platform');
      await page.getByRole('button',{name:'Create platform in setup',exact:true}).click();
      await page.locator('#seats-DP').fill('3');
      await page.locator('#target-DP-MORNING').fill('1');
      await page.getByRole('button',{name:'Save capacity & continue',exact:true}).click();
      await expect(page.getByText('Staffing is managed in Workforce',{exact:true})).toBeVisible();
      await page.getByRole('button',{name:'Review platform',exact:true}).click();
      await page.getByRole('button',{name:'Activate platform',exact:true}).click();
      await expect(page).toHaveURL(/\/platforms\/UIOPS-1$/);
      await page.goto(`${origin}/supervisor-operations`);
      await expect(total('Matching platforms')).toHaveText(String(previousPlatforms+1));
      await expect(total('Configured seats')).toHaveText(String(previousSeats+3));
      await expect(page.getByRole('row').filter({hasText:'UIOPS-1'})).toContainText('0 / 3');
      await page.reload();
      await expect(total('Configured seats')).toHaveText(String(previousSeats+3));
      await expect(page.getByRole('row').filter({hasText:'UIOPS-1'})).toBeVisible();
      await page.goto(`${origin}/platforms/UIOPS-1`);
      await page.getByRole('button',{name:'Manage platform setup',exact:true}).click();
      await page.locator('#seats-DP').fill('4');
      await page.getByRole('button',{name:'Save capacity & continue',exact:true}).click();
      await expect(page.getByText('Staffing is managed in Workforce',{exact:true})).toBeVisible();
      await page.getByRole('button',{name:'Close · keep saved work',exact:true}).click();
      await page.goto(`${origin}/supervisor-operations`);
      await expect(total('Configured seats')).toHaveText(String(previousSeats+4));
      await expect(page.getByRole('row').filter({hasText:'UIOPS-1'})).toContainText('0 / 4');
      expect((await db.query("SELECT seats FROM platform_capacities c JOIN platforms p ON p.id=c.platform_id WHERE p.code='UIOPS-1' AND department_code='DP'")).rows[0].seats).toBe(4);
      // Exercise registration → training → evaluation → explicit assignment for both worker types.
      for(const [index,person] of registered.entries()) {
        await page.goto(origin+'/candidates');
        const candidateRow=page.getByRole('row').filter({hasText:person.email});
        await candidateRow.getByRole('button',{name:'Assign training',exact:true}).click();
        const trainingDialog=page.getByRole('dialog',{name:'Assign candidate to training'});
        await trainingDialog.getByLabel('Training platform',{exact:true}).selectOption('UIOPS-1');
        await trainingDialog.getByLabel('Training days',{exact:true}).fill('1');
        await trainingDialog.getByRole('button',{name:'Start training',exact:true}).click();
        await expect(trainingDialog).toBeHidden();
        await expect(page.getByRole('row').filter({hasText:person.email})).toHaveCount(0);
        await page.goto(origin+'/training');
        const row=page.getByRole('row').filter({hasText:person.name});
        await row.getByRole('button',{name:'Advance Day',exact:true}).click();
        await row.getByRole('button',{name:'Evaluate',exact:true}).click();
        await page.getByRole('dialog').getByRole('button',{name:'Pass',exact:true}).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await row.getByRole('button',{name:'Assign platform',exact:true}).click();
        const assignment=page.getByRole('dialog');
        await assignment.getByLabel('Shift',{exact:true}).selectOption(index===0?'MORNING':'NIGHT');
        await assignment.getByRole('button',{name:'Confirm assignment',exact:true}).click();
        await expect(assignment).toBeHidden();
        await expect(page.getByRole('row').filter({hasText:person.name})).toHaveCount(0);
      }
      await page.goto(origin+'/pools/POOL-UIOPS1-DP');
      await expect(page.getByRole('heading',{name:'UIOPS-1 / DP',exact:true})).toBeVisible();
      await page.getByRole('button',{name:'Register device',exact:true}).click();
      const registerDevice = page.getByRole('dialog',{name:'Register shared platform device'});
      await registerDevice.getByLabel('Asset ID',{exact:true}).fill('UI-SHARED-LAPTOP');
      await registerDevice.getByLabel('Serial number',{exact:true}).fill('UI-SHARED-SERIAL');
      await registerDevice.getByLabel('Model',{exact:true}).fill('Browser test laptop');
      const [deviceResponse]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/registerPlatformDevice')),registerDevice.getByRole('button',{name:'Register device',exact:true}).click()]);
      expect(deviceResponse.status(),await deviceResponse.text()).toBe(200);
      await expect(registerDevice).toBeHidden({timeout:15000});
      await expect(page.getByText('UI-SHARED-LAPTOP',{exact:true})).toBeVisible();
      await page.reload();
      await expect(page.getByText('UI-SHARED-LAPTOP',{exact:true})).toBeVisible();
      expect((await db.query("SELECT data->>'currentUserId' AS holder FROM ops_laptops WHERE id='UI-SHARED-LAPTOP'")).rows[0].holder).toBe(null);
      // Prepare an existing qualified employee with no current commitments in this isolated DB.
      const staff = (await db.query("SELECT id,data FROM ops_employees WHERE data->>'qualifiedForProduction' IS DISTINCT FROM 'false' LIMIT 1")).rows[0];
      await db.query("UPDATE ops_laptops SET data=data || '{\"currentUserId\":null,\"nextUserId\":null,\"status\":\"AVAILABLE\"}'::jsonb WHERE data->>'currentUserId'=$1 OR data->>'nextUserId'=$1",[staff.id]);
      await db.query("DELETE FROM ops_handovers WHERE data->>'incomingId'=$1 OR data->>'outgoingId'=$1",[staff.id]);
      await db.query("DELETE FROM ops_off_days WHERE data->>'employeeId'=$1",[staff.id]);
      const updatedStaff = {...staff.data,dept:'DP',platformCode:'',categoryCode:'',poolId:'',status:'ACTIVE',accountStatus:'ACTIVE',qualifiedForProduction:true,currentWorkstationId:null};
      await db.query('UPDATE ops_employees SET data=$2 WHERE id=$1',[staff.id,JSON.stringify(updatedStaff)]);
      await page.goto(`${origin}/employees`);
      await page.getByPlaceholder('Search ID, name, email').fill(staff.id);
      await page.getByRole('row').filter({hasText:staff.id}).click();
      const panel = page.getByRole('dialog');
      await expect(panel.getByRole('progressbar',{name:'Remaining off-days'})).toBeVisible();
      await panel.getByRole('button',{name:'Assign',exact:true}).click();
      await panel.getByLabel('Platform',{exact:true}).selectOption('UIOPS-1');
      await panel.getByLabel('Reason',{exact:true}).fill('Browser verified shared platform staffing');
      await panel.getByRole('button',{name:'Assign platform',exact:true}).click();
      await expect(panel.getByRole('button',{name:'Change',exact:true})).toBeVisible();
      await expect(panel.getByText('UIOPS-1',{exact:true})).toBeVisible();
      await page.reload();
      await page.getByPlaceholder('Search ID, name, email').fill(staff.id);
      await page.getByRole('row').filter({hasText:staff.id}).click();
      await expect(page.getByRole('dialog').getByRole('button',{name:'Change',exact:true})).toBeVisible();
      const careerPanel=page.getByRole('dialog');
      await careerPanel.getByRole('button',{name:'Promote',exact:true}).click();
      await careerPanel.getByLabel('Promotion reason',{exact:true}).fill('Browser verified PIC career promotion');
      await careerPanel.getByRole('button',{name:'Confirm promotion',exact:true}).click();
      await expect(careerPanel.getByText('Platform in charge (PIC)',{exact:true})).toBeVisible();
      await db.query('UPDATE ops_laptops SET data=data || $2::jsonb WHERE id=$1',['UI-SHARED-LAPTOP',JSON.stringify({currentUserId:staff.id,currentUserName:staff.data.name,status:'ASSIGNED'})]);
      await careerPanel.getByRole('button',{name:'Unassign',exact:true}).click();
      await careerPanel.getByLabel('Unassignment reason',{exact:true}).fill('Browser verified platform release');
      await careerPanel.getByRole('button',{name:'Review physical return',exact:true}).click();
      await careerPanel.getByLabel('Return review reason',{exact:true}).fill('Browser verified physical return of legacy device');
      await careerPanel.getByLabel('I verified that this device was physically returned',{exact:true}).check();
      await careerPanel.getByRole('button',{name:'Record verified return',exact:true}).click();
      await expect(careerPanel.getByText('No device is currently held by this employee.',{exact:true})).toBeVisible();
      await careerPanel.getByRole('button',{name:'Confirm unassign',exact:true}).click();
      await expect(careerPanel.getByRole('button',{name:'Assign',exact:true})).toBeVisible();
      await expect(careerPanel.getByText('Platform responsibility needs reassignment.',{exact:true})).toBeVisible();
      await careerPanel.getByRole('link',{name:'Open full record',exact:true}).click();
      await page.getByRole('tab',{name:/Career history/}).click();
      await expect(page.getByText('Browser verified PIC career promotion',{exact:true})).toBeVisible();
      await page.goto(`${origin}/employees`);
      await page.getByPlaceholder('Search ID, name, email').fill(staff.id);
      const staffRow=page.getByRole('row').filter({hasText:staff.id});
      const filledShift=staffRow.locator('[data-shift][data-filled="true"]');
      await expect(filledShift).toBeVisible();
      expect(await filledShift.evaluate(el => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
      expect(await filledShift.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(updatedStaff.shift === 'MORNING' ? 'rgb(29, 78, 216)' : 'rgb(185, 28, 28)');
      await page.reload();
      await page.getByPlaceholder('Search ID, name, email').fill(staff.id);
      await page.getByRole('row').filter({hasText:staff.id}).click();
      await expect(page.getByRole('dialog').getByRole('button',{name:'Assign',exact:true})).toBeVisible();
      await expect(page.getByRole('dialog').getByText('Platform in charge (PIC)',{exact:true})).toBeVisible();
      await page.getByRole('button',{name:'Close dialog',exact:true}).click();
      // Real login must be blocked by a directory toggle, including an existing session.
      await page.getByPlaceholder('Search ID, name, email').fill(registered[0].email);
      const loginRow=page.getByRole('row').filter({hasText:registered[0].name});
      const loginSwitch=loginRow.getByRole('switch');
      await expect(loginSwitch).toHaveAttribute('aria-checked','true');
      expect(await loginSwitch.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(21, 128, 61)');
      const staffContext=await browser.newContext(),staffPage=await staffContext.newPage();
      await staffPage.goto(`${origin}/login`);
      await staffPage.getByLabel('Work email',{exact:true}).fill(registered[0].email);
      await staffPage.getByLabel('Password',{exact:true}).fill(password);
      await staffPage.getByRole('button',{name:'Login',exact:true}).click();
      await expect(staffPage.locator('#main h1').first()).toBeVisible({timeout:20000});
      await loginSwitch.click();
      await expect(loginSwitch).toHaveAttribute('aria-checked','false');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(await loginSwitch.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(185, 28, 28)');
      expect(await staffPage.evaluate(async () => (await fetch('/api/v1/auth/me')).status)).toBe(401);
      await page.reload();
      await page.getByPlaceholder('Search ID, name, email').fill(registered[0].email);
      await expect(loginRow.getByRole('switch')).toHaveAttribute('aria-checked','false');
      await staffPage.goto(`${origin}/login`);
      await staffPage.getByLabel('Work email',{exact:true}).fill(registered[0].email);
      await staffPage.getByLabel('Password',{exact:true}).fill(password);
      await staffPage.getByRole('button',{name:'Login',exact:true}).click();
      await expect(staffPage.getByText('Your account is temporarily blocked or deactivated. Please contact your Supervisor to review and unlock your account.',{exact:true})).toBeVisible();
      await loginRow.getByRole('switch').click();
      await expect(loginRow.getByRole('switch')).toHaveAttribute('aria-checked','true');
      await staffPage.getByRole('button',{name:'Login',exact:true}).click();
      await expect(staffPage.locator('#main h1').first()).toBeVisible({timeout:20000});
      expect((await staffPage.evaluate(async () => (await fetch('/api/v1/auth/me')).json())).user.id).toBe(registered[0].id);
      await staffContext.close();
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
    await page.goto(`${origin}/my/platform`);
    await expect(page.getByRole('heading',{name:'My platform · UIOPS-1',exact:true})).toBeVisible();
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
  console.log('Frontend smoke passed: all roles, registration/login/password changes, platform setup, employee panel/monthly balance, assignment persistence, and shared device registration.');
} finally {
  if (browser) await browser.close();
  if (vite) { vite.kill(); await new Promise(resolve => { if (vite.exitCode !== null) resolve(); else vite.once('exit', resolve); }); }
  if (server) await new Promise(resolve => server.close(resolve));
  await engine.close();
}
