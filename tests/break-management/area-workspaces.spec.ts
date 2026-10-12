import { test, expect, type Page } from '@playwright/test';

async function signIn(page: Page) {
  await page.goto('/login');
  await page.evaluate(() => localStorage.setItem('relay-wfm-session', JSON.stringify({ state: { user: {
    id: 'USR-SUP-001', role: 'SUPERVISOR', name: 'Workspace review', title: 'Supervisor', email: 'demo@example.test',
  } }, version: 0 })));
}

test('every supervisor area opens a data workspace and fits responsive widths', async ({ page }) => {
  test.setTimeout(60000);
  await signIn(page);
  for (const [path, heading, workspace] of [
    ['/workforce', 'Workforce overview', 'Employee directory'],
    ['/scheduling', 'Scheduling', 'Coverage roster'],
    ['/supervisor-operations', 'Operations', 'Live operations'],
    ['/insights', 'Insights & Tools', 'Report workspace'],
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: workspace, exact: true })).toBeVisible();
    await expect(page.locator('.workspace-summary')).toBeVisible();
    await expect(page.getByRole('table').first()).toBeVisible();
    await expect(page.locator('.supervisor-tool-card')).toHaveCount(0);
    await expect(page.locator('.feature-panel-art')).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: `test-results/workspace-${path.slice(1)}.png`, fullPage: true });
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} at ${width}px`).toBe(true);
    }
  }
});

test('staff inspection preserves search, sort and focus in the virtualized directory', async ({ page }) => {
  await signIn(page);
  await page.goto('/workforce');
  const table = page.getByRole('table', { name: 'Employees', exact: true });
  const firstRow = table.getByRole('row').nth(1);
  await expect(firstRow).toBeVisible();
  const id = await firstRow.getByRole('cell').first().innerText();
  const search = page.getByRole('searchbox', { name: 'Search ID, name, email' });
  await search.fill(id);
  await expect(table.getByRole('row')).toHaveCount(2);
  await table.getByRole('row').nth(1).focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog');
  await expect(panel.getByRole('heading', { name: 'Operational assignment' })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Open full record' })).toHaveAttribute('href', `/employees/${id}`);
  await page.keyboard.press('Escape');
  await expect(panel).not.toBeVisible();
  await expect(search).toHaveValue(id);
  await expect(table.getByRole('row').nth(1)).toBeFocused();
  await page.getByRole('button', { name: 'Compact rows' }).click();
  await expect(table.getByRole('row').nth(1)).toHaveCSS('height', '36px');
});

test('operations scope, occupancy mode and detail inspection stay consistent', async ({ page }) => {
  await signIn(page);
  await page.goto('/supervisor-operations');
  await page.getByRole('combobox', { name: 'Platform', exact: true }).selectOption('KANE-13');
  const table = page.getByRole('table', { name: 'Platform operations', exact: true });
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Night roster', exact: true }).click();
  await expect(table.getByRole('columnheader', { name: 'Rostered / capacity' })).toBeVisible();
  await table.locator('tbody tr').first().click();
  const panel = page.getByRole('dialog', { name: 'KANE-13', exact: true });
  await expect(panel.getByRole('heading', { name: 'Department coverage · live' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('combobox', { name: 'Platform', exact: true })).toHaveValue('KANE-13');
  await expect(page.getByRole('tab', { name: 'Night roster', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('scheduling carries compatible scope into approvals and Back restores the roster', async ({ page }) => {
  await signIn(page);
  await page.goto('/scheduling?view=daily&dept=DP&platform=KANE-13');
  await expect(page.getByRole('tab', { name: 'Daily', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('navigation', { name: 'Scheduling tools' }).getByRole('link', { name: 'Off-days', exact: true }).click();
  await expect(page).toHaveURL(/off-days\?dept=DP&platform=KANE-13/);
  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Daily', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('combobox', { name: 'Platform', exact: true })).toHaveValue('KANE-13');
});

test('insights retains report scope and exports the selected report', async ({ page }) => {
  await signIn(page);
  await page.goto('/insights?platform=KANE-13');
  await page.getByRole('button', { name: 'Platform capacity', exact: true }).click();
  await expect(page).toHaveURL(/platform=KANE-13&report=platform-capacity/);
  await expect(page.getByRole('combobox', { name: 'Platform', exact: true })).toHaveValue('KANE-13');
  const exporting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  expect((await exporting).suggestedFilename()).toBe('platform-capacity.csv');
});
