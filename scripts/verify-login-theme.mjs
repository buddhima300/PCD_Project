// Visual and interaction checks for the public login; no real account is needed.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const origin = 'http://127.0.0.1:5189';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../test-results/login-theme/', import.meta.url));
let browser;
const vite = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), '--host', '127.0.0.1', '--port', '5189', '--strictPort'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; vite.stdout.on('data', data => { logs += data; }); vite.stderr.on('data', data => { logs += data; });
try {
  await mkdir(output, { recursive: true });
  for (let attempt = 0;; attempt++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (attempt > 150 || vite.exitCode !== null) throw new Error(`Preview failed: ${logs}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/v1/auth/me', route => route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Sign in' } } }));
  await page.goto(`${origin}/login`);
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const wallpaper = await page.request.get(`${origin}/images/login-double-exposure-indigo.png`);
  assert.equal(wallpaper.status(), 200);
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}px`);
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
    await page.screenshot({ path: `${output}/login-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.locator('#email-error')).toContainText('Enter your work email');
  await expect(page.locator('#password-error')).toContainText('Password must be at least 6 characters');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await page.getByRole('button', { name: 'Platform help' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.equal(await page.locator('.login-exposure').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause motion' }).click();
  await expect(page.locator('.login-experience')).toHaveAttribute('data-motion', 'paused');
  await page.getByRole('button', { name: 'Resume motion' }).click();
  await expect(page.locator('.login-experience')).toHaveAttribute('data-motion', 'running');
  assert.deepEqual(errors, []);
  console.log('Login theme passed: wallpaper, four viewport widths, validation, password visibility, help keyboard dismissal, reduced motion and pause/resume.');
} finally {
  if (browser) await browser.close();
  vite.kill();
  if (vite.exitCode === null) await new Promise(resolve => vite.once('exit', resolve));
}
