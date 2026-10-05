export type Role = 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'FREELANCER';
export type DeptCode = 'GS' | 'DP' | 'WD' | 'SAFETY';
export type ShiftCode = 'MORNING' | 'NIGHT';
export type EntityStatus = 'ACTIVE' | 'INACTIVE';

export interface SessionUser {
  id: string;
  role: Role;
  name: string;
  title: string;
  email: string;
}

export interface Department {
  code: DeptCode;
  name: string;
  description: string;
}

export interface DepartmentSummary extends Department {
  platforms: number;
  workstations: number;
  employees: number;
  freelancers: number;
  positions: string[];
}

export interface PositionSummary {
  title: string;
  dept: DeptCode;
  employees: number;
  level: 'Agent' | 'Senior';
}

export interface ShiftDefinition {
  code: ShiftCode;
  label: string;
  start: string;
  end: string;
  crossesMidnight: boolean;
}

export interface PlatformCategory {
  id: string;
  code: string;
  name: string;
  description: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CategorySummary extends PlatformCategory {
  platformCount: number;
  activePlatforms: number;
  totalWorkstations: number;
  assignedWorkforce: number;
  activeIncidents: number;
}

export type DeptCapacity = Partial<Record<DeptCode, number>>;

export interface Platform {
  id: string;
  code: string;
  categoryCode: string;
  status: EntityStatus;
  departments: DeptCapacity;
  updatedAt: string;
}

export interface DeptOccupancy {
  dept: DeptCode;
  poolId: string;
  capacity: number;
  morning: number;
  night: number;
  occupiedNow: number;
  available: number;
  handoverPending: number;
}

export type PlatformOpStatus = 'OPERATIONAL' | 'FULL' | 'WARNING' | 'INCIDENT' | 'INACTIVE';

export interface PlatformSummary extends Platform {
  totalWorkstations: number;
  requiredWorkforce: number;
  morningWorkforce: number;
  nightWorkforce: number;
  currentWorkforce: number;
  availableWorkstations: number;
  activeIncidents: number;
  pendingReplacements: number;
  pendingHandovers: number;
  offDayAlerts: number;
  occupancy: DeptOccupancy[];
  opStatus: PlatformOpStatus;
}

export type EmploymentStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED';
export type AccountStatus = 'ACTIVE' | 'LOCKED' | 'INVITED';

export interface Employee {
  uuid: string;
  id: string;
  name: string;
  email: string;
  phone: string;
  dept: DeptCode;
  platformCode: string;
  categoryCode: string;
  position: string;
  shift: ShiftCode;
  nextShift: ShiftCode;
  status: EmploymentStatus;
  accountStatus: AccountStatus;
  poolId: string;
  currentWorkstationId: string | null;
  workstationState: 'IN_USE' | 'SCHEDULED' | null;
  offDaysUsed: number;
  offDaysAllowance: number;
  joinedAt: string;
}

export type AvailabilityState = 'AVAILABLE' | 'ASSIGNED' | 'UNAVAILABLE' | 'OFF' | 'CONFLICT';

export interface AvailabilityDay {
  date: string;
  MORNING: AvailabilityState;
  NIGHT: AvailabilityState;
}

export interface Freelancer {
  uuid: string;
  id: string;
  name: string;
  email: string;
  phone: string;
  dept: DeptCode;
  priority: number;
  status: EntityStatus;
  accountStatus: AccountStatus;
  compatibleCategories: string[];
  currentAssignmentId: string | null;
  currentPlatform: string | null;
  workloadUsed: number;
  workloadLimit: number;
  todayMorning: AvailabilityState;
  todayNight: AvailabilityState;
  joinedAt: string;
}

export type OffDayStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'OVERRIDE_APPROVED' | 'CANCELLED';

export interface OffDayOverride {
  managerId: string;
  managerName: string;
  reason: string;
  at: string;
  previousApproved: number;
}

export interface OffDayRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  platformCode: string;
  dept: DeptCode;
  shift: ShiftCode;
  date: string;
  status: OffDayStatus;
  createdAt: string;
  reason?: string;
  override?: OffDayOverride;
}

