import { z } from 'zod';

// Proposed integration contracts, NOT existing backend endpoints or permission names.
export const timestamp = z.string().datetime({ offset: true });
export const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const parsed = Date.parse(`${value}T00:00:00Z`); return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value; }, 'Invalid scheduled date');
const seconds = z.number().finite().nonnegative();
export const capabilitiesSchema = z.object({ view: z.boolean(), monitor: z.boolean(), policy: z.boolean(), export: z.boolean() });
export const policySchema = z.object({
  version: z.number().int().positive(), effectiveAt: timestamp, allowanceMinutes: z.number().int().min(1).max(720),
  supervisorWarnings: z.array(z.number().int().min(1).max(720)), employeeWarnings: z.array(z.number().int().min(1).max(720)),
  extraMaximumMinutes: z.number().int().min(1).max(120), expiryMinutes: z.number().int().min(1).max(1440),
  escalationThreshold: z.number().int().positive(), countingDays: z.number().int().positive(), retentionDays: z.number().int().positive(),
}).refine(p => [...p.supervisorWarnings, ...p.employeeWarnings].every(n => n <= p.allowanceMinutes), 'Warning thresholds cannot exceed allowance');
export const eventSchema = z.object({ id: z.string(), at: timestamp, actor: z.string(), action: z.string(), reason: z.string(), previous: z.string(), resulting: z.string() });
export const reviewOutcomeSchema = z.enum(['Confirmed', 'Not a policy violation', 'Needs further review']);
export const sessionSchema = z.object({
  id: z.string(), version: z.number().int().positive(), workerId: z.string(), workerName: z.string(), workerType: z.enum(['EMPLOYEE', 'FREELANCER']),
  department: z.enum(['GS', 'DP', 'WD', 'SAFETY']), platform: z.string(), currentDepartment: z.string(), currentPlatform: z.string(),
  shift: z.enum(['MORNING', 'NIGHT']), shiftDate: businessDate, shiftStart: timestamp, shiftEnd: timestamp,
  startedAt: timestamp, endedAt: timestamp.nullable(), elapsedSeconds: seconds,
  status: z.enum(['ACTIVE', 'ENDED', 'SHIFT_END', 'CORRECTED', 'UNRESOLVED']), overrun: z.boolean(),
  review: z.object({ outcome: reviewOutcomeSchema, reason: z.string(), actor: z.string(), at: timestamp }).nullable(),
  escalation: z.object({ eligible: z.boolean(), caseId: z.string().nullable(), message: z.string() }),
  actions: z.object({ correct: z.boolean(), review: z.boolean() }), events: z.array(eventSchema),
}).superRefine((s, ctx) => {
  if (Date.parse(s.shiftEnd) <= Date.parse(s.shiftStart) || Date.parse(s.startedAt) < Date.parse(s.shiftStart) || (s.endedAt && (Date.parse(s.endedAt) < Date.parse(s.startedAt) || Date.parse(s.endedAt) > Date.parse(s.shiftEnd)))) ctx.addIssue({ code: 'custom', message: 'Invalid session chronology' });
  if (['ENDED', 'SHIFT_END', 'CORRECTED'].includes(s.status) && !s.endedAt) ctx.addIssue({ code: 'custom', message: 'Closed session must include its authoritative end timestamp' });
  if (s.status === 'SHIFT_END' && s.endedAt !== s.shiftEnd) ctx.addIssue({ code: 'custom', message: 'System shift-end closure must use scheduled end' });
  if (s.escalation.eligible && s.review?.outcome !== 'Confirmed') ctx.addIssue({ code: 'custom', message: 'Only confirmed violations may be escalation eligible' });
});
export const requestSchema = z.object({ id: z.string(), version: z.number().int().positive(), workerId: z.string(), workerName: z.string(), context: z.object({ department: z.enum(['GS', 'DP', 'WD', 'SAFETY']), platform: z.string(), shift: z.enum(['MORNING', 'NIGHT']) }), shiftDate: businessDate, requestedMinutes: z.number().int().positive(), approvedMinutes: z.number().int().positive().nullable(), reason: z.string(), decisionReason: z.string(), status: z.enum(['Pending', 'Approved', 'Rejected', 'Withdrawn', 'Expired']), createdAt: timestamp, expiresAt: timestamp, actions: z.object({ decide: z.boolean(), withdraw: z.boolean() }), events: z.array(eventSchema) });
export const snapshotSchema = z.object({
  available: z.boolean(), capabilities: capabilitiesSchema, serverNow: timestamp, timezone: z.string().refine(t => { try { new Intl.DateTimeFormat('en', { timeZone: t }); return true; } catch { return false; } }, 'Invalid business timezone'),
  policy: policySchema, policyHistory: z.array(policySchema), notices: z.array(z.string()),
  shift: z.object({ code: z.enum(['MORNING', 'NIGHT']), date: businessDate, startsAt: timestamp, endsAt: timestamp, department: z.string(), platform: z.string() }).refine(s => Date.parse(s.endsAt) > Date.parse(s.startsAt), 'Invalid shift chronology').nullable(),
  allowance: z.object({ totalSeconds: seconds, consumedSeconds: seconds, remainingSeconds: seconds }).nullable(),
  active: sessionSchema.nullable(), history: z.array(sessionSchema), requests: z.array(requestSchema),
  actions: z.object({ start: z.boolean(), end: z.boolean(), request: z.boolean(), restriction: z.string() }),
});
export type BreakSnapshot = z.infer<typeof snapshotSchema>;
export type BreakSession = z.infer<typeof sessionSchema>;
export type BreakRequest = z.infer<typeof requestSchema>;
export type BreakPolicy = z.infer<typeof policySchema>;
export type BreakEvent = z.infer<typeof eventSchema>;
export type ReviewOutcome = z.infer<typeof reviewOutcomeSchema>;
export interface BreakFilters { search: string; department: string; platform: string; shift: string; status: string; overrun: string; shiftDate: string; date: string; review: string; approval: string; pending: boolean; unreviewed: boolean; assignment: 'historical' | 'current'; page: number; pageSize: number }
export const defaultFilters: BreakFilters = { search: '', department: '', platform: '', shift: '', status: '', overrun: '', shiftDate: '', date: '', review: '', approval: '', pending: false, unreviewed: false, assignment: 'historical', page: 1, pageSize: 20 };
export const monitoringSchema = z.object({ serverNow: timestamp, sessions: z.array(sessionSchema), requests: z.array(requestSchema), requestTotal: z.number().int().nonnegative(), total: z.number().int().nonnegative(), activeCount: z.number().int().nonnegative(), pendingCount: z.number().int().nonnegative(), overrunCount: z.number().int().nonnegative(), departments: z.array(z.string()), platforms: z.array(z.string()) });
export type Monitoring = z.infer<typeof monitoringSchema>;
export const commandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('start'), policyVersion: z.number(), shiftDate: z.string() }),
  z.object({ kind: z.literal('end'), id: z.string(), version: z.number() }),
  z.object({ kind: z.literal('request'), minutes: z.number().int().positive(), reason: z.string().trim().min(3).max(2000) }),
  z.object({ kind: z.literal('withdraw'), id: z.string(), version: z.number() }),
  z.object({ kind: z.literal('decide'), id: z.string(), version: z.number(), decision: z.enum(['Approved', 'Rejected']), minutes: z.number().int().positive(), reason: z.string().trim().min(3).max(2000) }),
  z.object({ kind: z.literal('correct'), id: z.string(), version: z.number(), endedAt: timestamp, reason: z.string().trim().min(3).max(2000) }),
  z.object({ kind: z.literal('review'), id: z.string(), version: z.number(), outcome: reviewOutcomeSchema, reason: z.string().trim().min(3).max(2000) }),
  z.object({ kind: z.literal('policy'), policy: policySchema }),
]);
export type BreakCommand = z.infer<typeof commandSchema>;
export const exportSchema = z.object({ id: z.string(), status: z.enum(['Queued', 'Processing', 'Ready', 'Failed']), progress: z.number().min(0).max(100), format: z.enum(['CSV', 'XLSX']), downloadUrl: z.string().nullable(), message: z.string() });
export type BreakExport = z.infer<typeof exportSchema>;
export interface BreakApi {
  snapshot(signal?: AbortSignal): Promise<BreakSnapshot>;
  monitor(filters: BreakFilters, signal?: AbortSignal): Promise<Monitoring>;
  session(id: string): Promise<BreakSession>;
  request(id: string): Promise<BreakRequest>;
  history(page: number, pageSize: number): Promise<{ sessions: BreakSession[]; total: number }>;
  execute(command: BreakCommand, idempotencyKey: string): Promise<{ confirmed: true }>;
  export(filters: BreakFilters, format: 'CSV' | 'XLSX', idempotencyKey: string): Promise<BreakExport>;
  exportStatus(id: string): Promise<BreakExport>;
}

