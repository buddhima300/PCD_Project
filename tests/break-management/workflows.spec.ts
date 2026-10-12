import { test, expect, type Page } from '@playwright/test';

async function signIn(page: Page, role: 'EMPLOYEE' | 'SUPERVISOR' = 'EMPLOYEE') {
  await page.evaluate(async role => {
    const path = '/src/hooks/useSessionStore.ts'; const { useSessionStore } = await import(path);
    useSessionStore.getState().signIn({ id: role === 'EMPLOYEE' ? 'EMP-00421' : 'USR-SUP-001', role, name: role === 'EMPLOYEE' ? 'Arjun Mehta' : 'Leila Haddad', title: role, email: 'demo@example.test' });
  }, role);
  await page.goto(role === 'EMPLOYEE' ? '/my/breaks' : '/breaks');
}
async function scenario(page: Page, name: string, value: boolean) { await page.evaluate(async ({ name, value }) => { const path = '/src/features/break-management/mock.ts'; const { breakScenarios } = await import(path); breakScenarios[name] = value; }, { name, value }); }
async function confirm(page: Page, title: string, reason?: string) {
  const dialog = page.getByRole('dialog'); await expect(dialog.getByRole('button', { name: 'Review decision' })).toBeEnabled();
  if (reason) await dialog.getByLabel('Reason (required)').fill(reason);
  await dialog.getByRole('button', { name: 'Review decision' }).click(); await dialog.getByRole('button', { name: `Confirm ${title}`, exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
async function exhaust(page: Page) {
  await page.evaluate(async () => { const path = '/src/features/break-management/mock.ts'; const { mockBreakApi, breakScenarios } = await import(path); const s = await mockBreakApi.snapshot(); await mockBreakApi.execute({ kind: 'start', policyVersion: s.policy.version, shiftDate: s.shift.date }, crypto.randomUUID()); const a = (await mockBreakApi.snapshot()).active; breakScenarios.now = Date.now() + 61 * 60000; await mockBreakApi.execute({ kind: 'end', id: a.id, version: a.version }, crypto.randomUUID()); });
  // Advance the browser's fixture time too so state remains deterministic on navigation/reload.
  await page.clock.setFixedTime(new Date('2026-10-11T05:31:00Z')); await page.reload();
  await expect(page.getByRole('button', { name: 'Start Break', exact: true })).toBeDisabled();
}
async function pendingRequest(page: Page) { await exhaust(page); await page.getByRole('button', { name: 'Request Extra Break', exact: true }).click(); await confirm(page, 'Request Extra Break', 'Personal need'); await expect(page.getByText('Pending', { exact: true })).toBeVisible(); }
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-11T04:30:00Z')); await page.goto('/login');
  await page.evaluate(async () => { const path = '/src/features/break-management/mock.ts'; const { resetBreakDemo } = await import(path); resetBreakDemo(); });
  await signIn(page);
});
test('employee start and end require confirmations; reload and re-login preserve the active session', async ({ page }) => {
  await page.getByRole('button', { name: 'Start Break', exact: true }).click(); await expect(page.getByRole('button', { name: 'End Break', exact: true })).not.toBeVisible(); await confirm(page, 'Start Break');
  await expect(page.getByRole('button', { name: 'End Break', exact: true })).toBeEnabled(); await page.reload(); await expect(page.getByRole('button', { name: 'End Break', exact: true })).toBeEnabled();
  await page.evaluate(async () => { const path = '/src/hooks/useSessionStore.ts'; const { useSessionStore } = await import(path); useSessionStore.getState().signOut(); }); await page.goto('/login'); await signIn(page);
  await page.getByRole('button', { name: 'End Break', exact: true }).click(); await confirm(page, 'End Break'); await expect(page.getByRole('button', { name: 'Start Break', exact: true })).toBeEnabled();
});
test('exhausted allowance allows a request and permitted withdrawal', async ({ page }) => { await pendingRequest(page); await page.getByRole('button', { name: 'Withdraw request' }).click(); await confirm(page, 'Withdraw Request'); await expect(page.getByText('Withdrawn', { exact: true })).toBeVisible(); });
for (const decision of ['Approved', 'Rejected']) test(`supervisor ${decision.toLowerCase()} request with required reason`, async ({ page }) => {
  await pendingRequest(page); await signIn(page, 'SUPERVISOR'); await page.getByRole('button', { name: 'Review request' }).click();
  await expect(page.getByRole('button', { name: 'Review decision' })).toBeEnabled(); await page.getByLabel('Decision', { exact: true }).selectOption(decision); await page.getByRole('button', { name: 'Review decision' }).click(); await expect(page.getByRole('alert')).toContainText('3 character');
  await confirm(page, 'Review Extra-break Request', 'Queue coverage reviewed'); await expect(page.locator('li').filter({ hasText: 'Queue coverage reviewed' }).locator('span').filter({ hasText: new RegExp(`^${decision}$`) })).toBeVisible();
  await signIn(page); await expect(page.getByRole('button', { name: 'Start Break', exact: true }))[decision === 'Approved' ? 'toBeEnabled' : 'toBeDisabled']();
});
test('supervisor corrects a forgotten timer without overwriting original start', async ({ page }) => {
  await page.getByRole('button', { name: 'Start Break', exact: true }).click(); await confirm(page, 'Start Break'); await page.clock.setFixedTime(new Date('2026-10-11T04:40:00Z')); await signIn(page, 'SUPERVISOR');
  const row = page.getByRole('row').filter({ hasText: 'ACTIVE' }); await row.getByRole('button', { name: 'View session for Arjun Mehta' }).click(); await page.getByRole('button', { name: 'Correct timer' }).click(); await confirm(page, 'Correct Forgotten Timer', 'Employee forgot to stop timer');
  await expect(page.getByRole('table').getByText('CORRECTED', { exact: true })).toBeVisible(); await page.getByRole('row').filter({ hasText: 'CORRECTED' }).getByRole('button', { name: 'View session for Arjun Mehta' }).click(); await expect(page.getByRole('dialog').getByText('STARTED', { exact: true })).toBeVisible(); await expect(page.getByText('Employee forgot to stop timer')).toBeVisible();
});
for (const outcome of ['Confirmed', 'Not a policy violation', 'Needs further review']) test(`overrun review: ${outcome}`, async ({ page }) => {
  await signIn(page, 'SUPERVISOR'); await page.getByRole('button', { name: 'View session for Arjun Mehta' }).click(); await page.getByRole('button', { name: 'Review overrun' }).click(); await expect(page.getByLabel('Review outcome')).toBeVisible(); await page.getByLabel('Review outcome').selectOption(outcome); await confirm(page, 'Review Overrun', 'Evidence and operational context reviewed');
  await expect(page.getByRole('cell', { name: outcome, exact: true })).toBeVisible(); await page.getByRole('button', { name: 'View session for Arjun Mehta' }).click(); await expect(page.getByRole('dialog')).toContainText(outcome === 'Confirmed' ? 'no case was created' : 'Not counted toward disciplinary escalation');
});
test('active policy change refreshes allowance and preserves active timer', async ({ page }) => {
  await page.getByRole('button', { name: 'Start Break', exact: true }).click(); await confirm(page, 'Start Break'); await signIn(page, 'SUPERVISOR'); await page.getByRole('link', { name: 'Policy settings' }).click(); await page.getByRole('button', { name: 'Configure policy' }).click();
  await expect(page.getByLabel('Standard allowance (minutes)')).toBeVisible(); await page.getByLabel('Standard allowance (minutes)').fill('90'); await page.getByLabel('Effective timestamp (ISO 8601 with timezone)').fill('2026-10-11T04:30:00Z'); await confirm(page, 'Update Break Policy');
  await signIn(page); await expect(page.getByText('90:00', { exact: true }).first()).toBeVisible(); await expect(page.getByRole('button', { name: 'End Break', exact: true })).toBeVisible(); await expect(page.getByText(/Policy v2 effective/)).toBeVisible();
});
test('scheduled shift-end closure uses authoritative shift-end timestamp', async ({ page }) => {
  await page.getByRole('button', { name: 'Start Break', exact: true }).click(); await confirm(page, 'Start Break'); await page.clock.setFixedTime(new Date('2026-10-11T14:30:00Z')); await page.reload(); await expect(page.getByText('SHIFT END', { exact: true })).toBeVisible();
  await page.getByRole('row').filter({ hasText: 'SHIFT END' }).getByRole('button', { name: 'View session for Arjun Mehta' }).click(); await expect(page.getByRole('dialog')).toContainText('19:30:00'); await expect(page.getByRole('dialog')).toContainText('SYSTEM');
});
test('stale supervisor review refreshes the record and requires renewed confirmation', async ({ page }) => {
  await signIn(page, 'SUPERVISOR'); await page.getByRole('button', { name: 'View session for Arjun Mehta' }).click(); await page.getByRole('button', { name: 'Review overrun' }).click(); await expect(page.getByRole('button', { name: 'Review decision' })).toBeEnabled(); await page.getByLabel('Reason (required)').fill('First reviewer reason'); await page.getByRole('button', { name: 'Review decision' }).click();
  await page.evaluate(async () => { const path = '/src/features/break-management/mock.ts'; const { mockBreakApi } = await import(path); const r = await mockBreakApi.session('BR-SEED-OVERRUN'); await mockBreakApi.execute({ kind: 'review', id: r.id, version: r.version, outcome: 'Confirmed', reason: 'Concurrent review' }, crypto.randomUUID()); });
  await page.getByRole('button', { name: 'Confirm Review Overrun' }).click(); await expect(page.getByRole('dialog')).toContainText('Another authorized user changed the record'); await expect(page.getByLabel('Reason (required)')).toHaveValue('First reviewer reason');
});
test('revocation removes data and actions from an open page', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Start Break', exact: true })).toBeEnabled(); await page.evaluate(async () => { const path = '/src/features/break-management/mock.ts'; const { breakScenarios } = await import(path); breakScenarios.revoked.add('EMP-00421'); }); await page.getByRole('button', { name: 'Refresh', exact: true }).click(); await expect(page.getByText('Your break access has been revoked.')).toBeVisible(); await expect(page.getByRole('button', { name: 'Start Break', exact: true })).not.toBeVisible();
});
test('network failure has no false success and recovery requires refresh', async ({ page }) => {
  await page.getByRole('button', { name: 'Start Break', exact: true }).click(); await expect(page.getByRole('button', { name: 'Review decision' })).toBeEnabled(); await page.getByRole('button', { name: 'Review decision' }).click(); await scenario(page, 'offline', true); await page.getByRole('button', { name: 'Confirm Start Break' }).click(); await expect(page.getByRole('dialog')).not.toBeVisible(); await expect(page.getByText(/Demo connection failed/).first()).toBeVisible(); await expect(page.getByText(/Start Break confirmed/)).not.toBeVisible();
});
test('malformed data and runtime disable render controlled unavailable states', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Start Break', exact: true })).toBeEnabled(); await scenario(page, 'malformed', true); await page.getByRole('button', { name: 'Refresh', exact: true }).click(); await expect(page.getByText(/Malformed demo response/)).toBeVisible(); await scenario(page, 'malformed', false); await scenario(page, 'disabled', true); await page.getByRole('button', { name: 'Refresh access' }).click(); await expect(page.getByText('Break Management was disabled.')).toBeVisible();
});
test('report filters carry into authorized CSV and XLSX downloads', async ({ page }) => {
  await signIn(page, 'SUPERVISOR'); await page.getByRole('link', { name: 'History & reports' }).click(); await page.getByLabel('Employee name or ID').fill('nonexistent'); await expect(page.getByText('No break sessions match this view.')).toBeVisible();
  await page.getByRole('button', { name: 'Request CSV' }).click(); await expect(page.getByRole('link', { name: 'Download CSV' })).toBeVisible(); const download = await page.getByRole('link', { name: 'Download CSV' }).getAttribute('href'); expect(decodeURIComponent(download!)).not.toContain('EMP-00421');
  await page.getByRole('button', { name: 'Request XLSX' }).click(); await expect(page.getByRole('link', { name: 'Download XLSX' })).toHaveAttribute('href', /spreadsheetml.sheet;base64,UEs/);
});
test('offline browser disables new employee actions without queuing', async ({ page, context }) => { await expect(page.getByRole('button', { name: 'Start Break', exact: true })).toBeEnabled(); await context.setOffline(true); await expect(page.getByRole('button', { name: 'Start Break', exact: true })).toBeDisabled(); await expect(page.getByText(/No operations are queued/i)).toBeVisible(); });
test('uncertain committed mutation is reconciled without a false success or duplicate', async ({ page }) => {
  await page.getByRole('button', { name: 'Start Break', exact: true }).click(); await expect(page.getByRole('button', { name: 'Review decision' })).toBeEnabled(); await page.getByRole('button', { name: 'Review decision' }).click(); await scenario(page, 'uncertain', true); await page.getByRole('button', { name: 'Confirm Start Break' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('response lost'); await expect(page.getByText('Start Break confirmed', { exact: true })).not.toBeVisible(); await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(page.getByRole('button', { name: 'End Break', exact: true })).toBeVisible();
  const active = await page.evaluate(async () => { const path = '/src/features/break-management/mock.ts'; const { mockBreakApi } = await import(path); return (await mockBreakApi.snapshot()).history.filter((s: { status: string }) => s.status === 'ACTIVE').length; }); expect(active).toBe(1);
});
test('keyboard focus stays in confirmation dialog and returns on cancellation', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Start Break', exact: true }); await trigger.click(); await expect(page.getByRole('button', { name: 'Review decision' })).toBeEnabled(); await page.getByRole('button', { name: 'Close dialog' }).focus(); await page.keyboard.press('Shift+Tab'); await expect(page.getByRole('button', { name: 'Review decision' })).toBeFocused(); await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Close dialog' })).toBeFocused(); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible(); await expect(trigger).toBeFocused();
});
test('night session retains scheduled start date after midnight', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-11T18:00:00Z'));
  await page.evaluate(async () => { const path = '/src/features/break-management/mock.ts'; const { breakScenarios } = await import(path); breakScenarios.shift = 'NIGHT'; }); await page.getByRole('button', { name: 'Refresh', exact: true }).click(); await expect(page.getByText(/NIGHT · Scheduled shift date 2026-10-11/)).toBeVisible();
  await page.getByRole('button', { name: 'Start Break', exact: true }).click(); await confirm(page, 'Start Break'); await page.clock.setFixedTime(new Date('2026-10-12T00:00:00Z')); await page.getByRole('button', { name: 'Refresh', exact: true }).click(); await expect(page.getByRole('button', { name: 'End Break', exact: true })).toBeEnabled(); await expect(page.getByText(/NIGHT · Scheduled shift date 2026-10-11/)).toBeVisible();
});
test('production build blocks the disabled feature and hides navigation', async ({ page }) => {
  await page.goto('http://127.0.0.1:5179/login'); await page.evaluate(() => localStorage.setItem('relay-wfm-session', JSON.stringify({ state: { user: { id: 'EMP-00421', role: 'EMPLOYEE', name: 'Arjun Mehta', title: 'Employee', email: 'demo@example.test' } }, version: 0 })));
  await page.goto('http://127.0.0.1:5179/my/breaks'); await expect(page.getByText('Break Management is disabled. Other application routes remain available.')).toBeVisible(); await expect(page.getByRole('link', { name: 'Break Management', exact: true })).not.toBeVisible(); await expect(page.getByRole('button', { name: 'Start Break', exact: true })).not.toBeVisible();
});
