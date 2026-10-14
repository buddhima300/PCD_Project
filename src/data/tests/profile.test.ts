import { beforeEach, afterEach, expect, it } from 'vitest';
import { profileApi } from '../../services/mock/profileHandlers';
import { setAuthContext, mockConfig } from '../../services/mock/core';
import { db } from '../../services/mock/db';
const employee = db.employees[0];
beforeEach(() => { localStorage.removeItem('relay-profile-v1'); mockConfig.latencyMs = 0; setAuthContext({userId: 'USR-SUP-001', role: 'SUPERVISOR', name: 'Supervisor'}); });
afterEach(() => { localStorage.removeItem('relay-profile-v1'); setAuthContext(null); mockConfig.latencyMs = 320; });
it('separates half-day usage from disqualifying absence and casual leave', async () => {
  await profileApi.recordProfileEvent({workerId: employee.id, date: '2026-10-01', kind: 'HALF_DAY', note: 'Approved half day'});
  const half = await profileApi.getProfile(employee.id, '2026-10-01', '2026-10-31');
  expect(half.allowance[0].eligible).toBe(true);
  await profileApi.recordProfileEvent({workerId: employee.id, date: '2026-10-02', kind: 'INFORMED_ABSENCE', note: 'Worker informed supervisor'});
  const absent = await profileApi.getProfile(employee.id, '2026-10-01', '2026-10-31');
  expect(absent.informed).toBe(1); expect(absent.allowance[0].eligible).toBe(false);
  expect(absent.halfDays).toBe(half.halfDays);
});
it('enforces own-profile access and supervisor-only ledger writes', async () => {
  setAuthContext({userId: employee.id, role: 'EMPLOYEE', name: employee.name});
  await expect(profileApi.getProfile('USR-SUP-001', '2026-10-01', '2026-10-31')).rejects.toMatchObject({code:'FORBIDDEN'});
  await expect(profileApi.recordProfileEvent({workerId: employee.id,date:'2026-10-01',kind:'HALF_DAY',note:'Unauthorized change'})).rejects.toMatchObject({code:'FORBIDDEN'});
});
it('rejects leave for freelancers and supervisors and requires correction notes', async () => {
  await expect(profileApi.recordProfileEvent({workerId:db.freelancers[0].id,date:'2026-10-01',kind:'CASUAL_LEAVE',note:'Requested leave'})).rejects.toMatchObject({code:'VALIDATION'});
  await expect(profileApi.recordProfileEvent({workerId:'USR-SUP-001',date:'2026-10-01',kind:'HALF_DAY',note:'Requested leave'})).rejects.toMatchObject({code:'VALIDATION'});
  await expect(profileApi.recordProfileEvent({workerId:employee.id,date:'2026-10-01',kind:'INFORMED_ABSENCE',note:''})).rejects.toMatchObject({code:'VALIDATION'});
});
it('validates dates and prevents duplicate records', async () => {
  await expect(profileApi.getProfile(employee.id,'2026-02-30','2026-10-31')).rejects.toMatchObject({code:'VALIDATION'});
  const input = {workerId:employee.id,date:'2026-10-01',kind:'INFORMED_ABSENCE' as const,note:'Informed supervisor'};
  await profileApi.recordProfileEvent(input);
  await expect(profileApi.recordProfileEvent(input)).rejects.toMatchObject({code:'CONFLICT'});
});
