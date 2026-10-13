import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attendanceApi, attendanceStatus, dailyAttendanceRows } from '../../services/mock/attendanceHandlers';
import { db } from '../../services/mock/db';
import { mockConfig, respond, setAuthContext } from '../../services/mock/core';
import type { Handover } from '../../types/domain';
import type { HandoverSubmission } from '../../types/attendance';
import { businessDate, liveShift, punctuality, shiftStart } from '../../utils/shiftTime';
import { attendanceCsv, attendanceWorkbook } from '../../utils/attendanceExport';

const original = structuredClone({ handovers: db.handovers, employees: db.employees, freelancers: db.freelancers, laptops: db.laptops, incidents: db.incidents, notifications: db.notifications, audit: db.audit });
const date = '2026-10-13';
const login = (id: string, role: 'EMPLOYEE' | 'FREELANCER' | 'SUPERVISOR' = 'EMPLOYEE') => setAuthContext({ userId: id, role, name: id });
const stamp = (time: string) => `${date}T${time}+05:30`;
function submit(direction: 'INCOMING' | 'OUTGOING', time = '19:30:00', extra: Partial<HandoverSubmission> = {}) {
  return attendanceApi.submitHandoverConfirmation('HO-TEST', { direction, deviceTimestamp: stamp(time), timezoneOffsetMinutes: -330, notes: '', equipmentIssue: '', ...extra });
}
function fixture(): Handover {
  return { id: 'HO-TEST', assetId: 'LAP-TEST', workstationId: 'WS-KANE1-DP-99', poolId: 'POOL-KANE1-DP', platformCode: 'KANE-1', dept: 'DP', outgoingId: 'EMP-OUT', outgoingName: 'Outgoing worker', incomingId: 'EMP-IN', incomingName: 'Incoming worker', outgoingShift: 'MORNING', incomingShift: 'NIGHT', scheduledAt: shiftStart(date, 'NIGHT').toISOString(), status: 'PENDING', outgoingConfirmedAt: null, receivedAt: null, checklist: null, incidentId: null, revision: 0, attendanceTracked: true };
}
beforeEach(() => {
  mockConfig.latencyMs = 0; login('EMP-IN');
  const base = db.employees[0];
  db.employees.push({ ...structuredClone(base), id: 'EMP-IN', name: 'Incoming worker', email: 'incoming@example.com', platformCode: 'KANE-1', categoryCode: 'KANE', poolId: 'POOL-KANE1-DP', dept: 'DP', shift: 'NIGHT', status: 'ACTIVE', qualifiedForProduction: true, slot: 99, currentWorkstationId: null }, { ...structuredClone(base), id: 'EMP-OUT', name: 'Outgoing worker', platformCode: 'KANE-1', categoryCode: 'KANE', poolId: 'POOL-KANE1-DP', dept: 'DP', shift: 'MORNING', status: 'ACTIVE', qualifiedForProduction: true, slot: 99, currentWorkstationId: 'WS-KANE1-DP-99' });
  db.laptops.push({ ...structuredClone(db.laptops[0]), assetId: 'LAP-TEST', workstationId: 'WS-KANE1-DP-99', poolId: 'POOL-KANE1-DP', platformCode: 'KANE-1', dept: 'DP', currentUserId: 'EMP-OUT', currentUserName: 'Outgoing worker', currentShift: 'MORNING', status: 'ASSIGNED', condition: 'GOOD', openIncidentId: null });
  db.handovers.push(fixture());
});
afterEach(() => { vi.useRealTimers(); for (const key of Object.keys(original) as (keyof typeof original)[]) { const array = db[key] as unknown[]; array.splice(0, array.length, ...structuredClone(original[key])); } setAuthContext(null); mockConfig.latencyMs = 320; });

describe('shift clock and time policy', () => {
  it('handles both boundaries and night shifts across midnight', () => {
    expect(liveShift(new Date(stamp('07:29:59')))).toMatchObject({ shift: 'NIGHT', date: '2026-10-12', remainingSeconds: 1 });
    expect(liveShift(new Date(stamp('07:30:00')))).toMatchObject({ shift: 'MORNING', remainingSeconds: 43200, progress: 0 });
    expect(liveShift(new Date(stamp('19:30:00')))).toMatchObject({ shift: 'NIGHT', remainingSeconds: 43200 });
    expect(businessDate('2026-10-13T20:00:00Z')).toBe('2026-10-14');
  });
  it('treats the exact grace deadline as on time and the following second as late', () => {
    expect(punctuality(stamp('19:45:00'), stamp('19:30:00'))).toBe('ON_TIME');
    expect(punctuality(stamp('19:45:01'), stamp('19:30:00'))).toBe('LATE');
  });
});

