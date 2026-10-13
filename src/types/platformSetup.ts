import type { DeptCapacity, DeptCode, Platform, ShiftCode } from './domain';

export interface CategoryCreateInput {
  code: string;
  name: string;
  description: string;
}

export interface PlatformCreateInput {
  categoryCode: string;
  code: string;
  name: string;
  description: string;
  category?: CategoryCreateInput;
}

export interface PlatformCapacityInput {
  departments: DeptCapacity;
  staffingTargets: NonNullable<Platform['staffingTargets']>;
}

export interface PlatformAssignmentInput {
  workerId: string;
  kind: 'PRODUCTION' | 'TRAINING';
  dept: DeptCode;
  shift: ShiftCode;
  trainingDays?: number;
}
