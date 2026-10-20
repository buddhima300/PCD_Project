import type { ShiftCode } from './domain';
export interface EquipmentContext { poolId:string; date:string; shift:ShiftCode }
export interface EquipmentAllocation extends EquipmentContext {
  id:string;workerId:string;workerName:string;platformCode:string;dept:string;assetId:string;workstationId:string;
  state:'RESERVED'|'RECEIVED'|'CANCELLED';handoverId:string;cancellationReason?:string;
}
export interface EquipmentOptions {
  date:string;shift:ShiftCode;capacity:number;
  people:{id:string;name:string;training:boolean}[];
  assets:{assetId:string;workstationId:string;model:string;booked:boolean}[];
  allocations:EquipmentAllocation[];
}
export interface ShiftCoverage {
  production:number;training:number;target:number;allocated:number;live:number;pending:number;usable:number;capacity:number;
  vacancies:number;needsAllocation:number;free:number;conflicts:number;
}
