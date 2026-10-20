import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../../shared/errors.js';
import { workforceVacancies } from './workforce-vacancies.js';

function trainingWorker(state,t) {
  const records=t.workerType==='PERMANENT'?state.employees:t.workerType==='FREELANCER'?state.freelancers:[...state.employees,...state.freelancers];
  const candidate=state.candidates?.find(c=>c.id===t.workerId||c.id===t.candidateReference);
  return records.find(w=>w.id===t.workerId) ?? records.find(w=>candidate?.registeredWorkerId && w.id===candidate.registeredWorkerId);
}

export const trainingRecoveryMethods=new Set(['getTrainingStaffContext','linkTrainingStaff']);
export function trainingRecoveryOperation(auth,state,method,args,registeredIds) {
  if(auth.user.role!=='SUPERVISOR')throw new ApiError(403,'FORBIDDEN','Only supervisors can reconcile training records.');
  const [id,input]=method==='linkTrainingStaff'
    ?z.tuple([z.string(),z.object({workerId:z.string(),samePerson:z.literal(true),reason:z.string().trim().min(5).max(1000),expectedWorkerId:z.string()}).strict()]).parse(args)
    :z.tuple([z.string()]).parse(args);
  const t=state.trainingAssignments.find(t=>t.id===id);
  if(!t)throw new ApiError(404,'NOT_FOUND','Training record not found.');
  const existing=trainingWorker(state,t);
  const records=t.workerType==='PERMANENT'?state.employees:state.freelancers;
  const options=records.filter(w=>registeredIds.has(w.id)&&w.dept===t.dept&&w.status==='ACTIVE'&&w.accountStatus==='ACTIVE'&&w.qualifiedForProduction===false&&w.lifecycle!=='PRODUCTION_ACTIVE'&&!state.trainingAssignments.some(other=>other.id!==id&&other.workerId===w.id&&!other.promotedAt&&other.trainingStatus!=='TRAINING_FAILED'));
  if(method==='getTrainingStaffContext'){
    const candidate=state.candidates?.find(c=>c.id===t.workerId||c.id===t.candidateReference);
    return {missing:!existing,workerId:existing?.id??null,options:existing?[]:options.map(w=>({id:w.id,name:w.name,reference:w.candidateReference??w.id})),registration:{name:candidate?.name??t.workerName,email:candidate?.email??'',phone:candidate?.phone??'',dept:t.dept,employmentType:t.workerType==='PERMANENT'?'PERMANENT':'FREELANCER',position:candidate?.position??'Agent'}};
  }
  if(existing)throw new ApiError(409,'STAFF_ALREADY_LINKED','This training already has a staff record. Refresh before assigning.');
  if(t.promotedAt||t.workerId!==input.expectedWorkerId||t.trainingStatus!=='TRAINING_COMPLETED'||t.evaluation?.result!=='PASSED')throw new ApiError(409,'CONCURRENCY_CONFLICT','Training changed or is not ready for assignment. Refresh first.');
  const worker=options.find(w=>w.id===input.workerId);
  if(!worker)throw new ApiError(422,'WORKER_INELIGIBLE','Choose an active registered staff member of the same department and employment type who has no other training placement.');
  const at=new Date().toISOString(),oldId=t.workerId;
  t.originalWorkerId??=oldId;
  t.workerId=worker.id;t.workerName=worker.name;t.updatedAt=at;
  Object.assign(worker,{lifecycle:'TRAINING_COMPLETED',qualifiedForProduction:false});
  for(const position of state.platformPositions.filter(p=>p.platformCode===t.platformCode&&p.dept===t.dept&&(p.assignedWorkerId===oldId||p.reservedForWorkerId===oldId))){if(position.assignedWorkerId===oldId){position.assignedWorkerId=worker.id;position.assignedWorkerName=worker.name;}if(position.reservedForWorkerId===oldId)position.reservedForWorkerId=worker.id;position.updatedAt=at;}
  for(const candidate of state.candidates??[])if(candidate.id===oldId||candidate.registeredWorkerId===worker.id){candidate.registeredWorkerId=worker.id;candidate.status='PLACED';}
  state.audit.unshift({id:`AUD-${randomUUID()}`,at,actorId:auth.user.id,actorName:auth.user.name,role:'SUPERVISOR',action:'TRAINING_STAFF_LINK_REPAIRED',entity:'Training',entityId:id,platformCode:t.platformCode,dept:t.dept,previous:oldId,next:worker.id,reason:input.reason,isOverride:false});
  return {missing:false,workerId:worker.id,options:[]};
}

