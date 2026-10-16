import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { transaction } from '../../db/pool.js';
import { email, password, text } from '../../shared/validation.js';
import { hashPassword } from '../../shared/security.js';
import { ApiError } from '../../shared/errors.js';
import { audit } from '../audit/audit.model.js';
import { publicUser } from '../auth/auth.model.js';
import { createDomain } from '../operations/runtime.js';
import { loadState, saveState, linkAccount } from '../operations/store.js';

export const registrationInput = z.object({
  name: text, email, password, phone: z.string().trim().max(50).default(''),
  dept: z.enum(['GS','DP','WD','SAFETY']), employmentType: z.enum(['PERMANENT','FREELANCER']),
  position: text, interviewResult: z.enum(['SELECTED','RECOMMENDED','PENDING']),
  notes: z.string().trim().max(2000).default(''),
}).strict();

export async function registerStaff(db, actor, input) {
  const hash = await hashPassword(input.password);
  return transaction(db, async client => {
    await client.query('SELECT pg_advisory_xact_lock(726343)');
    const previous = await loadState(client);
    if ([...previous.employees, ...previous.freelancers, ...previous.candidates].some(worker => worker.email.toLowerCase() === input.email)) throw new ApiError(409, 'CONFLICT', 'A workforce record already uses this email.');
    const actorId = await linkAccount(client, actor, previous);
    const engine = await createDomain();
    engine.hydrate(structuredClone(previous), []);
    engine.setAuthContext({ userId: actorId, role: actor.role, name: actor.name });
    const joinedAt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
    const { password: _password, ...details } = input;
    const candidate = await engine.methods.createCandidate({ ...details, interviewDate: joinedAt });
    const state = engine.snapshot();
    const role = input.employmentType === 'PERMANENT' ? 'EMPLOYEE' : 'FREELANCER';
    const workers = role === 'EMPLOYEE' ? state.employees : state.freelancers;
    const prefix = role === 'EMPLOYEE' ? 'EMP' : 'FL';
    let number = role === 'EMPLOYEE' ? state.sequences.empSeq : Math.max(0, ...workers.map(worker => Number(worker.id.split('-')[1]) || 0)) + 1;
    let workerId;
    do { workerId = `${prefix}-${String(number++).padStart(5,'0')}`; } while (workers.some(worker => worker.id === workerId));
    if (role === 'EMPLOYEE') state.sequences.empSeq = number;
    const id = randomUUID(); const workerUuid = randomUUID();
    const user = (await client.query('INSERT INTO users(id,email,name,title,role,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [id,input.email,input.name,input.position,role,hash])).rows[0];
    const base = { uuid:workerUuid, id:workerId, name:input.name, email:input.email, phone:input.phone, dept:input.dept, status:'ACTIVE', accountStatus:'ACTIVE', joinedAt, lifecycle:'PLATFORM_PLACEMENT_REQUIRED', qualifiedForProduction:false };
    if (role === 'EMPLOYEE') workers.push({ ...base, position:input.position, platformCode:'', categoryCode:'', poolId:'', slot:0, shift:'MORNING', nextShift:'NIGHT', currentWorkstationId:null, workstationState:null, offDaysUsed:0, offDaysAllowance:4 });
    else { workers.push({ ...base, employmentType:'EXTERNAL', priority:workers.filter(worker => worker.dept === input.dept).length + 1, compatibleCategories:[], compatiblePlatforms:[], currentAssignmentId:null, currentPlatform:null }); state.availability[workerId] = {}; }
    Object.assign(state.candidates.find(record => record.id === candidate.id), { registeredWorkerId:workerId, createdAt:joinedAt });
    await client.query('INSERT INTO workers(id,worker_number,user_id,name,email,phone,worker_type,department_code,position,joined_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [workerUuid,workerId,id,input.name,input.email,input.phone,role,input.dept,input.position,joinedAt]);
    await client.query('INSERT INTO operational_accounts(user_id,worker_id,role) VALUES($1,$2,$3)', [id,workerId,role]);
    await saveState(client, state, previous);
    await audit(client, actor.id, 'STAFF_REGISTERED', 'worker', workerUuid, { userId:id, workerId, candidateId:candidate.id });
    return { user:publicUser(user), workerId, candidate:state.candidates.find(record => record.id === candidate.id) };
  });
}
