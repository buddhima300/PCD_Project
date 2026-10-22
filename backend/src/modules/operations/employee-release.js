import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../../shared/errors.js';
import { audit } from '../audit/audit.model.js';
import { recordCustodyReturn } from './attendance-store.js';

export const employeeReleaseMethods=new Set(['getEmployeeReleaseInfo','verifyEmployeeDeviceReturn']);
export async function employeeReleaseOperation(client,auth,state,method,args) {
  if (auth.user.role !== 'SUPERVISOR') throw new ApiError(403,'FORBIDDEN','Only supervisors can review employee device custody.');
  const [id,input]=method === 'getEmployeeReleaseInfo'
    ? z.tuple([z.string().min(1).max(100)]).parse(args)
    : z.tuple([z.string().min(1).max(100),z.object({assetId:z.string().min(1).max(100),physicallyReturned:z.literal(true),reason:z.string().trim().min(5).max(1000)}).strict()]).parse(args);
  const employee=state.employees.find(e => e.id === id);
  if (!employee) throw new ApiError(404,'NOT_FOUND','Employee not found.');
  if (method === 'getEmployeeReleaseInfo') return {
    devices:state.laptops.filter(l => l.currentUserId === id).map(l => {
      return {assetId:l.assetId,workstationId:l.workstationId,poolId:l.poolId,canVerifyReturn:auth.permissions.includes('attendance.correct'),reviewBlocker:!auth.permissions.includes('attendance.correct') ? 'A supervisor with attendance-correction permission can verify a physical device return.' : null};
    }),
    handovers:[],
    instructions:'If this employee still holds a device, verify its physical return below before unassigning. No counterpart confirmation is required.'
  };
  if (!auth.permissions.includes('attendance.correct')) throw new ApiError(403,'FORBIDDEN','Attendance-correction permission is required to verify a device return.');
  const laptop=state.laptops.find(l => l.assetId === input.assetId && l.currentUserId === id);
  if (!laptop) throw new ApiError(409,'CUSTODY_CHANGED','Device custody changed. Refresh before recording a return.');
  const previous={holder:laptop.currentUserId,workstationId:laptop.workstationId,status:laptop.status};
  if((await client.query("SELECT to_regclass('equipment_custody_sessions') AS name")).rows[0].name){
    const custody=(await client.query(`SELECT s.id,s.revision FROM equipment_custody_sessions s JOIN workers w ON w.id=s.worker_id
      WHERE s.asset_id=$1 AND w.worker_number=$2 AND s.released_at IS NULL`,[laptop.assetId,id])).rows[0];
    if(custody)await recordCustodyReturn(client,{custodyId:custody.id,expectedRevision:custody.revision,actorId:auth.user.id,at:new Date().toISOString(),notes:input.reason});
  }
  Object.assign(laptop,{currentUserId:null,currentUserName:null,currentShift:null});
  if (laptop.nextUserId === id) Object.assign(laptop,{nextUserId:null,nextUserName:null});
  if (!['MAINTENANCE','RETIRED'].includes(laptop.status)) laptop.status=laptop.condition === 'DAMAGED' || state.incidents.some(i => i.assetId === laptop.assetId && i.status !== 'RESOLVED') ? 'INCIDENT' : 'AVAILABLE';
  if (employee.currentWorkstationId === laptop.workstationId) Object.assign(employee,{currentWorkstationId:null,workstationState:null});
  const at=new Date().toISOString();
  state.audit.unshift({id:`AUD-${randomUUID()}`,at,actorId:auth.user.id,actorName:auth.user.name,role:'SUPERVISOR',action:'DEVICE_RETURN_VERIFIED',entity:'Employee',entityId:id,platformCode:laptop.platformCode,dept:laptop.dept,previous:JSON.stringify(previous),next:`${laptop.assetId} returned to pool`,reason:input.reason,isOverride:true});
  await audit(client,auth.user.id,'DEVICE_RETURN_VERIFIED','worker',id,{assetId:laptop.assetId,previous,reason:input.reason,physicallyReturned:true});
  return {assetId:laptop.assetId,returnedAt:at};
}
