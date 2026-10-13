import type { DeptCode, Role, ShiftCode } from './domain';

export interface DeviceSubmission { deviceTimestamp: string; timezoneOffsetMinutes: number }
export interface HandoverSubmission extends DeviceSubmission {
  direction: 'INCOMING' | 'OUTGOING';
  notes: string;
  equipmentIssue: string;
  selfConfirmationReason?: string;
}
export interface HandoverConfirmation {
  actorId: string;
  actorName: string;
  role: Role;
  deviceTimestamp: string;
  timezoneOffsetMinutes: number;
  recordedAt: string;
}
export interface HandoverCorrection {
  actorId: string;
  actorName: string;
  at: string;
  reason: string;
  previous: Record<string, string | null>;
  next: Record<string, string | null>;
}
export interface HandoverCorrectionInput {
  assetId: string;
  outgoingId: string;
  incomingId: string;
  outgoingConfirmedAt: string | null;
  receivedAt: string | null;
  reason: string;
  expectedRevision: number;
}
export type AttendanceStatus = 'PENDING_COUNTERPART' | 'AWAITING_RECEIPT' | 'ON_TIME' | 'LATE';
export interface AttendanceRow {
  id: string;
  workerId: string;
  workerName: string;
  workerType: 'EMPLOYEE' | 'FREELANCER';
  shift: ShiftCode;
  shiftDate: string;
  eventDate: string;
  platformCode: string;
  dept: DeptCode;
  assetId: string;
  receivedFrom: string;
  handedTo: string;
  receivedAt: string | null;
  outgoingAt: string | null;
  status: AttendanceStatus;
  exceptionReason: string;
  notes: string;
  equipmentIssue: string;
  corrected: boolean;
  handoverIds: string[];
}
