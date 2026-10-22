import type { ShiftCode } from './domain';
export interface DashboardWorkforce {
  today:string;from:string;to:string;
  attendance:Record<ShiftCode,{assigned:number;confirmed:number|null}>;
  absences:{employeeId:string;name:string;platformCode:string;dept:string;frequency:number;dates:string[]}[];
  absenceTrend:{date:string;count:number}[];
  absenceHistogram:{label:string;count:number}[];
  offDays:{employeeId:string;name:string;platformCode:string;dept:string;shift:ShiftCode}[];
  nextWeek:{from:string;to:string;platforms:{platformCode:string;slots:number;hours:number;dates:string[];departments:string[]}[];trend:{date:string;count:number}[]};
}
