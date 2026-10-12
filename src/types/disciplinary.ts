import type { DeptCode, ShiftCode } from './domain';

export type CaseStatus = 'DRAFT' | 'PENDING_SENIOR_APPROVAL' | 'CHANGES_REQUESTED' | 'REJECTED' | 'APPROVED_AWAITING_RESPONSE' | 'RESPONSE_SUBMITTED' | 'UNDER_REVIEW' | 'INQUIRY_OPEN' | 'OUTCOME_RECORDED' | 'WARNING_PENDING_APPROVAL' | 'WARNING_ISSUED' | 'APPEALED' | 'CLOSED' | 'CANCELLED';
export type IrStatus = 'NOT_REQUESTED' | 'REQUESTED' | 'DRAFT' | 'SUBMITTED' | 'RESPONSE_OVERDUE' | 'UNDER_REVIEW' | 'AMENDMENT_REQUESTED' | 'AMENDED' | 'LOCKED_AFTER_REVIEW';
export type Finding = 'SUBSTANTIATED' | 'NOT_SUBSTANTIATED' | 'INCONCLUSIVE' | 'INSUFFICIENT_EVIDENCE' | 'COACHING_OR_CORRECTIVE_ACTION' | 'REFERRED_FOR_FORMAL_INQUIRY';
export type WarningStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'ISSUED' | 'ACKNOWLEDGED' | 'APPEALED' | 'WITHDRAWN' | 'SUPERSEDED';
export type WorkerType = 'EMPLOYEE' | 'FREELANCER';

export interface IncidentCase {
  id: string; number: string; workerId: string; workerType: WorkerType; workerName: string; workerNumber: string; joinedAt: string;
  department: DeptCode; platform: string; position: string; shift: ShiftCode; incidentAt: string; timezone: string;
  category: string; severity: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'; title: string; description: string; policyReference: string;
  impact: string; correctiveAction: string; evidence: string; reportedBy: string; reportedById: string; approverId: string;
  status: CaseStatus; irStatus: IrStatus; responseDueAt: string | null; createdAt: string; approvedAt: string | null;
  response: IrStatement | null; responseVersions: IrStatement[]; finding: FindingRecord | null; approvals: Approval[]; appeal: Appeal | null;
}
export interface IrStatement { version: number; issue: string; account: string; solution: string; prevention: string; factors: string; additional: string; training: string; submittedAt: string; submittedBy: string; }
export interface Approval { action: string; actor: string; actorId: string; comment: string; at: string; }
export interface FindingRecord { finding: Finding; summary: string; policyBasis: string; comment: string; reviewer: string; reviewerId: string; submittedAt: string; approvedBy?: string; approvedAt?: string; reversedAt?: string; reversedBy?: string; }
export interface WarningLetter { id: string; number: string; caseId: string; workerId: string; workerName: string; workerNumber: string; level: 'FIRST' | 'SECOND'; status: WarningStatus; summary: string; policyBasis: string; reasoning: string; improvement: string; training: string; signatory: string; preparedBy: string; approvedBy?: string; issuedAt?: string; acknowledgedAt?: string; createdAt: string; }
export interface Appeal { reason: string; submittedAt: string; status: 'SUBMITTED' | 'UNDER_REVIEW' | 'UPHELD' | 'AMENDED' | 'REVERSED' | 'CLOSED'; outcome?: string; decidedBy?: string; decidedAt?: string; }
export interface PolicyConfig { name: string; appliesTo: WorkerType[]; categories: string[]; severities: string[]; firstWarningThreshold: number; secondWarningThreshold: number; inquiryThreshold: number; validityDays: number; lookbackDays: number; breaksSequence: boolean; responseDays: number; archiveAfterDays: number; version: number; }
export interface Recommendation { qualifyingIncidents: number; activeWarning: 'NONE' | 'FIRST' | 'SECOND'; action: 'NO_ACTION' | 'FIRST_WARNING' | 'SECOND_WARNING' | 'FORMAL_INQUIRY'; rationale: string; triggerCaseId: string | null; }
export interface CaseDraft { workerId: string; workerType: WorkerType; incidentAt: string; category: string; severity: IncidentCase['severity']; title: string; description: string; policyReference: string; impact: string; correctiveAction: string; evidence: string; approverId: string; }
