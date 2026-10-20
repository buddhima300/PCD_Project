import { translate } from './store.js';
import { audit } from '../audit/audit.model.js';

// The SQL worker UUID and login UUID never change. Only the business reference changes.
export async function finalizeStaffIdentity(client,state,trainingId,auth) {
  const training=state.trainingAssignments.find(t=>t.id===trainingId);
  const worker=[...state.employees,...state.freelancers].find(w=>w.id===training.workerId);
  const oldId=worker.id;
  const prefix=state.employees.includes(worker)?'EMP':'FL';
  if (!oldId.startsWith('CND-')) {worker.staffNumber=oldId;training.staffNumber=oldId;return {oldId,newId:oldId};}
  const numbers=[...state.employees,...state.freelancers].filter(w=>new RegExp(`^${prefix}-[0-9]+$`).test(w.id)).map(w=>Number(w.id.split('-')[1]));
  const stored=(await client.query('SELECT worker_number FROM workers WHERE worker_number LIKE $1',[`${prefix}-%`])).rows.map(row=>Number(row.worker_number.slice(prefix.length+1))).filter(Number.isFinite);
  const maximum=Math.max(0,...numbers,...stored);
  await client.query('INSERT INTO staff_number_counters(prefix,next_number) VALUES($1,$2) ON CONFLICT(prefix) DO UPDATE SET next_number=GREATEST(staff_number_counters.next_number,excluded.next_number)',[prefix,maximum+1]);
  const number=(await client.query('UPDATE staff_number_counters SET next_number=next_number+1 WHERE prefix=$1 RETURNING next_number-1 AS number',[prefix])).rows[0].number;
  const newId=`${prefix}-${String(number).padStart(5,'0')}`;
  const candidates=state.candidates.map(c=>({...c,candidateReference:c.candidateReference??c.id,registeredWorkerId:c.registeredWorkerId===oldId?newId:c.registeredWorkerId}));
  const mapping=new Map([[oldId,newId]]);
  for(const key of Object.keys(state)) if(key!=='candidates')state[key]=translate(state[key],mapping);
  state.candidates=candidates;
  for(const entry of state.audit)if(entry.entity==='RecruitCandidate'&&entry.entityId===newId)entry.entityId=oldId;
  const promoted=[...state.employees,...state.freelancers].find(w=>w.id===newId);
  promoted.candidateReference=oldId;promoted.staffNumber=newId;
  for(const t of state.trainingAssignments.filter(t=>t.workerId===newId))t.candidateReference??=oldId;
  state.trainingAssignments.find(t=>t.id===trainingId).staffNumber=newId;
  await client.query('UPDATE workers SET worker_number=$1,revision=revision+1 WHERE worker_number=$2',[newId,oldId]);
  await client.query('UPDATE operational_accounts SET worker_id=$1 WHERE worker_id=$2',[newId,oldId]);
  await client.query('UPDATE equipment_allocations SET worker_id=$1 WHERE worker_id=$2',[newId,oldId]);
  await audit(client,auth.user.id,'STAFF_NUMBER_ISSUED','worker',promoted.uuid,{candidateReference:oldId,staffNumber:newId,trainingId});
  return {oldId,newId};
}