export function assignQualifiedWorker(auth, state, args) {
  if (auth.user.role !== 'SUPERVISOR') throw new ApiError(403,'FORBIDDEN','Only supervisors can assign qualified staff.');
  const [id,input] = z.tuple([z.string().min(1),z.object({platformCode:z.string().min(1),shift:z.enum(['MORNING','NIGHT'])}).strict()]).parse(args);
  const t = state.trainingAssignments.find(t => t.id === id);
  if (!t || t.promotedAt || t.trainingStatus !== 'TRAINING_COMPLETED' || t.evaluation?.result !== 'PASSED') throw new ApiError(409,'TRAINING_REQUIRED','Complete and pass training before assigning this person.');
  if (t.completedTrainingDays < t.requiredTrainingDays) throw new ApiError(409,'TRAINING_REQUIRED','Complete all training days before production assignment.');
  const worker = trainingWorker(state,t);
  if (!worker) throw new ApiError(422,'STAFF_RECORD_MISSING','This training points to a missing staff record. Link it to the correct registered employee or freelancer before assigning a platform.');
  const employee = state.employees.find(w => w.id === worker.id);
  const freelancer = state.freelancers.find(w => w.id === worker.id);
  if (worker.status !== 'ACTIVE' || worker.accountStatus !== 'ACTIVE') throw new ApiError(422,'WORKER_INELIGIBLE','This staff member or their login is inactive. Reactivate the correct employment record and login before assigning a platform.');
  if(worker.dept!==t.dept)throw new ApiError(422,'WORKER_MISMATCH','The training department must match the registered staff record.');
  if (worker.qualifiedForProduction === true && worker.lifecycle === 'PRODUCTION_ACTIVE') throw new ApiError(409,'ALREADY_ASSIGNED','This person is already assigned to production. Use the directory to change their platform.');
  const p = state.platforms.find(p => p.code === input.platformCode && p.status === 'ACTIVE' && p.lifecycle !== 'SETUP' && p.departments[t.dept] > 0);
  if (!p) throw new ApiError(422,'PLATFORM_INELIGIBLE','Choose an active platform configured for this department.');
  if (state.trainingAssignments.some(other => other.id !== id && other.workerId === worker.id && !other.promotedAt && other.trainingStatus !== 'TRAINING_FAILED')) throw new ApiError(409,'TRAINING_REQUIRED','Resolve other active training assignments first.');
  const capacity=workforceVacancies(auth,state).find(v=>v.code===p.code).departments.find(d=>d.dept===t.dept).shifts[input.shift];
  const alreadyReserved=t.platformCode===p.code && t.shift===input.shift ? 1 : 0;
  if (capacity.used-alreadyReserved >= capacity.capacity) throw new ApiError(409,'CAPACITY_CONFLICT','This department and shift are full. Choose another platform or shift.');
  if (state.laptops.some(l => l.currentUserId === worker.id && l.platformCode !== p.code)) throw new ApiError(409,'DEVICE_RETURN_REQUIRED','Return the device held on the previous platform first.');
  const at = new Date().toISOString();
  if(t.workerId!==worker.id){state.audit.unshift({id:`AUD-${randomUUID()}`,at,actorId:auth.user.id,actorName:auth.user.name,role:auth.user.role,action:'TRAINING_STAFF_LINK_REPAIRED',entity:'Training',entityId:t.id,platformCode:t.platformCode,dept:t.dept,previous:t.workerId,next:worker.id,reason:'Resolved the existing registered candidate-to-staff link',isOverride:false});t.originalWorkerId??=t.workerId;t.workerId=worker.id;}
  for (const pos of state.platformPositions.filter(pos => pos.assignedWorkerId === worker.id || pos.reservedForWorkerId === worker.id)) Object.assign(pos,{status:'VACANT',assignedWorkerId:null,assignedWorkerName:null,assignedWorkerType:null,reservedForWorkerId:null,workstationId:null,updatedAt:at});
  Object.assign(worker,{lifecycle:'PRODUCTION_ACTIVE',qualifiedForProduction:true,trainingId:t.id});
  if (employee) {
    employee.platformHistory ??= [];
    for (const entry of employee.platformHistory) if (!entry.to) entry.to=at;
    employee.platformHistory.unshift({platformCode:p.code,from:at,to:null,reason:'Supervisor assignment after passed training'});
    Object.assign(employee,{platformCode:p.code,categoryCode:p.categoryCode,poolId:`POOL-${p.code.replace('-','')}-${t.dept}`,shift:input.shift,nextShift:input.shift === 'MORNING' ? 'NIGHT' : 'MORNING',slot:0,positionCode:undefined});
  } else Object.assign(freelancer,{currentPlatform:p.code,compatiblePlatforms:[p.code],compatibleCategories:[p.categoryCode]});
  // Retain the original training location; production placement is explicit history.
  Object.assign(t,{promotedAt:at,productionPlatformCode:p.code,productionShift:input.shift,updatedAt:at});
  for (const platform of state.platforms.filter(platform => [t.platformCode,p.code].includes(platform.code))) {platform.revision=(platform.revision ?? 1)+1;platform.updatedAt=at;}
  state.audit.unshift({id:`AUD-${randomUUID()}`,at,actorId:auth.user.id,actorName:auth.user.name,role:auth.user.role,action:'QUALIFIED_WORKER_ASSIGNED',entity:'Training',entityId:t.id,platformCode:p.code,dept:t.dept,previous:t.platformCode,next:`${p.code} / ${input.shift}`,reason:'Supervisor assigned staff after successful training',isOverride:false});
  return t;
}
