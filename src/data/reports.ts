export type ReportKey =
'workforce-summary' |
'platform-workforce' |
'platform-capacity' |
'department-workforce' |
'shift-distribution' |
'monthly-roster' |
'platform-roster' |
'offday-utilization' |
'offday-conflicts' |
'freelancer-availability' |
'replacement-history' |
'replacement-stats' |
'pool-utilization' |
'laptop-inventory' |
'laptop-assignment-history' |
'handover-history' |
'laptop-incidents' |
'platform-incidents' |
'audit-activity';

export interface ReportDefinition {
  key: ReportKey;
  title: string;
  group: 'Workforce' | 'Scheduling' | 'Replacements' | 'Workstations' | 'Governance';
  description: string;
}

export const reportDefinitions: ReportDefinition[] = [
{ key: 'workforce-summary', title: 'Workforce summary', group: 'Workforce', description: 'Permanent and freelance headcount by category and status.' },
{ key: 'platform-workforce', title: 'Platform workforce', group: 'Workforce', description: 'Assigned vs required workforce per platform and shift.' },
{ key: 'department-workforce', title: 'Department workforce', group: 'Workforce', description: 'Headcount and freelancer bench per department.' },
{ key: 'shift-distribution', title: 'Shift distribution', group: 'Workforce', description: 'Morning vs night headcount per category.' },
{ key: 'platform-capacity', title: 'Platform capacity', group: 'Workstations', description: 'Workstation capacity and live occupancy per platform department.' },
{ key: 'monthly-roster', title: 'Monthly roster', group: 'Scheduling', description: 'Working, off, absent and replaced shift-days per platform.' },
{ key: 'platform-roster', title: 'Platform roster', group: 'Scheduling', description: 'Staffing per platform, department and shift for today.' },
{ key: 'offday-utilization', title: 'Off-day utilisation', group: 'Scheduling', description: 'Off-days used against the monthly allowance.' },
{ key: 'offday-conflicts', title: 'Off-day conflicts', group: 'Scheduling', description: 'Full and override-exceeded capacity groups.' },
{ key: 'freelancer-availability', title: 'Freelancer availability', group: 'Replacements', description: 'Available shifts per freelancer over the next 14 days.' },
{ key: 'replacement-history', title: 'Freelancer replacement history', group: 'Replacements', description: 'Every replacement with absent employee and assigned freelancer.' },
{ key: 'replacement-stats', title: 'Replacement statistics', group: 'Replacements', description: 'Replacement outcomes by type and department.' },
{ key: 'pool-utilization', title: 'Workstation pool utilisation', group: 'Workstations', description: 'Occupied, available and blocked workstations per pool.' },
{ key: 'laptop-inventory', title: 'Laptop inventory', group: 'Workstations', description: 'Every laptop with pool, status and condition.' },
{ key: 'laptop-assignment-history', title: 'Laptop assignment history', group: 'Workstations', description: 'Completed laptop receipts by employee and shift.' },
{ key: 'handover-history', title: 'Laptop handover history', group: 'Workstations', description: 'All handovers with outgoing and incoming employees.' },
{ key: 'laptop-incidents', title: 'Laptop incidents', group: 'Workstations', description: 'Incident log by severity, category and status.' },
{ key: 'platform-incidents', title: 'Platform incidents', group: 'Governance', description: 'Open and resolved incidents per platform.' },
{ key: 'audit-activity', title: 'Audit activity', group: 'Governance', description: 'Audit events by action type, including overrides.' }];