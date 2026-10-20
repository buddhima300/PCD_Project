import type { DeptCode, RosterState, ShiftCode } from './domain';

export type LeaveKind = 'OFF_DAY' | 'CASUAL_LEAVE' | 'HALF_DAY' | 'EIGHT_HOUR' | 'INFORMED_ABSENCE' | 'ANNUAL_LEAVE' | 'MEDICAL_LEAVE';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'SUPERSEDED';
export interface LeaveRequest {
  id: string; employeeId: string; employeeName: string; platformCode: string; dept: DeptCode; shift: ShiftCode;
  kind: LeaveKind; dates: string[]; status: LeaveStatus; reason: string; createdAt: string;
  version: number; decisionReason?: string; decidedAt?: string; decidedBy?: string;
  portion?: 'FIRST' | 'SECOND'; urgent?: boolean;
  amendmentOf?: string; supersededBy?: string;
  intervals?: { date: string; shift: ShiftCode; start: string; end: string; absentStart: string; absentEnd: string }[];
  history?: { at: string; actor: string; action: string; reason: string }[];
}
export interface RosterDay {
  scheduled?: boolean;
  date: string; state: RosterState; kind?: LeaveKind; requestId?: string; pending: LeaveKind[];
  shift: ShiftCode; shiftStart: string; shiftEnd: string; workingHours: number; uncoveredHours: number;
  absenceStart?: string; absenceEnd?: string; replacement?: { id: string; name: string | null; status: string };
}
export interface RosterPerson {
  employeeId: string; name: string; platformCode: string; dept: DeptCode; shift: ShiftCode; cells: RosterDay[];
}
export interface RosterBalance {
  offAllowance: number; offUsed: number; offRemaining: number; planComplete: boolean;
  halfDayUsed: number; eightHourUsed: number; halfUnitsAvailable: number; halfUnitsReserved: number;
  annual: { allowance: number | null; used: number; reserved: number };
  medical: { allowance: number | null; used: number; reserved: number };
}
export interface RosterWorkspace {
  month: string; today: string; serverNow: string; days: string[]; rows: RosterPerson[]; requests: LeaveRequest[];
  totals: { working: number; off: number; leave: number; pending: number; uncoveredHours: number };
  balance: RosterBalance | null;
  capacity: { date: string; used: number; limit: number }[];
  employees: { id: string; name: string }[];
  entitlements: { employeeId: string; year: number; annual: number | null; medical: number | null; version: number }[];
}
export interface RosterScope { month: string; platform?: string; dept?: string; category?: string; shift?: string; search?: string }
export interface LeaveInput { kind: Exclude<LeaveKind, 'OFF_DAY'>; startDate: string; endDate: string; reason: string; portion?: 'FIRST' | 'SECOND'; urgent?: boolean; idempotencyKey: string }
export const leaveLabels: Record<LeaveKind, string> = {
  OFF_DAY: 'Off-day', CASUAL_LEAVE: 'Casual leave', HALF_DAY: 'Half-day', EIGHT_HOUR: '8-hour shift',
  INFORMED_ABSENCE: 'Informed absence', ANNUAL_LEAVE: 'Annual leave', MEDICAL_LEAVE: 'Medical leave',
};
