import { test, expect } from '@playwright/test';

test('equipment inventory preserves filters and keyboard focus around asset inspection', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(() => localStorage.setItem('relay-wfm-session', JSON.stringify({ state: { user: {
    id: 'USR-SUP-001', role: 'SUPERVISOR', name: 'Equipment test', title: 'Supervisor', email: 'demo@example.test',
  } }, version: 0 })));
  await page.goto('/equipment');
  await expect(page.getByRole('heading', { name: 'Equipment', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Equipment tools' }).getByRole('link')).toHaveCount(7);
  await expect(page.locator('.feature-panel-art:visible')).toHaveCount(0);
  const table = page.getByRole('table', { name: 'Laptops' });
  const firstRow = table.locator('tbody tr').first();
  await expect(firstRow).toBeVisible();
  const assetId = await firstRow.locator('td').nth(1).innerText();
  const search = page.getByRole('searchbox', { name: 'Asset ID, serial, workstation, user' });
  await search.fill(assetId);
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await table.locator('tbody tr').first().focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog', { name: assetId, exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Open full record' })).toHaveAttribute('href', `/laptops/${assetId}`);
  await expect(panel.getByRole('heading', { name: 'Recent activity' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).not.toBeVisible();
  await expect(search).toHaveValue(assetId);
  await expect(table.locator('tbody tr').first()).toBeFocused();
  await page.getByRole('button', { name: 'Compact rows' }).click();
  await expect(page.locator('.equipment-compact')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(search).toHaveValue('');
  await expect(table.locator('tbody tr')).toHaveCount(25);
  await page.screenshot({ path: 'test-results/equipment-workspace.png', fullPage: true });
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
