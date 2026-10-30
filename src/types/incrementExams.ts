export interface IncrementProgress {
  policy:string;threshold:number;joinedAt:string|null;asOf:string;creditedDays:number;remainingDays:number;percent:number;
  eligible:boolean;eligibleSince:string|null;active:boolean;verificationRequired:boolean;eligibilityVersion:string;
  breakdown:{opening:number;working:number;offDays:number;halfDays:number;excluded:number;unverified:number};
  baseline:{throughDate:string;creditedDays:number;reason:string;revision:number;valid:boolean}|null;
}
export interface IncrementAppointment {
  id:string;startsAt:string;location:string;instructions:string;status:'SCHEDULED'|'CANCELLED';revision:number;updatedAt:string;appointedBy:string;
}
export interface IncrementEmployee {
  employeeId:string;staffNumber:string;name:string;department:string;platformCode:string|null;progress:IncrementProgress;
  appointment:IncrementAppointment|null;appointmentNeedsReview:boolean;
  history?:{id:string;kind:string;recordedAt:string;reason:string;actorName:string}[];
}
export interface IncrementScope {search?:string;status?:'ELIGIBLE'|'SCHEDULED'|'VERIFY'|'ALL';page?:number;pageSize?:number}
export interface IncrementExamInput {
  startsAt:string;location:string;instructions:string;expectedRevision:number;expectedEligibilityVersion:string;idempotencyKey:string;
}
