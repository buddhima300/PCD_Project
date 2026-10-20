import type { Employee } from './domain';

export type CareerLevel = 'STAFF' | 'PIC' | 'TL' | 'SPV';
export const careerLabels: Record<CareerLevel,string> = {
  STAFF:'Staff', PIC:'Platform in charge (PIC)', TL:'Team leader (TL)', SPV:'Supervisor (SPV)'
};
export interface CareerEvent {
  id:string;
  from:CareerLevel;
  to:CareerLevel;
  at:string;
  actorId:string;
  actorName:string;
  reason:string;
  platformCode:string;
  dept:string;
  supervisorAccessGranted:boolean;
}
export interface CareerOptions {
  currentLevel:CareerLevel;
  nextLevel:CareerLevel|null;
  revision:number;
  hasLinkedAccount:boolean;
  hasSupervisorAccess:boolean;
  canGrantSupervisorAccess:boolean;
  supervisorAccessBlocker:string|null;
  blockedReason:string|null;
}
export interface PromotionInput {
  expectedLevel:CareerLevel;
  expectedRevision:number;
  nextLevel:CareerLevel;
  reason:string;
  grantSupervisorAccess:boolean;
}
export interface PromotionResult { employee:Employee; supervisorAccessGranted:boolean; }
