import { test, expect } from '@playwright/test';
import { legacyNavByRole } from '../../src/data/navigation';

for (const role of ['SUPERVISOR', 'EMPLOYEE', 'FREELANCER'] as const) {
  test(`${role} pages share the agency theme and branding`, async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/login');
    await page.evaluate(role => localStorage.setItem('relay-wfm-session', JSON.stringify({ state: { user: {
      id: role === 'SUPERVISOR' ? 'USR-SUP-001' : role === 'EMPLOYEE' ? 'EMP-00421' : 'FL-00124',
      role, name: 'Brand test', title: role, email: 'demo@example.test',
    } }, version: 0 })), role);
    for (const item of legacyNavByRole[role]) {
      await page.goto(item.to);
      await expect(page.locator('.app-shell-canvas')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(page).toHaveTitle('PortCity Digital');
      await expect(page.getByRole('complementary', { name: 'Primary' }).getByRole('img', { name: 'PortCity Digital' })).toBeVisible();
      expect(await page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--surface').trim())).toBe('23 23 25');
    }
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.screenshot({ path: `test-results/agency-${role.toLowerCase()}.png`, fullPage: true });
  });
}

test('login matches the agency theme on desktop and mobile', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Platform introduction' }).getByRole('heading')).toContainText('A calmer day.');
  await page.screenshot({ path: 'test-results/agency-login.png', fullPage: true });
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
  }
});