describe('handover-derived attendance', () => {
  it('accepts receipt first, waits for the counterpart, and uses receipt time for punctuality', async () => {
    const incoming = await submit('INCOMING', '19:29:00'); expect(attendanceStatus(incoming)).toBe('PENDING_COUNTERPART');
    login('EMP-OUT'); const h = await submit('OUTGOING', '19:50:00'); expect(attendanceStatus(h)).toBe('ON_TIME');
    expect(db.laptops.find(l => l.assetId === 'LAP-TEST')?.currentUserId).toBe('EMP-IN');
    expect(dailyAttendanceRows(date).find(r => r.workerId === 'EMP-IN')).toMatchObject({ status: 'ON_TIME', receivedAt: new Date(stamp('19:29:00')).toISOString() });
  });
  it('accepts outgoing first and marks a late incoming receipt', async () => {
    login('EMP-OUT'); await submit('OUTGOING', '19:20:00'); login('EMP-IN'); expect(attendanceStatus(await submit('INCOMING', '19:46:00'))).toBe('LATE');
  });
  it('allows the exact opening boundary but rejects earlier receipt and receipt after shift end', async () => {
    await expect(submit('INCOMING', '19:14:59')).rejects.toMatchObject({ code: 'TOO_EARLY' });
    await expect(submit('INCOMING', '19:30:00', { deviceTimestamp: '2026-10-14T07:30:00+05:30' })).rejects.toMatchObject({ code: 'SHIFT_ENDED' });
    expect((await submit('INCOMING', '19:15:00')).receivedAt).toBe(new Date(stamp('19:15:00')).toISOString());
  });
  it('requires a reason for self-confirmation and identifies the exception', async () => {
    await expect(submit('INCOMING', '19:30:00', { selfConfirmationReason: '' })).rejects.toMatchObject({ code: 'VALIDATION' });
    const h = await submit('INCOMING', '19:30:00', { selfConfirmationReason: 'Outgoing worker left unexpectedly' }); expect(attendanceStatus(h)).toBe('ON_TIME'); expect(h.outgoingConfirmedAt).toBeNull();
    expect(dailyAttendanceRows(date).find(r => r.workerId === 'EMP-IN')?.exceptionReason).toBe('Outgoing worker left unexpectedly');
  });
  it('keeps equipment issues separate from attendance and opens a supervisor incident', async () => {
    await submit('INCOMING', '19:30:00', { equipmentIssue: 'Charger missing' }); login('EMP-OUT'); const h = await submit('OUTGOING');
    expect(h.status).toBe('ISSUE_REPORTED'); expect(attendanceStatus(h)).toBe('ON_TIME'); expect(db.incidents.some(i => i.id === h.incidentId)).toBe(true); expect(db.notifications.some(n => n.link === '/incidents' && n.body.includes('Charger missing'))).toBe(true);
  });
  it('can self-confirm a pending receipt later without changing the original receipt evidence', async () => {
    const original = await submit('INCOMING', '19:29:00');
    const confirmed = await submit('INCOMING', '19:50:00', { selfConfirmationReason: 'Outgoing worker is unavailable' });
    expect(confirmed.receivedAt).toBe(original.receivedAt); expect(confirmed.incomingConfirmation).toEqual(original.incomingConfirmation); expect(confirmed.selfConfirmation?.deviceTimestamp).toBe(new Date(stamp('19:50:00')).toISOString()); expect(attendanceStatus(confirmed)).toBe('ON_TIME');
  });
  it('enforces identity, prevents one account confirming both sides, and supports idempotent retries', async () => {
    await expect(submit('OUTGOING')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const saved = await submit('INCOMING'); const retried = await submit('INCOMING'); expect(retried.revision).toBe(saved.revision);
    await expect(submit('INCOMING', '19:31:00')).rejects.toMatchObject({ code: 'ALREADY_CONFIRMED' });
    login('SUP', 'SUPERVISOR'); await expect(submit('OUTGOING')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('works for freelancer identities', async () => {
    const h = db.handovers.find(h => h.id === 'HO-TEST')!; h.incomingId = 'FL-TEST';
    db.freelancers.push({ ...structuredClone(db.freelancers[0]), id: 'FL-TEST', name: 'Freelancer', dept: 'DP' });
    login('FL-TEST', 'FREELANCER'); await submit('INCOMING', '19:30:00', { selfConfirmationReason: 'No outgoing worker available' });
    expect(dailyAttendanceRows(date).find(r => r.workerId === 'FL-TEST')?.workerType).toBe('FREELANCER');
  });
  it('omits workers with no submission and splits night receipt/outgoing by calendar date', async () => {
    expect(dailyAttendanceRows(date).some(r => r.workerId === 'EMP-IN')).toBe(false);
    await submit('INCOMING', '19:30:00', { selfConfirmationReason: 'Outgoing worker unavailable' });
    const next = fixture(); next.id = 'HO-NEXT'; next.scheduledAt = shiftStart('2026-10-14', 'MORNING').toISOString(); next.outgoingId = 'EMP-IN'; next.outgoingName = 'Incoming worker'; next.incomingId = 'EMP-OUT'; next.incomingName = 'Outgoing worker'; next.outgoingShift = 'NIGHT'; next.incomingShift = 'MORNING'; db.handovers.push(next);
    await attendanceApi.submitHandoverConfirmation(next.id, { direction: 'OUTGOING', deviceTimestamp: '2026-10-14T07:20:00+05:30', timezoneOffsetMinutes: -330, notes: 'Next morning notes', equipmentIssue: '' });
    const receipt = dailyAttendanceRows(date).find(r => r.workerId === 'EMP-IN')!; const outgoing = dailyAttendanceRows('2026-10-14').find(r => r.workerId === 'EMP-IN')!;
    expect(receipt.outgoingAt).toBeNull(); expect(outgoing.receivedAt).toBeNull(); expect(outgoing).toMatchObject({ shift: 'NIGHT', shiftDate: date, eventDate: '2026-10-14', status: 'ON_TIME' });
  });
  it('preserves original evidence and revision checks on supervisor corrections', async () => {
    const h = await submit('INCOMING', '19:30:00', { selfConfirmationReason: 'Outgoing person unavailable' }); login('SUP', 'SUPERVISOR');
    const input = { assetId: h.assetId, outgoingId: h.outgoingId, incomingId: h.incomingId, outgoingConfirmedAt: null, receivedAt: stamp('19:46:00'), reason: 'Device clock was incorrect', expectedRevision: h.revision! };
    const corrected = await attendanceApi.correctAttendanceHandover(h.id, input);
    expect(corrected.incomingConfirmation?.deviceTimestamp).toBe(new Date(stamp('19:30:00')).toISOString()); expect(corrected.corrections?.[0].previous.receivedAt).toBe(h.receivedAt); expect(attendanceStatus(corrected)).toBe('LATE');
    await expect(attendanceApi.correctAttendanceHandover(h.id, input)).rejects.toMatchObject({ code: 'CONCURRENCY_CONFLICT' });
    login('EMP-IN'); await expect(attendanceApi.correctAttendanceHandover(h.id, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('rejects pending requests after worker switching without performing their mutation', async () => {
    mockConfig.latencyMs = 20; const effect = vi.fn(); const request = respond(effect); login('EMP-OUT'); await expect(request).rejects.toMatchObject({ code: 'SESSION_CHANGED' }); expect(effect).not.toHaveBeenCalled();
  });
  it('returns only a worker’s own tasks and history', async () => {
    await submit('INCOMING'); const result = await attendanceApi.getMyWorkstationHandovers(date); expect(result.tasks.every(h => h.incomingId === 'EMP-IN' || h.outgoingId === 'EMP-IN')).toBe(true); expect(result.history.every(h => h.incomingId === 'EMP-IN' || h.outgoingId === 'EMP-IN')).toBe(true);
    await expect(attendanceApi.getDailyHandoverAttendance(date)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('daily spreadsheet exports', () => {
  it('quotes CSV correctly and neutralizes spreadsheet formulas in notes', async () => {
    await submit('INCOMING', '19:30:00', { selfConfirmationReason: 'Outgoing worker unavailable' }); const row = dailyAttendanceRows(date).find(r => r.workerId === 'EMP-IN')!; row.notes = '=HYPERLINK("bad")';
    const csv = attendanceCsv([row]); expect(csv).toContain('"\'=HYPERLINK(""bad"")"'); expect(csv).toContain('Receipt time (Colombo)');
  });
  it('creates a ZIP-based Excel workbook with two sheets and literal string cells', async () => {
    await submit('INCOMING', '19:30:00', { selfConfirmationReason: 'Outgoing worker unavailable' }); const rows = dailyAttendanceRows(date); const bytes = attendanceWorkbook(rows);
    expect([...bytes.slice(0, 4)]).toEqual([80, 75, 3, 4]);
    const workbook = new TextDecoder().decode(bytes); expect(workbook).toContain('sheet name="Morning"'); expect(workbook).toContain('sheet name="Night"'); expect(workbook).toContain('t="inlineStr"'); expect(workbook).toContain('Incoming worker'); expect(workbook).not.toContain('<f>');
  });
});
