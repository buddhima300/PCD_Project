export interface EmployeeReleaseInfo {
  devices:{assetId:string;workstationId:string|null;poolId:string;canVerifyReturn:boolean;reviewBlocker:string|null}[];
  handovers:{id:string;assetId:string;poolId:string;scheduledAt:string;incomingName:string;outgoingName:string;needsReceipt:boolean;needsOutgoing:boolean}[];
  instructions:string;
}