export type CapacityState = 'AVAILABLE' | 'PARTIAL' | 'FULL' | 'CONFLICT';

export interface CapacityCell {
  date: string;
  approved: number;
  limit: number;
  state: CapacityState;
  employees: {id: string;name: string;status: OffDayStatus;}[];
}

export interface OffDayCalendarCell {
  date: string;
  approvedInGroup: number;
  limit: number;
  groupState: CapacityState;
  myRequest: {id: string;status: OffDayStatus;reason?: string;} | null;
  selectable: boolean;
  unavailableReason: string | null;
  isPast: boolean;
}

export interface OffDayCalendar {
  employeeId: string;
  platformCode: string;
  dept: DeptCode;
  month: string;
  allowance: number;
  used: number;
  remaining: number;
  cells: OffDayCalendarCell[];
}

export interface OffDayRequestResult {
  outcome: 'APPROVED' | 'REJECTED';
  request: OffDayRequest;
  capacity: {approved: number;limit: number;};
  message: string;
}

export type ReplacementStatus = 'PENDING' | 'SEARCHING' | 'ASSIGNED' | 'CONFIRMED' | 'CANCELLED' | 'FAILED';
export type ReplacementType = 'PLANNED' | 'EMERGENCY';

export interface EligibilityCheck {
  key: 'department' | 'platform' | 'availability' | 'conflict' | 'workload' | 'account';
  label: string;
  passed: boolean;
}

export interface Candidate {
  freelancerId: string;
  name: string;
  priority: number;
  eligible: boolean;
  selected: boolean;
  availability: AvailabilityState;
  workloadUsed: number;
  workloadLimit: number;
  checks: EligibilityCheck[];
}

export interface TimelineStep {
  key: string;
  label: string;
  state: 'done' | 'current' | 'failed' | 'upcoming';
  at?: string;
  detail?: string;
}

export interface Replacement {
  id: string;
  type: ReplacementType;
  status: ReplacementStatus;
  absentEmployeeId: string;
  absentEmployeeName: string;
  platformCode: string;
  categoryCode: string;
  dept: DeptCode;
  shift: ShiftCode;
  date: string;
  shiftStart: string;
  shiftEnd: string;
  reason: string;
  createdAt: string;
  initiatedAt: string;
  freelancerId: string | null;
  freelancerName: string | null;
  freelancerPriority: number | null;
  poolId: string;
  workstationId: string | null;
  candidates: Candidate[];
  failureReasons: string[];
  cancelReason?: string;
  timeline: TimelineStep[];
}

export type LaptopStatus = 'AVAILABLE' | 'ASSIGNED' | 'HANDOVER_PENDING' | 'MAINTENANCE' | 'INCIDENT' | 'RETIRED';
export type Condition = 'GOOD' | 'FAIR' | 'DAMAGED';
export type HandoverStatus = 'PENDING' | 'OUTGOING_CONFIRMED' | 'RECEIVED' | 'ISSUE_REPORTED' | 'COMPLETED';

export interface Laptop {
  assetId: string;
  serial: string;
  model: string;
  workstationId: string | null;
  poolId: string;
  platformCode: string;
  dept: DeptCode;
  status: LaptopStatus;
  currentUserId: string | null;
  currentUserName: string | null;
  currentShift: ShiftCode | null;
  nextUserId: string | null;
  nextUserName: string | null;
  nextUserNote: string | null;
  condition: Condition;
  handoverStatus: HandoverStatus | null;
  openIncidentId: string | null;
  purchasedAt: string;
}

export interface PoolSummary {
  id: string;
  platformCode: string;
  categoryCode: string;
  dept: DeptCode;
  capacity: number;
  occupied: number;
  available: number;
  handoverPending: number;
  maintenance: number;
  incidents: number;
  platformStatus: EntityStatus;
}

