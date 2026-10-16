import { beforeEach, describe, expect, it } from 'vitest';
import { setAuthContext as setApiAuth } from '../../../services/mock/core';
import { mockBreakApi, breakScenarios, resetBreakDemo } from '../mock';
import { breakApi } from '../api';
import { defaultFilters, snapshotSchema, sessionSchema, commandSchema } from '../contracts';
import { BreakError, businessTime, duration, displayElapsed, normalizeBreakError } from '../utils';
import { resolveBreakConfig } from '../config';
import { demoWorkbook } from '../mock-workbook';

const employee = () => setApiAuth({ userId: 'EMP-00421', role: 'EMPLOYEE', name: 'Arjun Mehta' });
const supervisor = (id = 'USR-SUP-001') => setApiAuth({ userId: id, role: 'SUPERVISOR', name: 'Leila Haddad' });
const execute = (c: Parameters<typeof mockBreakApi.execute>[0], key: string = crypto.randomUUID()) => mockBreakApi.execute(c, key);
async function start() { const s = await mockBreakApi.snapshot(); await execute({ kind: 'start', policyVersion: s.policy.version, shiftDate: s.shift?.date ?? '' }); return (await mockBreakApi.snapshot()).active!; }
async function exhaust() { const active = await start(); breakScenarios.now! += 61 * 60000; await execute({ kind: 'end', id: active.id, version: active.version }); }
beforeEach(() => { employee(); breakScenarios.now = Date.parse('2026-10-11T04:30:00Z'); resetBreakDemo(); });
describe('authoritative break contracts and formatting', () => {
  it('validates snapshots and refuses missing or ambiguous server timestamps', async () => {
    const s = await mockBreakApi.snapshot(); expect(snapshotSchema.safeParse(s).success).toBe(true);
    expect(snapshotSchema.safeParse({ ...s, serverNow: '2026-10-11T10:00:00' }).success).toBe(false);
    expect(snapshotSchema.safeParse({ ...s, allowance: { totalSeconds: -1 } }).success).toBe(false);
    expect(snapshotSchema.safeParse({ ...s, timezone: 'Invented/Zone' }).success).toBe(false);
  });
  it('formats business time and never guesses invalid dates', () => {
    expect(businessTime('bad', 'Asia/Colombo')).toContain('Unavailable'); expect(businessTime('2026-10-11T00:00:00', 'Asia/Colombo')).toContain('Unavailable');
    expect(businessTime('2026-10-11T00:00:00Z', 'Asia/Colombo')).toContain('05:30'); expect(duration(3600)).toBe('60:00'); expect(duration(NaN)).toBe('Unavailable');
  });
  it('normalizes uncertainty, malformed response and known errors', () => {
    expect(normalizeBreakError(new TypeError('fetch failed')).uncertain).toBe(true);
    expect(normalizeBreakError(new BreakError('FORBIDDEN', 'Denied', 403)).status).toBe(403);
    const invalid = snapshotSchema.safeParse({}); expect(!invalid.success && normalizeBreakError(invalid.error).code).toBe('INVALID_RESPONSE');
  });
  it('caps display interpolation at scheduled end without relying on client wall clock', () => {
    expect(displayElapsed(30, 100, 10100, '2026-10-11T00:00:00Z', '2026-10-11T00:00:05Z', true)).toBe(35);
    expect(displayElapsed(30, 100, 10100, '2026-10-11T00:00:00Z', '2026-10-11T00:00:05Z', false)).toBe(30);
  });
  it('fails closed for production mock, disabled config and production default', () => {
    expect(resolveBreakConfig({ PROD: true }).enabled).toBe(false);
    expect(resolveBreakConfig({ PROD: true, VITE_BREAK_ENABLED: 'true', VITE_BREAK_ADAPTER: 'mock' }).enabled).toBe(false);
    expect(resolveBreakConfig({ PROD: false, VITE_BREAK_ENABLED: 'false' }).enabled).toBe(false);
    expect(resolveBreakConfig({ PROD: true, VITE_BREAK_ENABLED: 'true', VITE_BREAK_ADAPTER: 'real' }).enabled).toBe(true);
  });
  it('requires reasons and refuses inconsistent escalation', async () => {
    expect(commandSchema.safeParse({ kind: 'review', id: 'x', version: 1, outcome: 'Confirmed', reason: ' ' }).success).toBe(false);
    const s = (await mockBreakApi.snapshot()).history[0]; expect(sessionSchema.safeParse({ ...s, escalation: { eligible: true, caseId: null, message: '' } }).success).toBe(false);
  });
});
describe('development adapter behavior', () => {
  it('starts once with idempotency and preserves one active session across identity changes', async () => {
    const s = await mockBreakApi.snapshot(); const command = { kind: 'start' as const, policyVersion: s.policy.version, shiftDate: s.shift!.date };
    await execute(command, 'same'); await execute(command, 'same'); expect((await mockBreakApi.snapshot()).history.filter(s => s.status === 'ACTIVE')).toHaveLength(1);
    await expect(execute(command)).rejects.toMatchObject({ status: 409 }); supervisor(); employee(); expect((await mockBreakApi.snapshot()).active).not.toBeNull();
  });
  it('shares consumed allowance between sessions and blocks exhausted starts', async () => {
    const first = await start(); breakScenarios.now! += 20 * 60000; await execute({ kind: 'end', id: first.id, version: first.version });
    const second = await start(); breakScenarios.now! += 40 * 60000; await execute({ kind: 'end', id: second.id, version: second.version });
    const s = await mockBreakApi.snapshot(); expect(s.allowance?.consumedSeconds).toBe(3600); expect(s.allowance?.remainingSeconds).toBe(0); expect(s.actions.start).toBe(false); expect(s.actions.request).toBe(true);
  });
  it('supports extra requests, rejection reason, approved duration, and withdrawal', async () => {
    await exhaust(); await execute({ kind: 'request', minutes: 5, reason: 'Personal need' }); const r = (await mockBreakApi.snapshot()).requests[0];
    supervisor(); await expect(execute({ kind: 'decide', id: r.id, version: r.version, minutes: 5, decision: 'Rejected', reason: '' })).rejects.toThrow();
    await execute({ kind: 'decide', id: r.id, version: r.version, minutes: 5, decision: 'Rejected', reason: 'Queue coverage unavailable' });
    employee(); expect((await mockBreakApi.snapshot()).requests[0].status).toBe('Rejected');
    await execute({ kind: 'request', minutes: 5, reason: 'Personal need' }); const pending = (await mockBreakApi.snapshot()).requests[0]; await execute({ kind: 'withdraw', id: pending.id, version: pending.version }); expect((await mockBreakApi.snapshot()).requests[0].status).toBe('Withdrawn');
    await execute({ kind: 'request', minutes: 5, reason: 'Personal need' }); const next = (await mockBreakApi.snapshot()).requests[0]; supervisor(); await execute({ kind: 'decide', id: next.id, version: next.version, minutes: 5, decision: 'Approved', reason: 'Coverage arranged' });
    employee(); const s = await mockBreakApi.snapshot(); expect(s.allowance?.remainingSeconds).toBe(0); expect(s.actions.start).toBe(true); await start(); expect((await mockBreakApi.snapshot()).history.some(s => s.overrun)).toBe(true);
  });
  it('expires pending requests and restricts cross-user access', async () => {
    await exhaust(); await execute({ kind: 'request', minutes: 5, reason: 'Personal need' }); const r = (await mockBreakApi.snapshot()).requests[0];
    setApiAuth({ userId: 'FL-00124', role: 'FREELANCER', name: 'Sofia Reyes' }); await expect(mockBreakApi.request(r.id)).rejects.toMatchObject({ status: 403 });
    employee(); breakScenarios.now! += 31 * 60000; expect((await mockBreakApi.snapshot()).requests[0].status).toBe('Expired');
  });
  it('separates monitoring visibility from actions and policy/export permission', async () => {
    supervisor('read-only-demo'); const s = await mockBreakApi.snapshot(); expect(s.capabilities.monitor).toBe(true); expect(s.capabilities.policy).toBe(false); expect(s.capabilities.export).toBe(false);
    const m = await mockBreakApi.monitor(defaultFilters); expect(m.sessions[0].actions.review).toBe(false);
    await expect(mockBreakApi.export(defaultFilters, 'CSV', 'x')).rejects.toMatchObject({ status: 403 });
  });
  it('preserves original events on correction and rejects stale revisions', async () => {
    const a = await start(); breakScenarios.now! += 10 * 60000; supervisor(); await execute({ kind: 'correct', id: a.id, version: a.version, endedAt: new Date(breakScenarios.now! - 60000).toISOString(), reason: 'Forgot to stop timer' });
    const s = await mockBreakApi.session(a.id); expect(s.events.map(e => e.action)).toEqual(['STARTED', 'CORRECTED']); expect(s.startedAt).toBe(a.startedAt);
    await expect(execute({ kind: 'correct', id: a.id, version: a.version, endedAt: new Date(breakScenarios.now!).toISOString(), reason: 'Concurrent correction' })).rejects.toMatchObject({ status: 409 });
  });
  for (const outcome of ['Confirmed', 'Not a policy violation', 'Needs further review'] as const) it(`reviews ${outcome} with correct escalation eligibility`, async () => {
    supervisor(); const s = (await mockBreakApi.monitor(defaultFilters)).sessions[0]; await execute({ kind: 'review', id: s.id, version: s.version, outcome, reason: 'Evidence reviewed carefully' });
    const result = await mockBreakApi.session(s.id); expect(result.review?.outcome).toBe(outcome); expect(result.escalation.eligible).toBe(outcome === 'Confirmed'); expect(result.escalation.caseId).toBeNull();
  });
  it('refreshes policy allowance during an active shift without changing original events', async () => {
    const active = await start(); breakScenarios.now! += 20 * 60000; supervisor(); const s = await mockBreakApi.snapshot(); await execute({ kind: 'policy', policy: { ...s.policy, allowanceMinutes: 90, effectiveAt: new Date(breakScenarios.now!).toISOString() } });
    employee(); const next = await mockBreakApi.snapshot(); expect(next.allowance?.remainingSeconds).toBe(70 * 60); expect(next.active?.events).toEqual(active.events); expect(next.notices[0]).toContain('90 minutes');
  });
  it('closes night shifts at exact scheduled end while retaining start date', async () => {
    breakScenarios.shift = 'NIGHT'; breakScenarios.now = Date.parse('2026-10-11T18:00:00Z'); const s = await mockBreakApi.snapshot(); expect(s.shift?.date).toBe('2026-10-11'); const a = await start();
    breakScenarios.now = Date.parse('2026-10-12T03:00:00Z'); const result = await mockBreakApi.session(a.id); expect(result.status).toBe('SHIFT_END'); expect(result.endedAt).toBe(a.shiftEnd); expect(result.shiftDate).toBe('2026-10-11'); expect(result.events.at(-1)?.actor).toBe('SYSTEM');
  });
  it('reports unresolved closures instead of continuing a display timer indefinitely', async () => {
    const a = await start(); breakScenarios.unresolved = true; breakScenarios.now = Date.parse(a.shiftEnd) + 60000; const s = await mockBreakApi.session(a.id); expect(s.status).toBe('UNRESOLVED'); expect(s.endedAt).toBeNull(); supervisor(); expect((await mockBreakApi.session(a.id)).actions.correct).toBe(true);
  });
  it('never treats network failure or lost commit response as success', async () => {
    breakScenarios.offline = true; await expect(start()).rejects.toMatchObject({ uncertain: true }); breakScenarios.offline = false; expect((await mockBreakApi.snapshot()).active).toBeNull();
    breakScenarios.uncertain = true; await expect(start()).rejects.toMatchObject({ uncertain: true }); expect((await mockBreakApi.snapshot()).active).not.toBeNull();
  });
  it('hides data on revocation, rejects malformed data, and handles feature disable', async () => {
    breakScenarios.revoked.add('EMP-00421'); await expect(mockBreakApi.snapshot()).rejects.toMatchObject({ status: 403 }); breakScenarios.revoked.clear();
    breakScenarios.malformed = true; await expect(breakApi.snapshot()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' }); breakScenarios.malformed = false;
    breakScenarios.disabled = true; await expect(mockBreakApi.snapshot()).rejects.toMatchObject({ code: 'DISABLED' });
  });
  it('paginates and exports only filtered authorized records in CSV and genuine XLSX', async () => {
    supervisor(); const m = await mockBreakApi.monitor({ ...defaultFilters, search: 'nonexistent' }); expect(m.total).toBe(0);
    const empty = await mockBreakApi.export({ ...defaultFilters, search: 'nonexistent' }, 'CSV', 'empty'); expect(decodeURIComponent(empty.downloadUrl!)).not.toContain('EMP-00421');
    const job = await mockBreakApi.export(defaultFilters, 'XLSX', 'xlsx'); expect(job.status).toBe('Ready'); const bytes = atob(job.downloadUrl!.split(',')[1]); expect(bytes.slice(0, 2)).toBe('PK'); expect(bytes).toContain('xl/worksheets/sheet1.xml');
    expect(demoWorkbook([['=danger']])).toContain('base64');
  });
});
