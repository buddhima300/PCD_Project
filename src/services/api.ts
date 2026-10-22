// Preserve the original screen contracts while executing every workflow on the backend.
import { ApiError } from './errors';
import { login as serverLogin, request } from './http';
import type { EquipmentContext, EquipmentAllocation, EquipmentOptions } from '../types/equipment';
import type { LeaveInput, LeaveRequest, RosterBalance, RosterScope, RosterWorkspace } from '../types/roster';
import type { AttendanceContext, AttendanceDevice, AttendanceSubmission, AttendanceRecord, AttendanceFilters } from '../types/shiftAttendance';

import type { platformApi } from './mock/platformHandlers';
import type { platformSetupApi } from './mock/platformSetupHandlers';
import type { replacementApi } from './mock/replacementHandlers';
import type { reportApi } from './mock/reportHandlers';
import type { resourceApi } from './mock/resourceHandlers';
import type { schedulingApi } from './mock/schedulingHandlers';
import type { systemApi } from './mock/systemHandlers';
import type { workforceApi } from './mock/workforceHandlers';
import type { placementApi } from './mock/placementHandlers';
import type { disciplinaryApi } from './mock/disciplinaryHandlers';
import type { attendanceApi } from './mock/attendanceHandlers';
import type { profileApi } from './mock/profileHandlers';

// Type-only legacy contracts keep existing pages compiling without loading mock handlers.
export type Api = typeof platformApi & typeof platformSetupApi & typeof workforceApi & typeof schedulingApi & typeof replacementApi & typeof resourceApi & typeof systemApi & typeof reportApi & typeof placementApi & typeof disciplinaryApi & typeof attendanceApi & typeof profileApi & {
  listLaptopModels():Promise<string[]>;
  addLaptopModel(name:string):Promise<string>;
  updateLaptopModel(assetId:string,input:{model:string;expectedModel:string}):Promise<import('../types/domain').Laptop>;
  getMyAttendanceContext():Promise<AttendanceContext>;
  getMyAttendanceDevices(occurrenceId:string):Promise<AttendanceDevice[]>;
  confirmMyShiftAttendance(input:AttendanceSubmission):Promise<AttendanceRecord>;
  returnMyShiftDevice(input:{confirmationId:string;expectedRevision:number;notes:string;idempotencyKey:string;physicallyReturned:true}):Promise<AttendanceRecord>;
  listShiftAttendance(input:AttendanceFilters):Promise<{items:AttendanceRecord[];total:number;page:number;pageSize:number;serverNow:string}>;
  getShiftAttendanceDetail(id:string):Promise<AttendanceRecord>;
  reviewShiftAttendance(id:string,input:{expectedRevision:number;status:'CONFIRMED'|'VOIDED';reason:string}):Promise<AttendanceRecord>;
  getRosterWorkspace(scope:RosterScope):Promise<RosterWorkspace>;
  completeOffDayPlan(month:string):Promise<RosterBalance>;
  submitLeaveRequest(input:LeaveInput):Promise<LeaveRequest>;
  amendLeaveRequest(id:string,input:LeaveInput,expectedVersion:number):Promise<LeaveRequest>;
  decideLeaveRequest(id:string,input:{decision:'APPROVED'|'REJECTED';reason:string;expectedVersion:number}):Promise<LeaveRequest>;
  cancelLeaveRequest(id:string,version:number):Promise<LeaveRequest>;
  setLeaveEntitlement(input:{employeeId:string;year:number;annual:number;medical:number;reason:string;expectedVersion:number}):Promise<{version:number}>;
  createRosterReplacement(id:string,date:string):Promise<import('../types/domain').Replacement>;
  getWorkforceVacancies():Promise<import('../types/workforceFlow').WorkforceVacancy[]>;
  assignQualifiedWorker(id:string,input:{platformCode:string;shift:import('../types/domain').ShiftCode}):Promise<import('../types/domain').PlatformTrainingAssignment>;
  getTrainingStaffContext(id:string):Promise<import('../types/workforceFlow').TrainingStaffContext>;
  linkTrainingStaff(id:string,input:{workerId:string;samePerson:true;reason:string;expectedWorkerId:string}):Promise<import('../types/workforceFlow').TrainingStaffContext>;
  getEmployeePlatformOptions(id:string,shift:import('../types/domain').ShiftCode):Promise<{code:string;name:string;capacity:number;used:number;available:number;usableDevices:number}[]>;
  setEmployeePlatform(id:string,input:{platformCode:string;shift:import('../types/domain').ShiftCode;expectedPlatform:string;reason:string}):Promise<import('../types/domain').Employee>;
  unassignEmployeePlatform(id:string,input:{expectedPlatform:string;reason:string}):Promise<import('../types/domain').Employee>;
  setEmployeeLoginAccess(id:string,input:{enabled:boolean;expectedRevision:number}):Promise<import('../types/domain').Employee>;
  getEmployeeReleaseInfo(id:string):Promise<import('../types/employeeRelease').EmployeeReleaseInfo>;
  verifyEmployeeDeviceReturn(id:string,input:{assetId:string;physicallyReturned:true;reason:string}):Promise<{assetId:string;returnedAt:string}>;
  getEmployeeCareerOptions(id:string):Promise<import('../types/career').CareerOptions>;
  promoteEmployee(id:string,input:import('../types/career').PromotionInput):Promise<import('../types/career').PromotionResult>;
  getSharedDevices():Promise<{poolId:string;date:string;shift:import('../types/domain').ShiftCode;assets:{assetId:string;model:string;currentUserName:string|null}[]}>;
  receiveSharedDevice(assetId:string):Promise<import('../types/domain').Handover>;
  returnSharedDevice():Promise<import('../types/domain').Handover>;
  registerPlatformDevice(input:{poolId:string;workstationId?:string;assetId:string;serial:string;model:string}):Promise<import('../types/domain').Laptop>;
  getEquipmentAllocations(input:EquipmentContext):Promise<EquipmentOptions>;
  reserveEquipment(input:EquipmentContext & {assetId:string;workerId:string}):Promise<EquipmentAllocation>;
  cancelEquipmentAllocation(id:string,reason:string):Promise<EquipmentAllocation>;
};
const implemented: Partial<Api> = {
  login: async (email, password) => (await serverLogin(email, password)).user,
};
export const api: Api = new Proxy(implemented as Api, {
  get(target, key: string) {
    if (Object.prototype.hasOwnProperty.call(target, key)) return target[key as keyof Api];
    return (...args: unknown[]) => request(`/operations/workflows/${encodeURIComponent(key)}`, { method: 'POST', body: { args } });
  },
});
export { ApiError };

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'The operations API returned an unexpected response.';
}

export type { PlatformQuery } from './mock/platformHandlers';
export type { EmployeeQuery, FreelancerQuery, EmployeeDetail, FreelancerDetail } from './mock/workforceHandlers';
export type { RosterQuery } from './mock/schedulingHandlers';
export type { ReplacementQuery, ReplacementDetail } from './mock/replacementHandlers';
export type { PoolQuery, LaptopQuery, LaptopHistoryEntry } from './mock/resourceHandlers';
export type { DashboardFilters, OpsDashboard, MyWork } from './mock/systemHandlers';
export type { ReportFilters, ReportResult } from './mock/reportHandlers';
