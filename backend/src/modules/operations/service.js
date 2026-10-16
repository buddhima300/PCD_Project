import { transaction } from '../../db/pool.js';
import { ApiError } from '../../shared/errors.js';
import { createDomain } from './runtime.js';
import { loadState, saveState, linkAccount, translate } from './store.js';

const blocked = new Set(['login', 'getMockConfig', 'setMockConfig', '__proto__', 'constructor', 'prototype']);
const staff = new Set(['getEmployee','getFreelancer','getProfile','saveProfilePhoto','getMyWork','getOffDayCalendar','requestOffDay','cancelOffDay','setAvailability','listMyAssignments','getReplacement','getMyHandovers','confirmOutgoing','confirmReceipt','createIncident','listNotifications','markNotificationRead','markAllNotificationsRead','listMyDisciplinaryCases','listMyWarnings','saveMyIrDraft','submitMyIr','acknowledgeWarning','submitAppeal','getMyAttendance','submitHandover']);
const grants = { decideIncidentApproval: 'disciplinary.approve', approveFinding: 'disciplinary.approve', decideWarning: 'disciplinary.approve', updateDisciplinaryPolicy: 'disciplinary.approve', correctHandover: 'attendance.correct', listAudit: 'audit.read' };
for (const method of ['getRoster','listHandovers','confirmReplacement','acknowledgeMyWarning','submitMyAppeal','getMyWorkstationHandovers','submitHandoverConfirmation']) staff.add(method);
grants.correctAttendanceHandover = 'attendance.correct';
export async function executeOperation(db, auth, group, method, args) {
  if (blocked.has(method)) throw new ApiError(404, 'NOT_FOUND', 'Operation not found.');
  return transaction(db, async client => {
    // Domain rules affect several modules. Serialize each complete load/validate/save cycle.
    await client.query('SELECT pg_advisory_xact_lock(726343)');
    const state = await loadState(client);
    const workerId = await linkAccount(client, auth.user, state);
    const links = (await client.query('SELECT user_id,worker_id FROM operational_accounts')).rows;
    const inward = new Map(links.map(row => [row.user_id, row.worker_id]));
    const outward = new Map(links.map(row => [row.worker_id, row.user_id]));
    const engine = await createDomain();
    const target = group === 'breaks' ? engine.breaks : engine.methods;
    if (!Object.hasOwn(target, method) || typeof target[method] !== 'function') throw new ApiError(404, 'NOT_FOUND', 'Operation not found.');
    if (group !== 'breaks' && auth.user.role !== 'SUPERVISOR' && !staff.has(method)) throw new ApiError(403, 'FORBIDDEN', 'Supervisor access is required.');
    const required = group === 'breaks' ? ({ policy: 'breaks.policy', decide: 'breaks.review', review: 'breaks.review', correct: 'attendance.correct' }[args[0]?.kind] ?? (['export','exportStatus'].includes(method) ? 'reports.export' : null)) : grants[method];
    if (required && !auth.permissions.includes(required)) throw new ApiError(403, 'FORBIDDEN', 'The required action permission is missing.');
    const supervisors = (await client.query("SELECT u.id,u.name,u.email,u.title,u.role,a.worker_id FROM users u JOIN operational_accounts a ON a.user_id=u.id WHERE u.role='SUPERVISOR' AND u.status='ACTIVE'")).rows.map(user => ({ ...user, id: user.worker_id }));
    engine.hydrate(structuredClone(state), supervisors);
    engine.setAuthContext({ userId: workerId, role: auth.user.role, name: auth.user.name, permissions: auth.permissions });
    let result;
    try { result = await (method === 'listHandovers' && auth.user.role !== 'SUPERVISOR' ? engine.methods.getMyHandovers() : target[method](...translate(args, inward))); }
    catch (error) {
      if (Number.isInteger(error.status) && error.status >= 400 && error.status < 500) throw new ApiError(error.status, error.code ?? 'VALIDATION', error.message);
      if (error.name === 'TypeError' || error.name === 'RangeError' || error.name === 'ZodError') throw new ApiError(422, 'VALIDATION', 'The supplied operation arguments are invalid.');
      throw error;
    }
    await saveState(client, engine.snapshot(), state);
    return translate(result ?? null, outward);
  });
}
