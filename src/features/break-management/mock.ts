// Development/test adapter only. Simulated decisions are never a production authority.
import { currentAuth } from '../../services/mock/core';
import { db } from '../../services/mock/db';
import { BreakError } from './utils';
import { policySchema, sessionSchema, requestSchema, commandSchema } from './contracts';
import type { BreakApi, BreakPolicy, BreakSession, BreakRequest, BreakFilters, BreakEvent, BreakExport } from './contracts';
import { demoWorkbook } from './mock-workbook';
import { demoUsers } from '../../data/reference';

const STORAGE = 'relay-break-demo-v1';
const iso = (n = Date.now()) => new Date(n).toISOString();
export const breakScenarios = { offline: false, uncertain: false, malformed: false, disabled: false, revoked: new Set<string>(), unresolved: false, shift: 'MORNING' as 'MORNING' | 'NIGHT', now: null as number | null };
const now = () => breakScenarios.now ?? Date.now();
interface DemoState { sessions: BreakSession[]; requests: BreakRequest[]; policies: BreakPolicy[]; keys: string[] }
const basePolicy: BreakPolicy = { version: 1, effectiveAt: '2026-01-01T00:00:00Z', allowanceMinutes: 60, supervisorWarnings: [45, 55, 60], employeeWarnings: [55, 60], extraMaximumMinutes: 15, expiryMinutes: 30, escalationThreshold: 3, countingDays: 30, retentionDays: 365 };
function shiftContext() {
  // Fixture assignment is explicit test data: all seeded demo shifts begin at this business-local morning.
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now());
  let start = Date.parse(`${localDate}T${breakScenarios.shift === 'NIGHT' ? '19:30' : '07:30'}:00+05:30`);
  if (breakScenarios.shift === 'NIGHT' && now() < start) start -= 86400000;
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(start);
  return { date, start, end: start + 12 * 3600000 };
}
function event(action: string, reason = '', previous = '', resulting = '', actor = currentAuth().name, at = iso(now())): BreakEvent { return { id: crypto.randomUUID(), at, actor, action, reason, previous, resulting }; }
function seed(): DemoState {
  const shift = shiftContext();
  const worker = db.employees.find(w => w.id === 'EMP-00421');
  if (!worker) throw new BreakError('FIXTURE', 'Required workforce fixture is missing.');
  const start = Math.min(now() - 70 * 60000, shift.end - 75 * 60000);
  const session: BreakSession = { id: 'BR-SEED-OVERRUN', version: 1, workerId: worker.id, workerName: worker.name, workerType: 'EMPLOYEE', department: worker.dept, platform: worker.platformCode, currentDepartment: worker.dept, currentPlatform: worker.platformCode, shift: 'MORNING', shiftDate: shift.date, shiftStart: iso(shift.start), shiftEnd: iso(shift.end), startedAt: iso(Math.max(start, shift.start)), endedAt: iso(Math.min(Math.max(start, shift.start) + 65 * 60000, shift.end)), elapsedSeconds: 3900, status: 'ENDED', overrun: true, review: null, escalation: { eligible: false, caseId: null, message: 'Unreviewed anomaly; no disciplinary conclusion.' }, actions: { correct: false, review: false }, events: [] };
  session.events.push(event('ENDED', '', '', session.endedAt ?? '', 'SYSTEM', session.endedAt ?? iso()));
  // The seeded anomaly is historical so employee demos begin with an unconsumed current shift.
  const yesterday = new Date(shift.start - 86400000).toISOString().slice(0, 10);
  session.shiftDate = yesterday; session.shiftStart = iso(shift.start - 86400000); session.shiftEnd = iso(shift.end - 86400000); session.startedAt = iso(Date.parse(session.startedAt) - 86400000); session.endedAt = iso(Date.parse(session.endedAt ?? '') - 86400000); session.events = session.events.map(e => ({ ...e, at: session.endedAt ?? e.at, resulting: session.endedAt ?? e.resulting }));
  return { sessions: [session], requests: [], policies: [basePolicy], keys: [] };
}
let state: DemoState | undefined;
function load() {
  if (state) return state;
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE) : null;
    if (saved) { const raw: DemoState = JSON.parse(saved); state = { sessions: raw.sessions.map(s => sessionSchema.parse(s)), requests: raw.requests.map(r => requestSchema.parse(r)), policies: raw.policies.map(p => policySchema.parse(p)), keys: raw.keys.filter(k => typeof k === 'string') }; }
  } catch { /* Invalid demo storage is discarded, never rendered as authoritative. */ }
  state ??= seed(); return state;
}
function save() { if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE, JSON.stringify(load())); }
export function resetBreakDemo() { state = undefined; if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE); breakScenarios.offline = false; breakScenarios.uncertain = false; breakScenarios.malformed = false; breakScenarios.disabled = false; breakScenarios.unresolved = false; breakScenarios.shift = 'MORNING'; breakScenarios.revoked.clear(); }
function access() { const a = currentAuth(); if (breakScenarios.disabled) throw new BreakError('DISABLED', 'Break Management was disabled.'); if (breakScenarios.revoked.has(a.userId)) throw new BreakError('FORBIDDEN', 'Your break access has been revoked.', 403); return a; }
// Explicit fixture grants, separate from global monitoring. These are not new production permission names.
function actionScope(workerId: string) { const a = access(); return a.role === 'SUPERVISOR' && (a.permissions ? a.permissions.some(p => ['breaks.review','attendance.correct'].includes(p)) : ['USR-SUP-001', 'USR-MGR-014'].includes(a.userId) && ['EMP-00421', 'FL-00124'].includes(workerId)); }
function policyAccess() { const a = access(); return a.role === 'SUPERVISOR' && (a.permissions ? a.permissions.includes('breaks.policy') : a.userId === 'USR-SUP-001'); }
function effectivePolicy() { return load().policies.filter(p => Date.parse(p.effectiveAt) <= now()).sort((a, b) => Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt) || b.version - a.version)[0] ?? basePolicy; }
function tick() {
  const s = load();
  for (const item of s.sessions) {
    if (item.status === 'ACTIVE' && now() >= Date.parse(item.shiftEnd)) {
      item.status = breakScenarios.unresolved ? 'UNRESOLVED' : 'SHIFT_END';
      if (!breakScenarios.unresolved) { item.endedAt = item.shiftEnd; item.events.push(event('SHIFT_END', 'Scheduled shift-end closure', '', item.shiftEnd, 'SYSTEM', item.shiftEnd)); }
      item.version++;
    }
  }
  for (const req of s.requests) if (req.status === 'Pending' && now() >= Date.parse(req.expiresAt)) { req.status = 'Expired'; req.version++; req.events.push(event('EXPIRED', 'Approval request expired', 'Pending', 'Expired', 'SYSTEM')); }
  for (const session of s.sessions.filter(item => item.status === 'ACTIVE')) {
    const consumed = s.sessions.filter(item => item.workerId === session.workerId && item.shiftDate === session.shiftDate).reduce((n, item) => n + Math.max(0, (Math.min(item.endedAt ? Date.parse(item.endedAt) : now(), Date.parse(item.shiftEnd)) - Date.parse(item.startedAt)) / 1000), 0);
    const policy = effectivePolicy();
    for (const [audience, thresholds] of [['employee', policy.employeeWarnings], ['supervisor', policy.supervisorWarnings]] as const) for (const threshold of thresholds) {
      const key = `notice:${session.workerId}:${session.shiftDate}:${policy.version}:${audience}:${threshold}`;
      if (consumed >= threshold * 60 && !s.keys.includes(key)) { s.keys.push(key); notify(session.workerId, `Break allowance milestone: ${threshold} minutes`, audience === 'supervisor'); }
    }
    const overrunKey = `overrun:${session.id}`;
    if (consumed > policy.allowanceMinutes * 60 && !s.keys.includes(overrunKey)) { s.keys.push(overrunKey); session.overrun = true; session.events.push(event('OVERRUN_NOTICE', 'Timer anomaly requires human review', '', '', 'SYSTEM')); notify(session.workerId, 'Break overrun requires review'); notify(session.workerId, 'Break overrun requires review', true); }
  }
  save();
}
function presentSession(item: BreakSession): BreakSession {
  const elapsed = Math.max(0, (Math.min(item.endedAt ? Date.parse(item.endedAt) : now(), Date.parse(item.shiftEnd)) - Date.parse(item.startedAt)) / 1000);
  const consumed = load().sessions.filter(s => s.workerId === item.workerId && s.shiftDate === item.shiftDate).reduce((n, s) => n + Math.max(0, (Math.min(s.endedAt ? Date.parse(s.endedAt) : now(), Date.parse(s.shiftEnd)) - Date.parse(s.startedAt)) / 1000), 0);
  const overrun = item.overrun || (!item.endedAt && consumed > effectivePolicy().allowanceMinutes * 60);
  return { ...item, overrun, elapsedSeconds: elapsed, actions: { correct: actionScope(item.workerId) && ['ACTIVE', 'UNRESOLVED'].includes(item.status), review: actionScope(item.workerId) && overrun }, events: [...item.events] };
}
function presentRequest(item: BreakRequest): BreakRequest { const a = access(); return { ...item, actions: { decide: item.status === 'Pending' && actionScope(item.workerId), withdraw: item.status === 'Pending' && item.workerId === a.userId && a.role !== 'SUPERVISOR' } }; }
function findSession(id: string) { const item = load().sessions.find(s => s.id === id); if (!item) throw new BreakError('NOT_FOUND', 'Break session not found.', 404); const a = access(); if (a.role !== 'SUPERVISOR' && a.userId !== item.workerId) throw new BreakError('FORBIDDEN', 'Only your own break history is available.', 403); return item; }
function findRequest(id: string) { const item = load().requests.find(r => r.id === id); if (!item) throw new BreakError('NOT_FOUND', 'Request not found.', 404); const a = access(); if (a.role !== 'SUPERVISOR' && a.userId !== item.workerId) throw new BreakError('FORBIDDEN', 'Only your own requests are available.', 403); return item; }
function snapshot() {
  tick(); const a = access(); const policy = effectivePolicy(); const shift = shiftContext(); const worker = a.role === 'EMPLOYEE' ? db.employees.find(w => w.id === a.userId) : db.freelancers.find(w => w.id === a.userId);
  const sessions = load().sessions.filter(s => s.workerId === a.userId).map(presentSession);
  const current = sessions.filter(s => s.shiftDate === shift.date);
  const consumed = current.reduce((n, s) => n + s.elapsedSeconds, 0);
  const active = sessions.find(s => ['ACTIVE', 'UNRESOLVED'].includes(s.status)) ?? null;
  const requests = load().requests.filter(r => a.role === 'SUPERVISOR' || r.workerId === a.userId).map(presentRequest);
  const remaining = Math.max(0, policy.allowanceMinutes * 60 - consumed);
  const approved = requests.find(r => r.workerId === a.userId && r.status === 'Approved' && r.shiftDate === shift.date && Date.parse(r.expiresAt) > now());
  const assigned = !!worker && (a.permissions === undefined || ('platformCode' in worker ? !!worker.platformCode : !!worker.currentPlatform)) && now() >= shift.start && now() < shift.end;
  return { available: true, capabilities: { view: true, monitor: a.role === 'SUPERVISOR', policy: policyAccess(), export: a.role === 'SUPERVISOR' && (a.permissions ? a.permissions.includes('reports.export') : ['USR-SUP-001', 'USR-MGR-014'].includes(a.userId)) }, serverNow: iso(now()), timezone: 'Asia/Colombo', policy, policyHistory: load().policies, notices: policy.version > 1 ? [`Policy v${policy.version} effective ${policy.effectiveAt}: allowance ${policy.allowanceMinutes} minutes. Existing events remain unchanged.`] : [], shift: worker ? { code: breakScenarios.shift, date: shift.date, startsAt: iso(shift.start), endsAt: iso(shift.end), department: worker.dept, platform: 'platformCode' in worker ? worker.platformCode : worker.currentPlatform ?? 'Unassigned' } : null, allowance: worker ? { totalSeconds: policy.allowanceMinutes * 60, consumedSeconds: consumed, remainingSeconds: remaining } : null, active, history: sessions.slice(0, 100), requests: requests.slice(0, 100), actions: { start: assigned && !active && (remaining > 0 || !!approved), end: !!active && active.status === 'ACTIVE', request: assigned && remaining === 0 && !active && !requests.some(r => r.status === 'Pending' && r.shiftDate === shift.date), restriction: !assigned ? 'No active scheduled demo assignment.' : active ? 'An existing session must be ended or corrected first.' : remaining === 0 && !approved ? 'Allowance exhausted. An approved extra break is required.' : '' } };
}
function filtered(f: BreakFilters) {
  access(); if (access().role !== 'SUPERVISOR') throw new BreakError('FORBIDDEN', 'Operational monitoring requires supervisor visibility.', 403);
  return load().sessions.map(presentSession).filter(s => (!f.search || `${s.workerId} ${s.workerName}`.toLowerCase().includes(f.search.toLowerCase())) && (!f.department || (f.assignment === 'current' ? s.currentDepartment : s.department) === f.department) && (!f.platform || (f.assignment === 'current' ? s.currentPlatform : s.platform) === f.platform) && (!f.shift || s.shift === f.shift) && (!f.status || s.status === f.status) && (!f.shiftDate || s.shiftDate === f.shiftDate) && (!f.date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date(s.startedAt)) === f.date) && (!f.overrun || (f.overrun === 'yes' ? s.overrun : !s.overrun)) && (!f.unreviewed || s.overrun && !s.review) && (!f.review || s.review?.outcome === f.review) && (!f.approval || load().requests.some(r => r.workerId === s.workerId && r.status === f.approval)) && (!f.pending || load().requests.some(r => r.workerId === s.workerId && r.status === 'Pending')));
}
function monitor(f: BreakFilters) { tick(); const all = filtered(f); const requests = load().requests.map(presentRequest).filter(r => {
  const worker = db.employees.find(w => w.id === r.workerId) ?? db.freelancers.find(w => w.id === r.workerId);
  const department = f.assignment === 'current' ? worker?.dept : r.context.department;
  const platform = f.assignment === 'current' ? worker && ('platformCode' in worker ? worker.platformCode : worker.currentPlatform) : r.context.platform;
  const sessions = load().sessions.filter(s => s.workerId === r.workerId && s.shiftDate === r.shiftDate).map(presentSession);
  return (!f.search || `${r.workerId} ${r.workerName}`.toLowerCase().includes(f.search.toLowerCase())) && (!f.shiftDate || r.shiftDate === f.shiftDate) && (!f.pending || r.status === 'Pending') && (!f.department || department === f.department) && (!f.platform || platform === f.platform) && (!f.shift || r.context.shift === f.shift) && (!f.approval || r.status === f.approval) && (!f.date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date(r.createdAt)) === f.date) && (!f.status || sessions.some(s => s.status === f.status)) && (!f.review || sessions.some(s => s.review?.outcome === f.review)) && (!f.overrun || sessions.some(s => f.overrun === 'yes' ? s.overrun : !s.overrun)) && (!f.unreviewed || sessions.some(s => s.overrun && !s.review));
});
  return { serverNow: iso(now()), sessions: all.slice((f.page - 1) * f.pageSize, f.page * f.pageSize), requests: requests.slice((f.page - 1) * f.pageSize, f.page * f.pageSize), requestTotal: requests.length, total: all.length, activeCount: load().sessions.filter(s => s.status === 'ACTIVE').length, pendingCount: load().requests.filter(r => r.status === 'Pending').length, overrunCount: load().sessions.filter(s => s.overrun && !s.review).length, departments: [...new Set(load().sessions.map(s => s.department))], platforms: [...new Set(load().sessions.map(s => s.platform))] };
}
function revision(actual: number, expected: number) { if (actual !== expected) throw new BreakError('CONFLICT', 'Another authorized user changed this record. Refresh and review the latest state.', 409); }
function notify(workerId: string, title: string, supervisors = false) {
  const worker = db.employees.some(w => w.id === workerId);
  const recipients = supervisors ? demoUsers.filter(u => u.role === 'SUPERVISOR').map(u => u.id) : [workerId];
  for (const recipientId of recipients) db.notifications.unshift({ id: `NTF-BREAK-${crypto.randomUUID()}`, type: 'BREAK_EVENT', title: `[Demo] ${title}`, body: 'Open Break Management for the current authorized state. Email delivery is not connected.', createdAt: iso(now()), read: false, emailStatus: 'NOT_SENT', link: supervisors ? '/breaks' : '/my/breaks', recipientRoles: [supervisors ? 'SUPERVISOR' : worker ? 'EMPLOYEE' : 'FREELANCER'], recipientId });
}
async function respond<T>(fn: () => T, signal?: AbortSignal): Promise<T> { await new Promise(resolve => setTimeout(resolve, 40)); if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); if (breakScenarios.offline) throw new BreakError('NETWORK', 'Demo connection failed. No confirmed changes are available.', 0, true); access(); return structuredClone(fn()); }
const jobs = new Map<string, BreakExport>();
export function exportBreakState() { return { ...load(), jobs: [...jobs.entries()] }; }
export function importBreakState(data: ReturnType<typeof exportBreakState>) { state = { sessions: data.sessions, requests: data.requests, policies: data.policies, keys: data.keys }; jobs.clear(); for (const [key, value] of data.jobs ?? []) jobs.set(key, value); }
function audit(action: string, target: string, previous: string, next: string, reason = '') { const a = access(); db.audit.unshift({ id: `AUD-BREAK-${crypto.randomUUID()}`, at: iso(now()), actorId: a.userId, actorName: a.name, role: a.role, action: `DEMO_BREAK_${action}`, entity: 'Break Management (development simulation)', entityId: target, platformCode: null, dept: null, previous, next, reason, isOverride: action === 'CORRECT' }); }
export const mockBreakApi: BreakApi = {
  snapshot: signal => respond(() => { if (breakScenarios.malformed) throw new BreakError('INVALID_RESPONSE', 'Malformed demo response. Actions disabled.'); return snapshot(); }, signal),
  monitor: (f, signal) => respond(() => monitor(f), signal),
  session: id => respond(() => { tick(); return presentSession(findSession(id)); }),
  request: id => respond(() => { tick(); return presentRequest(findRequest(id)); }),
  history: (page, pageSize) => respond(() => { tick(); const a = access(); if (a.role === 'SUPERVISOR') throw new BreakError('FORBIDDEN', 'Use authorized operational reports for supervisor history.', 403); const sessions = load().sessions.filter(s => s.workerId === a.userId).map(presentSession); return { sessions: sessions.slice((page - 1) * Math.min(pageSize, 100), page * Math.min(pageSize, 100)), total: sessions.length }; }),
  execute: (input, key) => respond(() => {
    tick(); const a = access(); const c = commandSchema.parse(input); if (load().keys.includes(`${a.userId}:${key}`)) return { confirmed: true as const };
    const view = snapshot();
    if (c.kind === 'start') {
      if (!view.actions.start || !view.shift) throw new BreakError('START_BLOCKED', view.actions.restriction || 'A break cannot be started.', 409);
      revision(view.policy.version, c.policyVersion); if (c.shiftDate !== view.shift.date) throw new BreakError('SHIFT_CHANGED', 'Scheduled shift assignment changed.', 409);
    const department = requestSchema.shape.context.shape.department.parse(view.shift.department);
    const s: BreakSession = { id: crypto.randomUUID(), version: 1, workerId: a.userId, workerName: a.name, workerType: a.role === 'EMPLOYEE' ? 'EMPLOYEE' : 'FREELANCER', department, platform: view.shift.platform, currentDepartment: view.shift.department, currentPlatform: view.shift.platform, shift: view.shift.code, shiftDate: view.shift.date, shiftStart: view.shift.startsAt, shiftEnd: view.shift.endsAt, startedAt: iso(now()), endedAt: null, elapsedSeconds: 0, status: 'ACTIVE', overrun: false, review: null, escalation: { eligible: false, caseId: null, message: '' }, actions: { correct: false, review: false }, events: [event('STARTED')] };
      load().sessions.unshift(s);
      if ((view.allowance?.remainingSeconds ?? 0) === 0) { const req = load().requests.find(r => r.workerId === a.userId && r.status === 'Approved' && r.shiftDate === view.shift?.date && Date.parse(r.expiresAt) > now()); if (req) { req.expiresAt = iso(now()); req.events.push(event('APPROVAL_CONSUMED', 'Used for this session', '', s.id)); req.version++; } }
    } else if (c.kind === 'end' || c.kind === 'correct' || c.kind === 'review') {
      const s = findSession(c.id); revision(s.version, c.version);
      if (c.kind === 'end') { if (s.workerId !== a.userId || a.role === 'SUPERVISOR' || s.status !== 'ACTIVE') throw new BreakError('FORBIDDEN', 'This session cannot be ended by this account.', 403); s.endedAt = iso(now()); s.status = 'ENDED'; s.events.push(event('ENDED', '', '', s.endedAt)); }
      else if (c.kind === 'correct') { if (!presentSession(s).actions.correct) throw new BreakError('FORBIDDEN', 'Timer correction is outside your action scope.', 403); const end = Date.parse(c.endedAt); if (end < Date.parse(s.startedAt) || end > Math.min(now(), Date.parse(s.shiftEnd))) throw new BreakError('VALIDATION', 'Correction must fall between the start and the earlier of server now or scheduled shift end.', 422); s.events.push(event('CORRECTED', c.reason, s.endedAt ?? 'Active', c.endedAt)); s.endedAt = c.endedAt; s.status = 'CORRECTED'; }
      else { if (!presentSession(s).actions.review) throw new BreakError('FORBIDDEN', 'Overrun review is outside your action scope.', 403); s.review = { outcome: c.outcome, reason: c.reason, actor: a.name, at: iso(now()) }; s.escalation = { eligible: c.outcome === 'Confirmed', caseId: null, message: c.outcome === 'Confirmed' ? 'Confirmed violation. Demo has no disciplinary escalation backend; no case was created.' : 'Not counted toward disciplinary escalation.' }; s.events.push(event('REVIEWED', c.reason, '', c.outcome)); }
      s.version++; s.elapsedSeconds = presentSession(s).elapsedSeconds;
      if (c.kind !== 'review') { const consumed = load().sessions.filter(x => x.workerId === s.workerId && x.shiftDate === s.shiftDate).reduce((n, x) => n + presentSession(x).elapsedSeconds, 0); s.overrun = consumed > effectivePolicy().allowanceMinutes * 60; }
    } else if (c.kind === 'request') {
      if (!view.actions.request || !view.shift || c.minutes > view.policy.extraMaximumMinutes) throw new BreakError('VALIDATION', 'Extra-break request is unavailable or exceeds the configured maximum.', 422);
      load().requests.unshift({ id: crypto.randomUUID(), version: 1, workerId: a.userId, workerName: a.name, context: { department: requestSchema.shape.context.shape.department.parse(view.shift.department), platform: view.shift.platform, shift: view.shift.code }, shiftDate: view.shift.date, requestedMinutes: c.minutes, approvedMinutes: null, reason: c.reason, decisionReason: '', status: 'Pending', createdAt: iso(now()), expiresAt: iso(now() + view.policy.expiryMinutes * 60000), actions: { decide: false, withdraw: true }, events: [event('REQUESTED', c.reason)] }); notify(a.userId, 'Extra-break request pending'); notify(a.userId, 'Extra-break request pending', true);
    } else if (c.kind === 'withdraw' || c.kind === 'decide') {
      const r = findRequest(c.id); revision(r.version, c.version);
      if (c.kind === 'withdraw') { if (!presentRequest(r).actions.withdraw) throw new BreakError('FORBIDDEN', 'This request cannot be withdrawn.', 403); r.status = 'Withdrawn'; r.events.push(event('WITHDRAWN')); }
      else { if (!presentRequest(r).actions.decide) throw new BreakError('FORBIDDEN', 'Approval is outside your action scope or the request is no longer pending.', 403); if (c.minutes > view.policy.extraMaximumMinutes) throw new BreakError('VALIDATION', 'Approved duration exceeds the configured maximum.', 422); r.status = c.decision; r.approvedMinutes = c.decision === 'Approved' ? c.minutes : null; r.decisionReason = c.reason; r.events.push(event(c.decision.toUpperCase(), c.reason)); notify(r.workerId, `Extra-break request ${c.decision.toLowerCase()}`); }
      r.version++;
    } else {
      if (!policyAccess()) throw new BreakError('FORBIDDEN', 'Policy configuration is not granted to this account.', 403);
      revision(Math.max(...load().policies.map(p => p.version)), c.policy.version); load().policies.push({ ...c.policy, version: c.policy.version + 1 });
      for (const id of ['EMP-00421', 'FL-00124']) notify(id, `Break policy change effective ${c.policy.effectiveAt}`);
      notify(a.userId, `Break policy change effective ${c.policy.effectiveAt}`, true);
    }
    load().keys.push(`${a.userId}:${key}`); save();
    audit(c.kind.toUpperCase(), 'id' in c ? c.id : c.kind === 'policy' ? `Policy v${c.policy.version + 1}` : a.userId, 'version' in c ? `Revision ${c.version}` : '', c.kind, 'reason' in c ? c.reason : '');
    if (breakScenarios.uncertain) { breakScenarios.uncertain = false; throw new BreakError('UNCERTAIN', 'Demo response lost after commit. Refresh state; do not resubmit.', 0, true); }
    return { confirmed: true as const };
  }),
  export: (filters, format, key) => respond(() => {
    if (!snapshot().capabilities.export) throw new BreakError('FORBIDDEN', 'Export permission is required.', 403);
    const rows = filtered(filters); const id = `${access().userId}:${key}`;
    const existing = jobs.get(id); if (existing) return existing;
    const result: BreakExport = { id, status: 'Ready', progress: 100, format, downloadUrl: null, message: 'Demo export; audited production exports require backend integration.' };
    const values: (string | number)[][] = [['Session', 'Employee', 'Department', 'Platform', 'Shift', 'Shift date', 'Started at', 'Ended at', 'Seconds', 'Status', 'Overrun', 'Review'], ...rows.map(s => [s.id, s.workerId, filters.assignment === 'current' ? s.currentDepartment : s.department, filters.assignment === 'current' ? s.currentPlatform : s.platform, s.shift, s.shiftDate, s.startedAt, s.endedAt ?? '', s.elapsedSeconds, s.status, String(s.overrun), s.review?.outcome ?? 'Unreviewed'])];
    if (format === 'CSV') { const cell = (v: string | number) => `"${String(v).replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`; result.downloadUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(values.map(row => row.map(cell).join(',')).join('\r\n'))}`; }
    else result.downloadUrl = demoWorkbook(values);
    jobs.set(id, result); audit('EXPORT', id, '', format, JSON.stringify(filters)); return result;
  }),
  exportStatus: id => respond(() => { if (!snapshot().capabilities.export) throw new BreakError('FORBIDDEN', 'Export access was revoked.', 403); const job = jobs.get(id); if (!job || !id.startsWith(`${access().userId}:`)) throw new BreakError('NOT_FOUND', 'Export job unavailable.', 404); return job; }),
};
