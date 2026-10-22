import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../../shared/errors.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s);
const context = z.object({poolId:z.string().min(1),date:day,shift:z.enum(['MORNING','NIGHT'])}).strict();
const create = context.extend({assetId:z.string().min(1),workerId:z.string().min(1)}).strict();
export const equipmentMethods = new Set(['getEquipmentAllocations','reserveEquipment','cancelEquipmentAllocation','getSharedDevices','receiveSharedDevice','returnSharedDevice','registerPlatformDevice','listLaptopModels','addLaptopModel','updateLaptopModel']);
export function shiftContext(now = new Date()) {
  const local = new Date(now.getTime()+330*60000);
  const minutes = local.getUTCHours()*60+local.getUTCMinutes();
  const shift = minutes >= 450 && minutes < 1170 ? 'MORNING' : 'NIGHT';
  if (minutes < 450) local.setUTCDate(local.getUTCDate()-1);
  return {date:local.toISOString().slice(0,10),shift};
}
const start = (date,shift) => new Date(`${date}T${shift === 'MORNING' ? '07' : '19'}:30:00+05:30`).toISOString();
const instant = value => Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}+05:30`);
const fail = (code,message,status=409) => { throw new ApiError(status,code,message); };
export async function loadAllocations(client) {
  return (await client.query('SELECT * FROM equipment_allocations ORDER BY created_at DESC')).rows.map(r => ({id:r.id,workerId:r.worker_id,workerName:r.worker_name,platformCode:r.platform_code,dept:r.department,poolId:r.pool_id,assetId:r.asset_id,workstationId:r.workstation_id,date:r.shift_date,shift:r.shift,state:r.state,handoverId:r.handover_id,createdAt:r.created_at,receivedAt:r.received_at,cancellationReason:r.cancellation_reason}));
}
function pool(state,id) {
  const lap = state.laptops.find(l => l.poolId === id);
  // Pool identifiers are constructed by the existing platform domain.
  const p = state.platforms.find(p => Object.keys(p.departments).some(d => `POOL-${p.code.replace('-','')}-${d}` === id)) ?? state.platforms.find(p => p.code === lap?.platformCode);
  const dept = lap?.dept ?? Object.keys(p?.departments ?? {}).find(d => id.endsWith(`-${d}`) || id.endsWith(`_${d}`));
  if (!p || !dept) fail('NOT_FOUND','Workstation pool not found.',404);
  return {p,dept,capacity:p.departments[dept] ?? 0};
}
export function eligibleWorkers(state,p,dept,date,shift) {
  const absent = new Set(state.offDays.filter(o => o.date === date && ['APPROVED','OVERRIDE_APPROVED'].includes(o.status)).map(o => o.employeeId));
  const replacements = state.replacements.filter(r => r.date === date && r.shift === shift && r.platformCode === p.code && r.dept === dept && ['ASSIGNED','CONFIRMED'].includes(r.status));
  const replaced = new Set(replacements.map(r => r.absentEmployeeId));
  const employees = state.employees.filter(w => w.platformCode === p.code && w.dept === dept && w.shift === shift && w.status === 'ACTIVE' && w.accountStatus !== 'LOCKED' && !absent.has(w.id) && !replaced.has(w.id) && (w.qualifiedForProduction !== false || state.trainingAssignments.some(t => t.workerId === w.id && !t.promotedAt && t.trainingStatus !== 'TRAINING_FAILED')));
  const freelancers = state.freelancers.filter(w => w.status === 'ACTIVE' && w.accountStatus !== 'LOCKED' && w.dept === dept && (replacements.some(r => r.freelancerId === w.id) || (w.currentPlatform === p.code && state.trainingAssignments.some(t => t.workerId === w.id && (t.productionShift ?? t.shift) === shift && (t.productionPlatformCode ?? t.platformCode) === p.code && t.trainingStatus !== 'TRAINING_FAILED'))));
  return [...employees,...freelancers].map(w => ({id:w.id,name:w.name,training:w.qualifiedForProduction === false}));
}
function usable(state,l,capacity) {
  return !!l.workstationId && Number(l.workstationId.split('-').at(-1)) <= capacity && !['RETIRED','MAINTENANCE','INCIDENT'].includes(l.status) && l.condition !== 'DAMAGED' && !state.incidents.some(i => i.assetId === l.assetId && i.status !== 'RESOLVED');
}
function sharedDeviceOperation(auth,state,method,args,allocations) {
  if (!['EMPLOYEE','FREELANCER'].includes(auth.user.role)) fail('FORBIDDEN','Receive shared devices under your own staff account.',403);
  const id = auth.workerId;
  const current = shiftContext();
  const boundary = Date.parse(start(current.date,current.shift));
  if (method === 'returnSharedDevice') {
    z.tuple([]).parse(args);
    const laptop = state.laptops.find(l => l.currentUserId === id);
    if (!laptop) fail('NO_CUSTODY','You do not currently hold a device.');
    const receipt = state.handovers.filter(h => h.incomingId === id && h.receivedAt && !h.equipmentOnly).sort((a,b) => instant(b.scheduledAt)-instant(a.scheduledAt))[0];
    if (!receipt) fail('HANDOVER_REQUIRED','Ask your supervisor to reconcile the existing device custody.');
    const scheduled = instant(receipt.scheduledAt)+12*3600000;
    if (Date.now() < scheduled-15*60000) fail('TOO_EARLY','Device return opens 15 minutes before the shift ends.',422);
    let h = state.handovers.find(h => h.assetId === laptop.assetId && instant(h.scheduledAt) === scheduled);
    if (!h) {
      h = {id:`SHARED-${randomUUID()}`,assetId:laptop.assetId,workstationId:laptop.workstationId,poolId:laptop.poolId,platformCode:laptop.platformCode,dept:laptop.dept,outgoingId:id,outgoingName:auth.user.name,incomingId:'',incomingName:'Next worker may receive this device',outgoingShift:receipt.incomingShift,incomingShift:receipt.incomingShift === 'MORNING' ? 'NIGHT' : 'MORNING',scheduledAt:new Date(scheduled).toISOString(),status:'PENDING',outgoingConfirmedAt:null,receivedAt:null,checklist:null,incidentId:null,attendanceTracked:true,revision:0};
      state.handovers.push(h);
    }
    if (h.outgoingId !== id) fail('HANDOVER_CONFLICT','Ask your supervisor to review the outgoing device holder.');
    return h;
  }
  const worker = state.employees.find(w => w.id === id) ?? state.freelancers.find(w => w.id === id);
  if (!worker) fail('NOT_FOUND','Staff record not found.',404);
  const platform = state.platforms.find(p => p.status === 'ACTIVE' && p.lifecycle !== 'SETUP' && eligibleWorkers(state,p,worker.dept,current.date,current.shift).some(w => w.id === id));
  if (!platform) {
    if (method === 'getSharedDevices') return {...current,poolId:'',assets:[]};
    fail('WORKER_INELIGIBLE','You must be rostered on an active platform for this shift.',422);
  }
  const poolId = `POOL-${platform.code.replace('-','')}-${worker.dept}`;
  const options = state.laptops.filter(l => l.poolId === poolId && usable(state,l,platform.departments[worker.dept]) && l.currentUserId !== id
    && !allocations.some(a => a.assetId === l.assetId && a.date === current.date && a.shift === current.shift && a.state !== 'CANCELLED')
    && !state.handovers.some(h => h.assetId === l.assetId && instant(h.scheduledAt) === boundary && h.incomingId && (!h.receivedAt || l.currentUserId)));
  if (method === 'getSharedDevices') { z.tuple([]).parse(args); return {...current,poolId,assets:options.map(l => ({assetId:l.assetId,model:l.model,currentUserName:l.currentUserName}))}; }
  const [assetId] = z.tuple([z.string().min(1).max(100)]).parse(args);
  const existing = state.handovers.find(h => h.incomingId === id && (!h.receivedAt || (!h.outgoingConfirmedAt && !h.selfConfirmationReason)) && instant(h.scheduledAt) === boundary);
  if (existing) {
    if (existing.assetId === assetId) return existing;
    fail('HANDOVER_PENDING','Finish your pending receipt before choosing another device.');
  }
  const laptop = options.find(l => l.assetId === assetId);
  if (!laptop) fail('EQUIPMENT_UNAVAILABLE','This device is unavailable. Refresh the shared pool.');
  const equipmentOnly = state.handovers.some(h => h.incomingId === id && instant(h.scheduledAt) === boundary && h.receivedAt);
  const h = state.handovers.find(h => h.assetId === assetId && instant(h.scheduledAt) === boundary && !h.incomingId);
  if (h) {Object.assign(h,{incomingId:id,incomingName:worker.name,equipmentOnly,revision:(h.revision ?? 0)+1});return h;}
  const handover = {id:`SHARED-${randomUUID()}`,assetId,workstationId:laptop.workstationId,poolId,platformCode:platform.code,dept:worker.dept,outgoingId:laptop.currentUserId ?? '',outgoingName:laptop.currentUserName ?? 'No outgoing worker',incomingId:id,incomingName:worker.name,outgoingShift:current.shift === 'MORNING' ? 'NIGHT' : 'MORNING',incomingShift:current.shift,scheduledAt:start(current.date,current.shift),status:'PENDING',outgoingConfirmedAt:null,receivedAt:null,checklist:null,incidentId:null,attendanceTracked:!equipmentOnly,equipmentOnly,revision:0};
  state.handovers.push(handover);
  state.audit.unshift({id:`AUD-${randomUUID()}`,at:new Date().toISOString(),actorId:auth.user.id,actorName:auth.user.name,role:auth.user.role,action:'SHARED_DEVICE_SELECTED',entity:'Handover',entityId:handover.id,platformCode:platform.code,dept:worker.dept,previous:'Shared pool',next:assetId,reason:'Staff selected an available shift device',isOverride:false});
  return handover;
}
export async function equipmentOperation(client,auth,state,method,args,allocations) {
  if (['getSharedDevices','receiveSharedDevice','returnSharedDevice'].includes(method)) return sharedDeviceOperation(auth,state,method,args,allocations);
  if (auth.user.role !== 'SUPERVISOR') fail('FORBIDDEN','Only supervisors can allocate workstations.',403);
  const models=()=>[...new Set([...(state.laptopModels??[]),...state.laptops.map(l=>l.model)].filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const modelName=z.string().trim().min(1).max(100);
  if(method==='listLaptopModels'){z.tuple([]).parse(args);return models();}
  if(method==='addLaptopModel'){
    const [name]=z.tuple([modelName]).parse(args);
    const existing=models().find(m=>m.toLowerCase()===name.toLowerCase());
    if(existing)return existing;
    state.laptopModels=[...(state.laptopModels??[]),name];
    return name;
  }
  if(method==='updateLaptopModel'){
    const [assetId,input]=z.tuple([z.string().min(1),z.object({model:modelName,expectedModel:z.string().max(100)}).strict()]).parse(args);
    const laptop=state.laptops.find(l=>l.assetId===assetId);
    if(!laptop)fail('NOT_FOUND','Laptop not found.',404);
    if(laptop.model!==input.expectedModel)fail('CONCURRENCY_CONFLICT','This laptop model changed. Refresh the inventory before editing.');
    const model=models().find(m=>m.toLowerCase()===input.model.toLowerCase());
    if(!model)fail('VALIDATION','Choose a saved laptop model or add it first.',422);
    if(laptop.model===model)return laptop;
    const previous=laptop.model;laptop.model=model;
    state.audit.unshift({id:`AUD-${randomUUID()}`,at:new Date().toISOString(),actorId:auth.user.id,actorName:auth.user.name,role:'SUPERVISOR',action:'LAPTOP_MODEL_UPDATED',entity:'Laptop',entityId:assetId,platformCode:laptop.platformCode,dept:laptop.dept,previous,next:model,reason:'Supervisor updated laptop model from asset inventory',isOverride:false});
    return laptop;
  }
  if (method === 'registerPlatformDevice') {
    const [input] = z.tuple([z.object({poolId:z.string().min(1),workstationId:z.string().min(1).max(100).optional(),assetId:z.string().trim().regex(/^[A-Za-z0-9_-]{1,80}$/),serial:z.string().trim().min(1).max(100),model:z.string().trim().min(1).max(100)}).strict()]).parse(args);
    const {p,dept,capacity} = pool(state,input.poolId);
    if (state.laptops.some(l => l.assetId.toLowerCase() === input.assetId.toLowerCase() || l.serial.toLowerCase() === input.serial.toLowerCase())) fail('DUPLICATE_DEVICE','Asset ID and serial must be unique.');
    const used = new Set(state.laptops.filter(l => l.poolId === input.poolId && l.status !== 'RETIRED').map(l => Number(l.workstationId?.match(/(\d+)$/)?.[1])));
    let slot = 1; while (used.has(slot)) slot++;
    if (input.workstationId) {
      slot = Number(input.workstationId.match(/(\d+)$/)?.[1]);
      const expected = `WS-${p.code.replace(/-/g,'')}-${dept}${String(slot).padStart(2,'0')}`;
      if (!Number.isInteger(slot) || slot < 1 || input.workstationId !== expected || slot > capacity) fail('CAPACITY_CONFLICT','Choose a configured workstation in this pool.');
      if (used.has(slot)) fail('WORKSTATION_UNAVAILABLE','This workstation already has a registered device. Refresh the inventory.');
    }
    if (slot > capacity) fail('CAPACITY_CONFLICT','All device places are registered. Increase platform device capacity first.');
    const laptop = {assetId:input.assetId,serial:input.serial,model:input.model,poolId:input.poolId,platformCode:p.code,dept,workstationId:`WS-${p.code.replace('-','')}-${dept}-${String(slot).padStart(2,'0')}`,status:'AVAILABLE',condition:'GOOD',currentUserId:null,currentUserName:null,currentShift:null,nextUserId:null,nextUserName:null,nextUserNote:null,handoverStatus:null,openIncidentId:null,purchasedAt:new Date().toISOString().slice(0,10)};
    state.laptops.push(laptop);
    state.audit.unshift({id:`AUD-${randomUUID()}`,at:new Date().toISOString(),actorId:auth.user.id,actorName:auth.user.name,role:'SUPERVISOR',action:'PLATFORM_DEVICE_REGISTERED',entity:'Laptop',entityId:laptop.assetId,platformCode:p.code,dept,previous:'Unregistered',next:laptop.poolId,reason:'Shared platform equipment registration',isOverride:false});
    return laptop;
  }
  if (method === 'cancelEquipmentAllocation') {
    const [id,reason] = z.tuple([z.string().uuid(),z.string().trim().min(5).max(1000)]).parse(args);
    const a = allocations.find(a => a.id === id);
    if (!a) fail('NOT_FOUND','Allocation not found.',404);
    const h = state.handovers.find(h => h.id === a.handoverId);
    if (a.state !== 'RESERVED' || h?.receivedAt || h?.outgoingConfirmedAt) fail('ALLOCATION_STARTED','A started or cancelled handover cannot be cancelled.');
    if (allocations.some(n => n.assetId === a.assetId && n.state !== 'CANCELLED' && Date.parse(start(n.date,n.shift)) === Date.parse(start(a.date,a.shift))+12*3600000 && state.handovers.some(h => h.id === n.handoverId && (h.receivedAt || h.outgoingConfirmedAt)))) fail('ALLOCATION_STARTED','The next shift handover has started and depends on this reservation.');
    await client.query("UPDATE equipment_allocations SET state='CANCELLED',cancelled_by=$2,cancelled_at=now(),cancellation_reason=$3 WHERE id=$1",[id,auth.user.id,reason]);
    state.handovers = state.handovers.filter(h => h.id !== a.handoverId);
    a.state = 'CANCELLED'; a.cancellationReason = reason;
    for (const next of allocations.filter(n => n.assetId === a.assetId && n.state === 'RESERVED' && Date.parse(start(n.date,n.shift)) === Date.parse(start(a.date,a.shift))+12*3600000)) {
      const h = state.handovers.find(h => h.id === next.handoverId);
      if (h) {h.outgoingId='';h.outgoingName='No outgoing worker scheduled';}
    }
    audit(state,auth,a,'EQUIPMENT_CANCELLED',reason);
    return a;
  }
  const [input] = z.tuple([method === 'reserveEquipment' ? create : context]).parse(args);
  const {p,dept,capacity} = pool(state,input.poolId);
  const people = eligibleWorkers(state,p,dept,input.date,input.shift);
  const rows = allocations.filter(a => a.poolId === input.poolId && a.date === input.date && a.shift === input.shift);
  const active = allocations.filter(a => a.date === input.date && a.shift === input.shift && a.state !== 'CANCELLED');
  const assets = state.laptops.filter(l => l.poolId === input.poolId && usable(state,l,capacity));
  const existing = state.handovers.filter(h => instant(h.scheduledAt) === Date.parse(start(input.date,input.shift)));
  if (method === 'getEquipmentAllocations') return {date:input.date,shift:input.shift,capacity,people:people.filter(w => !existing.some(h => h.incomingId === w.id && !rows.some(a => a.handoverId === h.id))),assets:assets.map(l => ({assetId:l.assetId,workstationId:l.workstationId,model:l.model,booked:active.some(a => a.assetId === l.assetId || a.workstationId === l.workstationId) || existing.some(h => h.assetId === l.assetId || h.workstationId === l.workstationId)})),allocations:rows};
  if (p.lifecycle !== 'OPERATIONAL' || p.status !== 'ACTIVE') fail('PLATFORM_INACTIVE','Activate this platform before allocating equipment.',422);
  if (Date.parse(start(input.date,input.shift))+12*3600000 <= Date.now()) fail('SHIFT_ENDED','Choose a current or future shift.',422);
  const person = people.find(w => w.id === input.workerId);
  if (!person) fail('WORKER_INELIGIBLE','Choose an active worker assigned to this platform, department and shift.',422);
  const account = (await client.query('SELECT u.status FROM users u JOIN operational_accounts a ON a.user_id=u.id WHERE a.worker_id=$1',[person.id])).rows[0];
  if (account && account.status !== 'ACTIVE') fail('WORKER_INELIGIBLE','This worker’s login is inactive.',422);
  const laptop = assets.find(l => l.assetId === input.assetId);
  if (!laptop) fail('EQUIPMENT_UNAVAILABLE','Choose a usable laptop and workstation within the platform capacity.',422);
  if (active.some(a => a.workerId === person.id || a.assetId === laptop.assetId || a.workstationId === laptop.workstationId)) fail('ALLOCATION_CONFLICT','This worker, laptop or workstation is already allocated for this shift.');
  const boundary = Date.parse(start(input.date,input.shift));
  const current = shiftContext();
  if (input.date === current.date && input.shift === current.shift && state.laptops.some(l => l.currentUserId === person.id && l.assetId !== laptop.assetId && ['ASSIGNED','HANDOVER_PENDING'].includes(l.status))) fail('CURRENT_CUSTODY','This worker still holds another workstation. Complete that handover first.');
  const legacy = state.handovers.filter(h => instant(h.scheduledAt) === boundary && (h.assetId === laptop.assetId || h.incomingId === person.id || h.workstationId === laptop.workstationId));
  if (legacy.length) fail('HANDOVER_CONFLICT','An existing handover reserves this worker or workstation. Review the handover before allocating.');
  if (rows.filter(a => a.state !== 'CANCELLED').length >= capacity) fail('CAPACITY_EXCEEDED','This shift has reached its workstation capacity.');
  const id = randomUUID(), handoverId = `ALLOC-${id}`;
  const a = {id,workerId:person.id,workerName:person.name,platformCode:p.code,dept,poolId:input.poolId,assetId:laptop.assetId,workstationId:laptop.workstationId,date:input.date,shift:input.shift,state:'RESERVED',handoverId};
  await client.query('INSERT INTO equipment_allocations(id,worker_id,worker_name,platform_code,department,pool_id,asset_id,workstation_id,shift_date,shift,handover_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,person.id,person.name,p.code,dept,input.poolId,laptop.assetId,laptop.workstationId,input.date,input.shift,handoverId,auth.user.id]);
  const prior = allocations.filter(a => a.assetId === laptop.assetId && a.state !== 'CANCELLED' && Date.parse(start(a.date,a.shift)) === boundary-12*3600000)[0];
  const outgoingId = prior?.workerId ?? laptop.currentUserId ?? '';
  const outgoingName = prior?.workerName ?? laptop.currentUserName ?? 'No outgoing worker scheduled';
  if (outgoingId === person.id) fail('SAME_WORKER','This worker already holds this laptop. Complete the current handover before reserving another shift.');
  state.handovers.push({id:handoverId,assetId:laptop.assetId,workstationId:laptop.workstationId,poolId:input.poolId,platformCode:p.code,dept,incomingId:person.id,incomingName:person.name,outgoingId,outgoingName,incomingShift:input.shift,outgoingShift:input.shift === 'MORNING' ? 'NIGHT' : 'MORNING',scheduledAt:start(input.date,input.shift),status:'PENDING',outgoingConfirmedAt:null,receivedAt:null,checklist:null,incidentId:null,attendanceTracked:true,revision:0});
  allocations.push(a);
  audit(state,auth,a,'EQUIPMENT_RESERVED',`${person.name} / ${input.date} / ${input.shift}`);
  // Resolve the next boundary even when the supervisor reserves night before morning.
  for (const next of allocations.filter(n => n.assetId === a.assetId && n.state === 'RESERVED' && Date.parse(start(n.date,n.shift)) === boundary+12*3600000)) {
    const h = state.handovers.find(h => h.id === next.handoverId);
    if (h && !h.outgoingConfirmedAt && !h.receivedAt) { h.outgoingId = person.id; h.outgoingName = person.name; }
  }
  return a;
}
function audit(state,auth,a,action,reason) {
  state.audit.unshift({id:`AUD-${randomUUID()}`,at:new Date().toISOString(),actorId:auth.user.id,actorName:auth.user.name,role:auth.user.role,action,entity:'EquipmentAllocation',entityId:a.id,platformCode:a.platformCode,dept:a.dept,previous:action === 'EQUIPMENT_RESERVED' ? 'Unallocated' : 'Reserved',next:action === 'EQUIPMENT_RESERVED' ? `${a.workerId} / ${a.assetId} / ${a.date} / ${a.shift}` : 'Cancelled',reason,isOverride:false});
}
export async function syncReceipts(client,state,allocations) {
  for (const a of allocations.filter(a => a.state !== 'CANCELLED')) {
    const h = state.handovers.find(h => h.id === a.handoverId);
    if (h?.receivedAt && (h.outgoingConfirmedAt || h.selfConfirmationReason) && a.state !== 'RECEIVED') {
      await client.query("UPDATE equipment_allocations SET state='RECEIVED',received_at=$2 WHERE id=$1",[a.id,h.receivedAt]);
      a.state = 'RECEIVED'; a.receivedAt = h.receivedAt;
    }
  }
}
export function enrichEquipment(result,state,allocations,scope = {}) {
  const current = shiftContext();
  function enrich(value) {
    if (Array.isArray(value)) return value.map(enrich);
    if (!value || typeof value !== 'object') return value;
    const out = Object.fromEntries(Object.entries(value).map(([k,v]) => [k,enrich(v)]));
    if (Array.isArray(value.occupancy) && value.code && value.departments) {
      out.equipmentDate = current.date; out.equipmentShift = current.shift;
      out.occupancy = value.occupancy.map(o => {
        const coverage = Object.fromEntries(['MORNING','NIGHT'].map(shift => {
          const workers = eligibleWorkers(state,value,o.dept,current.date,shift);
          const production = workers.filter(w => !w.training).length, training = workers.length-production;
          const assets = state.laptops.filter(l => l.poolId === o.poolId && usable(state,l,o.capacity));
          const usableSeats = new Set(assets.map(l => l.workstationId)).size;
          const assigned = allocations.filter(a => a.poolId === o.poolId && a.date === current.date && a.shift === shift && a.state !== 'CANCELLED');
          // Existing handovers remain evidence; do not invent current attendance from fixture custody.
          const handovers = state.handovers.filter(h => h.poolId === o.poolId && instant(h.scheduledAt) === Date.parse(start(current.date,shift)));
          const activeHandovers = handovers.filter(h => h.incomingId && (!h.receivedAt || state.laptops.some(l => l.assetId === h.assetId && l.currentUserId === h.incomingId)));
          const allocatedWorkers = new Set([...assigned.map(a => a.workerId),...activeHandovers.map(h => h.incomingId)]);
          const allocated = allocatedWorkers.size;
          const held=(state.shiftCustody??[]).filter(c=>c.date===current.date&&c.shift===shift&&assets.some(l=>l.assetId===c.asset_id));
          const live = shift === current.shift ? new Set([...held.map(c=>c.asset_id),...handovers.filter(h => h.receivedAt && (h.outgoingConfirmedAt || h.selfConfirmationReason) && state.laptops.some(l => l.assetId === h.assetId && l.currentUserId === h.incomingId)).map(h => h.assetId)]).size : 0;
          const target = value.staffingTargets?.[o.dept]?.[shift] ?? o.capacity;
          const pending = 0;
          const invalid = assigned.filter(a => !workers.some(w => w.id === a.workerId) || !assets.some(l => l.assetId === a.assetId && l.workstationId === a.workstationId)).length;
          const conflicts = Math.max(invalid,Math.max(0,allocated-o.capacity));
          const booked = new Set([...assigned.map(a => a.assetId),...activeHandovers.map(h => h.assetId)]);
          const free = new Set(assets.filter(l => !booked.has(l.assetId)&&!l.currentUserId).map(l => l.workstationId)).size;
          return [shift,{production,training,target,allocated,live,pending,usable:usableSeats,capacity:o.capacity,vacancies:Math.max(0,target-production),needsAllocation:0,free,conflicts}];
        }));
        return {...o,coverage,morning:coverage.MORNING.production,night:coverage.NIGHT.production,occupiedNow:coverage[current.shift].live,handoverPending:coverage[current.shift].pending,available:coverage[current.shift].free};
      });
      const statuses = Object.fromEntries(['MORNING','NIGHT'].map(shift => {
        const sum = key => out.occupancy.reduce((n,o) => n+o.coverage[shift][key],0);
        const shortage = out.occupancy.some(o => o.coverage[shift].usable < Math.max(o.coverage[shift].target,o.coverage[shift].production+o.coverage[shift].training));
        const status = value.lifecycle === 'SETUP' ? 'SETUP' : value.status !== 'ACTIVE' ? 'INACTIVE' : sum('conflicts') ? 'CONFLICT' : shortage ? 'EQUIPMENT_SHORTAGE' : sum('vacancies') ? 'STAFFING_GAP' : sum('pending') ? 'HANDOVER_PENDING' : sum('live') ? 'OPERATING' : 'READY';
        return [shift,status];
      }));
      out.shiftStatuses = statuses; out.opStatus = statuses[current.shift];
      out.currentWorkforce = out.occupancy.reduce((n,o) => n+o.coverage[current.shift].production,0);
      out.morningWorkforce = out.occupancy.reduce((n,o) => n+o.coverage.MORNING.production,0);
      out.nightWorkforce = out.occupancy.reduce((n,o) => n+o.coverage.NIGHT.production,0);
      out.pendingHandovers = out.occupancy.reduce((n,o) => n+o.coverage[current.shift].pending,0);
      out.availableWorkstations = out.occupancy.reduce((n,o) => n+o.coverage[current.shift].free,0);
    }
    if (value.poolId === undefined && value.id && value.platformCode && typeof value.capacity === 'number' && typeof value.occupied === 'number') {
      const handovers = state.handovers.filter(h => h.poolId === value.id && instant(h.scheduledAt) === Date.parse(start(current.date,current.shift)));
      const held=(state.shiftCustody??[]).filter(c=>state.laptops.some(l=>l.assetId===c.asset_id&&l.poolId===value.id));
      out.occupied = new Set([...held.map(c=>c.asset_id),...handovers.filter(h => h.receivedAt && (h.outgoingConfirmedAt || h.selfConfirmationReason) && state.laptops.some(l => l.assetId === h.assetId && l.currentUserId === h.incomingId)).map(h => h.assetId)]).size;
      const active = handovers.filter(h => h.incomingId && (!h.receivedAt || state.laptops.some(l => l.assetId === h.assetId && l.currentUserId === h.incomingId)));
      out.handoverPending = active.filter(h => !h.receivedAt || (!h.outgoingConfirmedAt && !h.selfConfirmationReason)).length;
      const booked = new Set([...active.map(h => h.workstationId),...allocations.filter(a => a.poolId === value.id && a.date === current.date && a.shift === current.shift && a.state !== 'CANCELLED').map(a => a.workstationId)]);
      out.available = new Set(state.laptops.filter(l => l.poolId === value.id && usable(state,l,value.capacity) && !booked.has(l.workstationId)&&!l.currentUserId).map(l => l.workstationId)).size;
    }
    if (value.kpis && Array.isArray(out.platforms)) {
      const active = out.platforms.filter(p => p.status === 'ACTIVE' && p.lifecycle !== 'SETUP');
      const occupancies = active.flatMap(p => p.occupancy).filter(o => !scope.dept || o.dept === scope.dept);
      out.currentShift = {code:current.shift,start:start(current.date,current.shift),end:new Date(Date.parse(start(current.date,current.shift))+12*3600000).toISOString()};
      out.kpis.currentWorkforce = occupancies.reduce((n,o) => n+o.coverage[current.shift].production,0);
      out.kpis.morningWorkforce = occupancies.reduce((n,o) => n+o.coverage.MORNING.production,0);
      out.kpis.nightWorkforce = occupancies.reduce((n,o) => n+o.coverage.NIGHT.production,0);
      out.kpis.availableCapacity = occupancies.reduce((n,o) => n+o.coverage[current.shift].free,0);
      out.kpis.pendingHandovers = occupancies.reduce((n,o) => n+o.coverage[current.shift].pending,0);
      out.kpis.fullPools = occupancies.filter(o => o.capacity > 0 && o.coverage[current.shift].allocated >= o.capacity).length;
      const codes = new Set(out.platforms.map(p => p.code));
      const handovers = state.handovers.filter(h => codes.has(h.platformCode) && (!scope.dept || h.dept === scope.dept) && instant(h.scheduledAt) === Date.parse(start(current.date,current.shift)));
      out.handoverByStatus = handovers.reduce((counts,h) => ({...counts,[h.status]:(counts[h.status] ?? 0)+1}),{});
    }
    return out;
  }
  return enrich(result);
}
