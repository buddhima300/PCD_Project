import type { DeptCode, ShiftCode } from './domain';

export type AttendanceStatus = 'CONFIRMED' | 'NEEDS_REVIEW' | 'VOIDED' | 'NOT_SUBMITTED' | 'NOT_SCHEDULED';
export interface WorkOccurrence {
  id: string; workerId: string; staffNumber: string; workerName: string; workerType: 'EMPLOYEE'|'FREELANCER';
  platformCode: string; department: DeptCode; rosterDate: string; shift: ShiftCode;
  scheduledStart: string; scheduledEnd: string; effectiveStart: string; effectiveEnd: string;
  revision: number; canSubmit: boolean; reason: string | null;
  confirmation: AttendanceRecord | null;
}
export interface AttendanceRecord {
  id: string; occurrenceId: string; workerId: string; staffNumber: string; workerName: string;
  workerType: 'EMPLOYEE'|'FREELANCER'; platformCode: string; department: DeptCode; rosterDate: string; shift: ShiftCode;
  effectiveStart: string; effectiveEnd: string; acceptedAt: string; deviceTimestamp: string | null;
  status: AttendanceStatus; punctuality: 'ON_TIME'|'LATE'; verification: string;
  assetId: string | null; notes: string; equipmentIssue: string; exceptionReason: string; revision: number;
  custody: {id:string;receivedAt:string;releasedAt:string|null;revision:number;releaseNotes:string} | null;
  events?: {id:string;kind:string;recordedAt:string;notes:string}[];
  corrections?: {id:string;recordedAt:string;actorName:string;reason:string;before:unknown;after:unknown}[];
}
export interface AttendanceContext {
  serverNow: string; today: string; workerName: string; occurrences: WorkOccurrence[];
  openCustody: AttendanceRecord | null; reason: string | null;
}
export interface AttendanceDevice {
  assetId:string; serial:string; model:string; condition:string;
  workstationId?:string;
  lastReceivedAt:string|null; lastReturnedAt:string|null;
}
export interface AttendanceSubmission {
  occurrenceId:string; expectedRevision:number; department:DeptCode; assetId?:string;
  attendanceOnly:boolean; notes:string; equipmentIssue:string; exceptionReason:string;
  declaration:true; deviceTimestamp?:string; timezoneOffsetMinutes?:number; idempotencyKey:string;
}
export interface AttendanceFilters {
  from:string; to:string; platform?:string; department?:string; shift?:string;
  workerType?:string; status?:string; search?:string; workerId?:string; page?:number; pageSize?:number;
}
export interface AttendanceSummary {
  status:AttendanceStatus; confirmations:AttendanceRecord[];
}
