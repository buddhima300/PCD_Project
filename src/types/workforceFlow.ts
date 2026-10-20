import type { DeptCode,ShiftCode } from './domain';
export interface ShiftVacancy {capacity:number;production:number;training:number;used:number;available:number;}
export interface WorkforceVacancy {code:string;name:string;categoryCode:string;departments:{dept:DeptCode;capacity:number;shifts:Record<ShiftCode,ShiftVacancy>}[];}
export interface TrainingStaffContext {
  missing:boolean;workerId:string|null;options:{id:string;name:string;reference:string}[];
  registration?:{name:string;email:string;phone:string;dept:import('./domain').DeptCode;employmentType:'PERMANENT'|'FREELANCER';position:string};
}
