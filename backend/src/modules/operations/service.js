import { assignQualifiedWorker, trainingRecoveryMethods, trainingRecoveryOperation } from './workforce-flow.js';
import { finalizeStaffIdentity } from './staff-identity.js';
import { workforceVacancies } from './workforce-vacancies.js';
import { assertWorkflowAvailable, withoutPendingHandovers } from './retired-workflows.js';
import { transaction } from '../../db/pool.js';
import { ApiError } from '../../shared/errors.js';
import { createDomain } from './runtime.js';
import { loadState, saveState, linkAccount, translate } from './store.js';
import { validatePlatformArguments, platformCommands } from './platform-input.js';
import { projectPlatforms } from './platform-projection.js';
import { equipmentMethods, equipmentOperation, loadAllocations, syncReceipts, enrichEquipment } from './equipment.js';
import { employeePlatformMethods, employeePlatformOperation, offDayBalance } from './employee-platform.js';
import { employeeCareerMethods, employeeCareerOperation } from './employee-career.js';
import { loadLoginAccounts, loginAccessMetadata, setEmployeeLoginAccess } from './employee-access.js';
import { employeeReleaseMethods, employeeReleaseOperation } from './employee-release.js';
import { rosterMethods, rosterOperation, projectRosterProfile } from './roster.js';

