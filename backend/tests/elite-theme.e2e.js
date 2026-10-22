// Theme verification uses real sessions and an isolated database; no developer data.
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir } from 'node:fs/promises';
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
const origin = 'http://localhost:5188';
const password = 'Theme-verification-42';
const output = fileURLToPath(new URL('../../test-results/elite-theme/', import.meta.url));
let server, vite, browser;
let transactionTail = Promise.resolve();
const db = { query: (sql, values) => engine.query(sql, values), connect: async () => {
  const previous = transactionTail; let release;
  transactionTail = new Promise(resolve => { release = resolve; }); await previous;
  return { query: (sql, values) => engine.query(sql, values), release };
} };
const paths = {
  SUPERVISOR: ['/', '/workforce', '/register', '/candidates', '/training', '/workforce/assignments', '/employees', '/freelancers', '/roster', '/shifts', '/rotation', '/off-days', '/replacements', '/disciplinary', '/breaks', '/breaks/reports', '/breaks/policy', '/platforms', '/categories', '/platform-config', '/capacity', '/platform-demand', '/departments', '/operations', '/equipment', '/pools', '/laptops', '/incidents', '/insights', '/reports', '/audit', '/settings', '/notifications', '/profile', '/account-admin'],
  EMPLOYEE: ['/', '/my/platform', '/my/schedule', '/my/off-days', '/my/workstation', '/report-issue', '/my/disciplinary', '/my/breaks', '/notifications', '/profile'],
  FREELANCER: ['/', '/my/platform', '/my/availability', '/my/assignments', '/my/workstation', '/report-issue', '/my/disciplinary', '/my/breaks', '/notifications', '/profile'],
};

try {
  await mkdir(output, { recursive: true });
  for (const name of (await readdir(new URL('../migrations/', import.meta.url))).filter(n => n.endsWith('.sql')).sort()) {
    await engine.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  }
  const hash = await hashPassword(password);
  for (const role of Object.keys(paths)) {
    const id = randomUUID();
    await db.query('INSERT INTO users(id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5)', [id, `${role.toLowerCase()}@example.test`, `${role[0]}${role.slice(1).toLowerCase()} Tester`, role, hash]);
    if (role === 'SUPERVISOR') for (const permission of ['accounts.manage','audit.read','reports.export','breaks.policy','breaks.review','attendance.correct','disciplinary.approve']) await db.query('INSERT INTO user_permissions(user_id,permission) VALUES($1,$2)', [id, permission]);
  }
  await importOperations(db, { backup: false, nodeEnv: 'test' });
  server = createApp(db, readConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://unused', FRONTEND_ORIGIN: origin })).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  vite = spawn(process.execPath, [fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url)), '--host', '127.0.0.1', '--port', '5188', '--strictPort'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), windowsHide: true, stdio: ['ignore','pipe','pipe'],
    env: { ...process.env, PCD_API_TARGET: `http://127.0.0.1:${server.address().port}`, VITE_API_BASE_URL: '/api/v1', VITE_BREAK_ENABLED: 'true', VITE_BREAK_ADAPTER: 'real' },
  });
  let logs = ''; vite.stdout.on('data', data => { logs += data; }); vite.stderr.on('data', data => { logs += data; });
  for (let attempt = 0;; attempt++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (attempt > 200 || vite.exitCode !== null) throw new Error(`Vite failed: ${logs}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ channel: process.env.PCD_TEST_BROWSER ?? 'chrome', headless: true });
  const errors = [], overflows = [];
  let checked = 0;
  for (const [role, destinations] of Object.entries(paths)) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${role}: ${error.message}`));
    await page.goto(`${origin}/login`);
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('html')).toHaveClass(/elite-theme/);
    const loginBefore = await page.screenshot({ path: `${output}/${role}-login-before.png`, fullPage: true });
    await page.getByLabel('Work email', { exact: true }).fill(`${role.toLowerCase()}@example.test`);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.locator('#main h1').first()).toBeVisible({ timeout: 20000 });
    for (const path of destinations) {
      await page.goto(`${origin}${path}`);
      await expect(page.locator('#main h1').first()).toBeVisible({ timeout: 20000 });
      await page.waitForLoadState('networkidle');
      await expect(page.locator('#main [aria-busy="true"]')).toHaveCount(0);
      await expect(page.locator('html')).toHaveClass(/elite-theme/);
      assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--surface').trim()), '25 23 47');
      await expect(page.getByRole('alert').filter({ hasText: /backend returned|Cannot reach|unexpected response/ })).toHaveCount(0);
      for (const width of [1440, 375]) {
        await page.setViewportSize({ width, height: 1000 });
        if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)) {
          overflows.push(`${role} ${path} at ${width}px`);
          console.log('Overflow details:', path, await page.locator('#main').evaluate(el => [...el.querySelectorAll('*')].filter(n => n.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map(n => ({ tag: n.tagName, class: n.className, width: Math.round(n.getBoundingClientRect().width) }))));
          await page.screenshot({ path: `${output}/${role}-${path.slice(1).replaceAll('/', '-')}-overflow.png`, fullPage: true });
        }
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      if (['/', '/workforce', '/roster', '/platforms', '/profile', '/my/availability', '/my/schedule'].includes(path)) {
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: `${output}/${role}-${path === '/' ? 'dashboard' : path.slice(1).replaceAll('/', '-')}.png`, fullPage: true });
      }
      checked++;
    }
    await page.goto(origin);
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(page.locator('#main h1').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('#main [aria-busy="true"]')).toHaveCount(0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${role} dashboard overflow at ${width}px`);
      await page.screenshot({ path: `${output}/${role}-dashboard-${width}.png`, fullPage: true });
    }
    if (role === 'SUPERVISOR') {
      // Verify keyboard navigation and the mobile navigation dialog use the scoped theme.
      await page.setViewportSize({ width: 375, height: 1000 });
      await page.getByRole('button', { name: 'Open full navigation' }).click();
      await expect(page.getByRole('dialog', { name: 'All sections' })).toBeVisible();
      await page.screenshot({ path: `${output}/SUPERVISOR-mobile-navigation.png`, fullPage: true });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    // Log out through the UI and ensure the shared theme remains consistent on login.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('header.app-glass-bar button[aria-haspopup="menu"]').click();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/elite-theme/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const loginAfter = await page.screenshot({ path: `${output}/${role}-login-after.png`, fullPage: true });
    assert.deepEqual(loginAfter, loginBefore, `${role}: login pixels changed after using the app theme`);
    console.log(`${role}: ${destinations.length} destinations checked at desktop and mobile; login unchanged.`);
    await context.close();
  }
  assert.deepEqual(errors, [], 'Browser runtime errors');
  assert.deepEqual(overflows, [], 'Page overflow');
  console.log(`Elite theme passed: ${checked} destinations, all roles, four dashboard widths, mobile dialog, and identical login screenshots.`);
} finally {
  if (browser) await browser.close();
  if (vite) { vite.kill(); await new Promise(resolve => { if (vite.exitCode !== null) resolve(); else vite.once('exit', resolve); }); }
  if (server) await new Promise(resolve => server.close(resolve));
  await engine.close();
}
