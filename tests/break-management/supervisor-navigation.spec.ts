import { test, expect, type Page } from '@playwright/test';

async function signIn(page: Page, role = 'SUPERVISOR') {
  await page.goto('/login');
  await page.evaluate(role => localStorage.setItem('relay-wfm-session', JSON.stringify({ state: { user: { id: role === 'SUPERVISOR' ? 'USR-SUP-001' : 'EMP-00421', role, name: 'Navigation test', title: role, email: 'demo@example.test' } }, version: 0 })), role);
}

test('six primary areas retain every original destination through hubs', async ({ page }) => {
  await signIn(page);
  for (const [path, title, link] of [
    ['/workforce', 'Workforce overview', 'Employees'],
    ['/scheduling', 'Scheduling', 'Roster'],
    ['/supervisor-operations', 'Operations', 'Replacements'],
    ['/equipment', 'Equipment', 'Laptops'],
    ['/insights', 'Insights & Tools', 'Audit Logs'],
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Primary' }).getByRole('link')).toHaveCount(6);
    await expect(page.getByRole('navigation', { name: / tools$/ }).getByRole('link', { name: link, exact: true })).toBeVisible();
  }
});

test('deep links highlight their area, collapse preserves location, and Back restores filters', async ({ page }) => {
  await signIn(page);
  await page.goto('/roster?view=daily&dept=DP&platform=KANE-13&date=2026-10-12');
  const sidebar = page.getByRole('complementary', { name: 'Primary' });
  await expect(sidebar.getByRole('link', { name: 'Scheduling', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page).toHaveURL(/view=daily/);
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await page.getByRole('navigation', { name: 'Scheduling navigation' }).getByRole('link', { name: 'Off-days', exact: true }).click();
  await expect(page).toHaveURL(/off-days\?dept=DP&platform=KANE-13/);
  await expect(page.getByLabel('Department', { exact: true }).first()).toHaveValue('DP');
  await page.goBack();
  await expect(page).toHaveURL(/roster\?view=daily/);
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2026-10-12');
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Off-days', exact: true })).toBeVisible();
});

test('mobile navigation has six areas, keyboard focus, Escape and a usable equipment hub', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto('/scheduling');
  const more = page.getByRole('button', { name: 'Open full navigation' });
  await more.click();
  const dialog = page.getByRole('dialog', { name: 'All sections' });
  await expect(dialog.getByRole('link')).toHaveCount(6);
  await expect(dialog.getByRole('link', { name: 'Dashboard', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(more).toBeFocused();
  await more.click();
  await dialog.getByRole('link', { name: 'Equipment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Equipment', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('staff retain navigation and cannot open supervisor hubs directly', async ({ page }) => {
  await signIn(page, 'EMPLOYEE');
  await page.goto('/scheduling');
  await expect(page.getByRole('complementary', { name: 'Primary' }).getByRole('link', { name: 'My Schedule', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Scheduling', exact: true })).not.toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Scheduling tools' })).not.toBeVisible();
});

test('shared reference theme fits responsive widths and remains active for staff', async ({ page }) => {
  await signIn(page);
  await page.goto('/equipment');
  await expect(page.locator('html.agency-theme')).toBeVisible();
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: 'test-results/supervisor-theme-equipment.png', fullPage: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Supervisor dashboard' })).toBeVisible();
  await expect(page.locator('[data-kpi-tone]').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/supervisor-theme-dashboard.png', fullPage: true });
  await signIn(page, 'EMPLOYEE');
  await page.goto('/my/schedule');
  await expect(page.locator('html.agency-theme')).toBeVisible();
});
