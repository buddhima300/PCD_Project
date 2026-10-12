import { test, expect } from '@playwright/test';

test('welcome reacts to role selection and motion can be paused', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause motion' }).click();
  await expect(page.locator('.login-experience')).toHaveAttribute('data-motion', 'paused');
  await expect(page.locator('.login-exposure')).toHaveCSS('animation-play-state', 'paused');
  await page.getByRole('button', { name: 'Use Freelancer demo account' }).click();
  await expect(page.getByRole('button', { name: 'Use Freelancer demo account' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Work email', { exact: true })).toHaveValue('sofia.reyes@relayops.com');
  await expect(page.getByRole('region', { name: 'Platform introduction' }).getByRole('heading')).toContainText('A fresh start.');
  await page.getByRole('button', { name: 'Resume motion' }).click();
  await expect(page.locator('.login-experience')).toHaveAttribute('data-motion', 'running');
  await page.getByRole('button', { name: 'Pause motion' }).click();
  await page.getByRole('button', { name: 'Use Supervisor demo account' }).click();
  await page.screenshot({ path: 'test-results/login-double-exposure-desktop.png', fullPage: true });
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
    await expect(page.getByLabel('Work email', { exact: true })).toBeVisible();
  }
  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({ path: 'test-results/login-double-exposure-mobile.png', fullPage: true });
});

test('form validation, password visibility and help are keyboard accessible', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Work email', { exact: true }).fill('bad-email');
  await page.getByLabel('Password', { exact: true }).fill('123');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('Enter a valid email address', { exact: true })).toBeVisible();
  await expect(page.getByText('Password must be at least 6 characters', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  const help = page.getByRole('button', { name: 'Platform help', exact: true });
  await help.click();
  const dialog = page.getByRole('dialog', { name: 'Platform Access & Credentials' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Use Leila Haddad demo account' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(help).toBeFocused();
});

test('reduced motion is respected and email preference survives successful login', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');
  await expect(page.locator('.login-experience')).toHaveAttribute('data-motion', 'paused');
  await expect(page.locator('.login-exposure')).toHaveCSS('animation-name', 'none');
  await expect(page.getByRole('button', { name: 'Pause motion' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Remember my email' }).check();
  const email = await page.getByLabel('Work email', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => localStorage.getItem('portcity-login-email'))).toBe(email);
  await page.evaluate(() => localStorage.removeItem('relay-wfm-session'));
  await page.goto('/login');
  await expect(page.getByLabel('Work email', { exact: true })).toHaveValue(email);
  await expect(page.getByRole('checkbox', { name: 'Remember my email' })).toBeChecked();
});