export interface ChecklistResult {
  laptopCondition: Condition;
  chargerPresent: boolean;
  mousePresent: boolean;
  physicalDamage: boolean;
  screenOk: boolean;
  keyboardOk: boolean;
  otherEquipment: string;
  notes: string;
}

export interface Handover {
  id: string;
  assetId: string;
  workstationId: string;
  poolId: string;
  platformCode: string;
  dept: DeptCode;
  outgoingId: string;
  outgoingName: string;
  incomingId: string;
  incomingName: string;
  outgoingShift: ShiftCode;
  incomingShift: ShiftCode;
  scheduledAt: string;
  status: HandoverStatus;
  outgoingConfirmedAt: string | null;
  receivedAt: string | null;
  checklist: ChecklistResult | null;
  incidentId: string | null;
}

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

export interface Incident {
  id: string;
  assetId: string;
  workstationId: string | null;
  platformCode: string;
  dept: DeptCode;
  severity: Severity;
  status: IncidentStatus;
  category: string;
  title: string;
  description: string;
  reportedById: string;
  reportedByName: string;
  createdAt: string;
  updatedAt: string;
  handoverId: string | null;
}

export type NotificationType =
'OFFDAY_APPROVED' |
'OFFDAY_REJECTED' |
'OFFDAY_OVERRIDE' |
'SHIFT_CHANGED' |
'ROTATION' |
'REPLACEMENT_ASSIGNED' |
'EMERGENCY_REPLACEMENT' |
'PLATFORM_ASSIGNMENT' |
'WORKSTATION_ASSIGNED' |
'HANDOVER_REQUIRED' |
'LAPTOP_INCIDENT' |
'ROSTER_UPDATED' |
'PLATFORM_CONFIG_CHANGED';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  emailStatus: 'SENT' | 'DELIVERED' | 'FAILED' | 'NOT_SENT';
  link: string | null;
  recipientRoles: Role[];
  recipientId: string | null;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  role: Role | 'SYSTEM';
  action: string;
  entity: string;
  entityId: string;
  platformCode: string | null;
  dept: DeptCode | null;
  previous: string;
  next: string;
  reason: string;
  isOverride: boolean;
}

export type RosterState = 'WORKING' | 'OFF' | 'ABSENT' | 'REPLACED' | 'LEAVE';

export interface RosterCell {
  date: string;
  state: RosterState;
  note?: string;
}

export interface RosterRow {
  employeeId: string;
  name: string;
  platformCode: string;
  dept: DeptCode;
  shift: ShiftCode;
  cells: RosterCell[];
}

export interface DailyRosterRow {
  employeeId: string;
  name: string;
  platformCode: string;
  dept: DeptCode;
  shift: ShiftCode;
  state: RosterState;
  shiftStart: string;
  shiftEnd: string;
  replacement: {id: string;freelancerId: string | null;freelancerName: string | null;status: ReplacementStatus;} | null;
}

export interface PlatformRosterEntry {
  id: string;
  name: string;
  state: RosterState;
  isFreelancer: boolean;
  replacing?: string;
}

export interface PlatformRoster {
  platformCode: string;
  date: string;
  depts: {
    dept: DeptCode;
    capacity: number;
    shifts: {shift: ShiftCode;shiftStart: string;shiftEnd: string;working: number;entries: PlatformRosterEntry[];}[];
  }[];
}

export interface RotationCycle {
  id: string;
  label: string;
  start: string;
  end: string;
  morning: number;
  night: number;
  executedAt: string | null;
  executedBy: string;
  status: 'COMPLETED' | 'CURRENT' | 'SCHEDULED';
}

export interface RotationInfo {
  current: RotationCycle;
  next: RotationCycle;
  history: RotationCycle[];
  platforms: {platformCode: string;categoryCode: string;morningNow: number;nightNow: number;morningNext: number;nightNext: number;}[];
  departments: {dept: DeptCode;morningNow: number;nightNow: number;morningNext: number;nightNext: number;}[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}