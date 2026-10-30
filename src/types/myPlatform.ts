import type { DeptCode, ShiftCode } from './domain';
export interface MyPlatformOverview {
  serverNow:string; today:string; live:{date:string;shift:ShiftCode};
  person:{name:string;dept:DeptCode};
  assignment:null|{platformCode:string;dept:DeptCode;shift:ShiftCode|null;kind:string;training:null|{completed:number;required:number;start:string;end:string}};
  platform:null|{code:string;name:string;description:string;category:string;status:string;lifecycle:string};
  team:{id:string;name:string;dept:DeptCode;shift:ShiftCode|null;kind:string;self:boolean;status:string}[];
  breaks:{id:string;workerId:string;name:string;dept:DeptCode;startedAt:string;endedAt:string|null;active:boolean;seconds:number}[];
  offDays:{id:string;name:string;dept:DeptCode;date:string;shift:ShiftCode}[];
  departments:{dept:DeptCode;capacity:number;target:number;scheduled:number;confirmed:number;trainees:number;devices:number;held:number;unavailable:number}[];
}
