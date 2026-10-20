import { ApiError } from '../../shared/errors.js';

// Historical records remain stored. These workflows have no active API surface.
const retired = new Set(['placeWorker','promotePlatformTrainee','getDailyHandoverAttendance','getEquipmentAllocations','getMyHandovers','listHandovers','confirmOutgoing','confirmReceipt','submitHandover','correctHandover','getMyWorkstationHandovers','submitHandoverConfirmation','getAttendanceHandover','getHandoverCorrectionOptions','correctAttendanceHandover','getSharedDevices','receiveSharedDevice','returnSharedDevice','reserveEquipment','cancelEquipmentAllocation','assignLaptop']);
export function assertWorkflowAvailable(method,args=[]) {
  if (retired.has(method) || (method === 'getReport' && args[0] === 'handover-history')) throw new ApiError(410,'WORKFLOW_RETIRED','This workflow has been removed. Use Workforce training and platform assignments, or Equipment inventory.');
}
export function withoutPendingHandovers(result) {
  if (Array.isArray(result)) return result.filter(item => !(item?.kind === 'HANDOVER' && item.status !== 'COMPLETED')).map(withoutPendingHandovers);
  if (!result || typeof result !== 'object') return result;
  const out=Object.fromEntries(Object.entries(result).map(([key,value])=>[key,withoutPendingHandovers(value)]));
  for (const key of ['pendingHandovers','handoverPending']) if (key in out && typeof out[key] === 'number') out[key]=0;
  if ('production' in out && 'capacity' in out && 'pending' in out) out.pending=0;
  if ('handovers' in out) out.handovers=[];
  if ('handoverByStatus' in out) out.handoverByStatus={};
  if (Array.isArray(out.items)) out.items=out.items.filter(item => item.type !== 'HANDOVER_REQUIRED');
  if (out.status === 'HANDOVER_PENDING') out.status=out.currentUserId ? 'ASSIGNED' : 'AVAILABLE';
  if (out.opStatus === 'HANDOVER_PENDING') out.opStatus='READY';
  return out;
}