const blocked = new Set(['login', 'getMockConfig', 'setMockConfig', '__proto__', 'constructor', 'prototype']);
const staff = new Set(['getEmployee','getFreelancer','getProfile','saveProfilePhoto','getMyWork','getOffDayCalendar','requestOffDay','cancelOffDay','setAvailability','listMyAssignments','getReplacement','getMyHandovers','confirmOutgoing','confirmReceipt','createIncident','listNotifications','markNotificationRead','markAllNotificationsRead','listMyDisciplinaryCases','listMyWarnings','saveMyIrDraft','submitMyIr','acknowledgeWarning','submitAppeal','getMyAttendance','submitHandover']);
const grants = { decideIncidentApproval: 'disciplinary.approve', approveFinding: 'disciplinary.approve', decideWarning: 'disciplinary.approve', updateDisciplinaryPolicy: 'disciplinary.approve', correctHandover: 'attendance.correct', listAudit: 'audit.read' };
for (const method of ['getRoster','listHandovers','confirmReplacement','acknowledgeMyWarning','submitMyAppeal','getMyWorkstationHandovers','submitHandoverConfirmation']) staff.add(method);
grants.correctAttendanceHandover = 'attendance.correct';
export async function executeOperation(db, auth, group, method, args) {
  if (group === 'workflows') assertWorkflowAvailable(method,args);
  if (blocked.has(method)) throw new ApiError(404, 'NOT_FOUND', 'Operation not found.');
  if (platformCommands.has(method) && auth.user.role !== 'SUPERVISOR') throw new ApiError(403, 'FORBIDDEN', 'Only supervisors can manage platforms.');
  if (group === 'workflows') args = validatePlatformArguments(method, args);
  return transaction(db, async client => {
    // Domain rules affect several modules. Serialize each complete load/validate/save cycle.
    await client.query('SELECT pg_advisory_xact_lock(726343)');
    const state = await loadState(client);
    const workerId = await linkAccount(client, auth.user, state);
    const links = (await client.query('SELECT user_id,worker_id FROM operational_accounts')).rows;
    const inward = new Map(links.map(row => [row.user_id, row.worker_id]));
    const outward = new Map(links.map(row => [row.worker_id, row.user_id]));
    const loginAccounts=await loadLoginAccounts(client);
    const loginByWorker=new Map(loginAccounts.map(account => [account.worker_id,account]));
    for (const person of [...state.employees,...state.freelancers]) {
      const account=loginByWorker.get(person.id);
      if (account) person.accountStatus=account.status;
    }
    const allocations = (await loadAllocations(client)).filter(a => a.state !== 'RESERVED');
    if (group === 'workflows' && rosterMethods.has(method)) {
      const previous = structuredClone(state);
      const result = rosterOperation(state, {...auth,workerId}, method, translate(args,inward));
      await saveState(client,state,previous);
      return translate(result,outward);
    }
    if(group==='workflows' && method==='assignPlatformWorker' && args[1]?.kind==='TRAINING') {
      const input=translate(args[1],inward);
      const candidate=state.candidates.find(c=>c.id===input.workerId||c.registeredWorkerId===input.workerId);
      const personId=candidate?.registeredWorkerId??input.workerId;
      if(!candidate || !loginByWorker.has(personId))throw new ApiError(422,'REGISTRATION_REQUIRED','Choose a registered candidate with a linked login from Candidates.');
      if(candidate.status==='PLACED')throw new ApiError(409,'ASSIGNMENT_CONFLICT','This candidate has already moved to Training.');
      if(candidate.dept!==input.dept)throw new ApiError(422,'WORKER_MISMATCH','Training must use the candidate’s registered department.');
      const capacity=workforceVacancies(auth,state).find(p=>p.code===args[0])?.departments.find(d=>d.dept===input.dept)?.shifts[input.shift];
      if(!capacity?.available)throw new ApiError(409,'CAPACITY_CONFLICT','No training seats remain for this platform, department and shift.');
    }
    if (group === 'workflows' && method === 'getWorkforceVacancies') return workforceVacancies(auth,state);
    if (group === 'workflows' && trainingRecoveryMethods.has(method)) {
      const previous=structuredClone(state);
      const registeredIds=new Set(loginAccounts.filter(a=>a.status==='ACTIVE'&&['EMPLOYEE','FREELANCER'].includes(a.role)).map(a=>a.worker_id));
      const result=trainingRecoveryOperation(auth,state,method,translate(args,inward),registeredIds);
      if(method==='linkTrainingStaff')await saveState(client,state,previous);
      return translate(result,outward);
    }
    if (group === 'workflows' && method === 'assignQualifiedWorker') {
      const previous=structuredClone(state);
      const result=assignQualifiedWorker(auth,state,translate(args,inward));
      const identity=await finalizeStaffIdentity(client,state,result.id,auth);
      if(identity.oldId!==identity.newId){const userId=outward.get(identity.oldId);outward.delete(identity.oldId);if(userId)outward.set(identity.newId,userId);}
      await saveState(client,state,previous);
      await projectPlatforms(client,state,previous);
      return translate(state.trainingAssignments.find(t=>t.id===result.id),outward);
    }
    if (group === 'workflows' && employeeReleaseMethods.has(method)) {
      const previous=structuredClone(state);
      const result=await employeeReleaseOperation(client,auth,state,method,translate(args,inward));
      if (method !== 'getEmployeeReleaseInfo') await saveState(client,state,previous);
      return translate(result,outward);
    }
    if (group === 'workflows' && method === 'setEmployeeLoginAccess') {
      const previous=structuredClone(state);
      const result=await setEmployeeLoginAccess(client,auth,state,translate(args,inward));
      await saveState(client,state,previous);
      return translate(result,outward);
    }
    if (group === 'workflows' && employeeCareerMethods.has(method)) {
      const previous=structuredClone(state);
      const result=await employeeCareerOperation(client,auth,state,method,translate(args,inward),allocations);
      if (method !== 'getEmployeeCareerOptions') {
        await saveState(client,state,previous);
        await projectPlatforms(client,state,previous);
      }
      return translate(result,outward);
    }
    if (group === 'workflows' && employeePlatformMethods.has(method)) {
      const previous = structuredClone(state);
      const translated = translate(args,inward);
      if (method === 'setEmployeePlatform') {
        const account = (await client.query('SELECT u.status FROM users u JOIN operational_accounts a ON a.user_id=u.id WHERE a.worker_id=$1',[translated[0]])).rows[0];
        if (account && account.status !== 'ACTIVE') throw new ApiError(422,'EMPLOYEE_INELIGIBLE','This employee’s login is inactive.');
        if (allocations.some(a => a.workerId === translated[0] && a.state !== 'CANCELLED' && Date.parse(`${a.date}T${a.shift === 'MORNING' ? '07' : '19'}:30:00+05:30`)+12*3600000 > Date.now())) throw new ApiError(409,'ALLOCATION_CONFLICT','Resolve existing equipment reservations before changing platform.');
      }
      const result = employeePlatformOperation(auth,state,method,translated);
      await saveState(client,state,previous);
      if (method === 'setEmployeePlatform') await projectPlatforms(client,state,previous);
      return translate(result,outward);
    }
    if (group === 'workflows' && equipmentMethods.has(method)) {
      const previous = structuredClone(state);
      const result = await equipmentOperation(client,{...auth,workerId},state,method,translate(args,inward),allocations);
      await saveState(client,state,previous);
      return translate(result,outward);
    }
    if (method === 'assignLaptop') throw new ApiError(422,'SHIFT_REQUIRED','Use the dated shift allocation action.');
    if (['submitHandoverConfirmation','confirmReceipt','confirmOutgoing','submitHandover'].includes(method) && String(args[0]).startsWith('ALLOC-')) {
      const h = state.handovers.find(h => h.id === args[0]);
      const boundary = h ? Date.parse(h.scheduledAt) : NaN;
      if (h && (Date.now() < boundary-15*60000 || Date.now() >= boundary+12*3600000)) throw new ApiError(422,'HANDOVER_WINDOW','Confirm receipt during the allocated shift handover window.');
    }
    if (method === 'correctAttendanceHandover') {
      const a = allocations.find(a => a.handoverId === args[0] && a.state !== 'CANCELLED');
      const input = translate(args[1],inward);
      if (a && (input?.assetId !== a.assetId || input?.incomingId !== a.workerId)) throw new ApiError(409,'ALLOCATION_CONFLICT','Allocation-backed handovers retain their reserved worker and equipment. Cancel an unstarted reservation to reassign it.');
    }
    // Apply operational status filters after the database allocation summary is calculated.
    const statusFilter = method === 'listPlatforms' ? args[0]?.opStatus : null;
    if (statusFilter) args = [{...args[0],opStatus:undefined},...args.slice(1)];
    const engine = await createDomain();
    const target = group === 'breaks' ? engine.breaks : engine.methods;
    if (!Object.hasOwn(target, method) || typeof target[method] !== 'function') throw new ApiError(404, 'NOT_FOUND', 'Operation not found.');
    if (group !== 'breaks' && auth.user.role !== 'SUPERVISOR' && !staff.has(method)) throw new ApiError(403, 'FORBIDDEN', 'Supervisor access is required.');
    const required = group === 'breaks' ? ({ policy: 'breaks.policy', decide: 'breaks.review', review: 'breaks.review', correct: 'attendance.correct' }[args[0]?.kind] ?? (['export','exportStatus'].includes(method) ? 'reports.export' : null)) : grants[method];
    if (required && !auth.permissions.includes(required)) throw new ApiError(403, 'FORBIDDEN', 'The required action permission is missing.');
    const supervisors = (await client.query("SELECT u.id,u.name,u.email,u.title,u.role,a.worker_id FROM users u JOIN operational_accounts a ON a.user_id=u.id WHERE u.role='SUPERVISOR' AND u.status='ACTIVE'")).rows.map(user => ({ ...user, id: user.worker_id }));
    const hydrated = structuredClone(state);
    for(const person of [...hydrated.employees,...hydrated.freelancers])if(!person.id.startsWith('CND-'))person.staffNumber=person.id;
    for(const candidate of hydrated.candidates)candidate.candidateReference??=candidate.id;
    for(const training of hydrated.trainingAssignments)training.candidateReference??=hydrated.candidates.find(c=>c.registeredWorkerId===training.workerId||c.id===training.workerId)?.id??training.workerId;
    if (['getEmployee','listEmployees'].includes(method)) for (const employee of hydrated.employees) {
      employee.offDaysUsed = offDayBalance(state,employee).used;
      const held = state.laptops.find(l => l.currentUserId === employee.id);
      employee.currentWorkstationId = held?.workstationId ?? null;
      employee.workstationState = held ? 'IN_USE' : null;
    }
    engine.hydrate(hydrated, supervisors);
    engine.setOperationalClock(new Date().toISOString());
    engine.setAuthContext({ userId: workerId, role: auth.user.role, name: auth.user.name, permissions: auth.permissions });
    let result;
    try { result = await (method === 'listHandovers' && auth.user.role !== 'SUPERVISOR' ? engine.methods.getMyHandovers() : target[method](...translate(args, inward))); }
    catch (error) {
      if (Number.isInteger(error.status) && error.status >= 400 && error.status < 500) throw new ApiError(error.status, error.code ?? 'VALIDATION', error.message);
      if (error.name === 'TypeError' || error.name === 'RangeError' || error.name === 'ZodError') throw new ApiError(422, 'VALIDATION', 'The supplied operation arguments are invalid.');
      throw error;
    }
    const updated = engine.snapshot();
    if (platformCommands.has(method)) {
      for (const a of allocations.filter(a => a.state !== 'CANCELLED' && Date.parse(`${a.date}T${a.shift === 'MORNING' ? '07' : '19'}:30:00+05:30`)+12*3600000 > Date.now())) {
        const p = updated.platforms.find(p => p.code === a.platformCode);
        if (!p || Number(a.workstationId.split('-').at(-1)) > (p.departments[a.dept] ?? 0)) throw new ApiError(409,'ALLOCATION_CONFLICT','Cancel affected equipment allocations before reducing platform capacity.');
        if (a.state === 'RESERVED' && !updated.employees.some(w => w.id === a.workerId && w.platformCode === a.platformCode && w.dept === a.dept && w.shift === a.shift) && !updated.freelancers.some(w => w.id === a.workerId && w.currentPlatform === a.platformCode && w.dept === a.dept)) throw new ApiError(409,'ALLOCATION_CONFLICT','Cancel the worker’s reserved equipment before changing their platform.');
      }
    }
    await syncReceipts(client,updated,allocations);
    await saveState(client, updated, state);
    if (group === 'workflows' && platformCommands.has(method)) await projectPlatforms(client, updated, state);
    const equipmentState={...updated,handovers:updated.handovers.filter(h => h.receivedAt && (h.outgoingConfirmedAt || h.selfConfirmationReason))};
    result = withoutPendingHandovers(enrichEquipment(result ?? null,equipmentState,allocations,method === 'getDashboard' ? args[0] ?? {} : {}));
    if (method === 'getEmployee' && result?.employee) {
      const employee = updated.employees.find(e => e.id === result.employee.id);
      result.offDayBalance = offDayBalance(updated,employee);
      result.employee.offDaysUsed = result.offDayBalance.used;
      result.employee.loginAccess=loginAccessMetadata(loginByWorker.get(employee.id),auth);
      result.platformHistory = employee.platformHistory ?? (employee.platformCode ? [{platformCode:employee.platformCode,from:employee.joinedAt,to:null,reason:'Existing assignment'}] : []);
    }
    if (method === 'listEmployees') for (const employee of result.items) {
      employee.offDaysUsed = offDayBalance(updated,employee).used;
      employee.loginAccess=loginAccessMetadata(loginByWorker.get(employee.id),auth);
    }
    if (statusFilter && Array.isArray(result)) result = result.filter(p => p.opStatus === statusFilter);
    if (group === 'workflows' && method === 'getProfile') result = projectRosterProfile(state,result,translate(args[0],inward),args[2]);
    return translate(result, outward);
  });
}
