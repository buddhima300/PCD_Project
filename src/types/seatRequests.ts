import type {DeptCode,ShiftCode} from './domain';
export type SeatRequestStatus='PENDING'|'WITHDRAWN'|'REJECTED'|'ALLOCATED'|'NOT_SELECTED'|'CLOSED';
export interface SeatRequest {
 id:string;replacementId:string;freelancerId:string;name:string;note:string;status:SeatRequestStatus;version:number;createdAt:string;
 platformCode:string;dept:DeptCode;date:string;shift:ShiftCode;shiftStart:string;shiftEnd:string;eligible:boolean;reasons:string[];
}
export interface SeatVacancy {
 id:string;platformCode:string;dept:DeptCode;date:string;shift:ShiftCode;shiftStart:string;shiftEnd:string;eligible:boolean;reasons:string[];
 request:null|{id:string;status:SeatRequestStatus;version:number};
}
export interface SeatVacancyOverview {vacancies:SeatVacancy[];requests:SeatRequest[];serverNow:string;}
