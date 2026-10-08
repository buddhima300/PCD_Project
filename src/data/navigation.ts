import {
  ActivityIcon, ArrowLeftRightIcon, BarChart3Icon, BellIcon, BriefcaseIcon, Building2Icon, CalendarCheckIcon, CalendarDaysIcon,
  CalendarOffIcon, ClipboardListIcon, Clock3Icon, GaugeIcon, GraduationCapIcon, LaptopIcon, LayersIcon, LayoutDashboardIcon, MonitorSmartphoneIcon,
  RefreshCwIcon, RepeatIcon, ScrollTextIcon, ServerIcon, SettingsIcon, ShieldAlertIcon, SlidersHorizontalIcon, SparklesIcon, UserCheckIcon,
  UserCircleIcon, UserPlusIcon, UserRoundCogIcon, UsersIcon, TriangleAlertIcon, type LucideIcon } from
'lucide-react';
import type { Role } from '../types/domain';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  group?: string;
}

export const navByRole: Record<Role, NavItem[]> = {
  SUPERVISOR: [
  { label: 'Dashboard', to: '/', icon: LayoutDashboardIcon, group: 'Overview' },
  { label: 'Platform Operations', to: '/operations', icon: ActivityIcon, group: 'Overview' },
  { label: 'Candidates', to: '/candidates', icon: UserCheckIcon, group: 'Recruitment' },
  { label: 'Register Staff', to: '/register', icon: UserPlusIcon, group: 'Recruitment' },
  { label: 'Workforce', to: '/workforce', icon: UsersIcon, group: 'Workforce' },
  { label: 'Platform Demand', to: '/platform-demand', icon: GaugeIcon, group: 'Workforce' },
  { label: 'Placement Queue', to: '/placement-queue', icon: SparklesIcon, group: 'Workforce' },
  { label: 'Employees', to: '/employees', icon: BriefcaseIcon, group: 'Workforce' },
  { label: 'Freelancers', to: '/freelancers', icon: UserRoundCogIcon, group: 'Workforce' },
  { label: 'On-Platform Training', to: '/training', icon: GraduationCapIcon, group: 'Training' },
  { label: 'Platform Categories', to: '/categories', icon: LayersIcon, group: 'Platforms' },
  { label: 'Platforms', to: '/platforms', icon: ServerIcon, group: 'Platforms' },
  { label: 'Platform Configuration', to: '/platform-config', icon: SlidersHorizontalIcon, group: 'Platforms' },
  { label: 'Platform Capacity', to: '/capacity', icon: GaugeIcon, group: 'Platforms' },
  { label: 'Departments', to: '/departments', icon: Building2Icon, group: 'Platforms' },
  { label: 'Shifts', to: '/shifts', icon: Clock3Icon, group: 'Scheduling' },
  { label: 'Rotation', to: '/rotation', icon: RepeatIcon, group: 'Scheduling' },
  { label: 'Roster', to: '/roster', icon: CalendarDaysIcon, group: 'Scheduling' },
  { label: 'Off-days', to: '/off-days', icon: CalendarOffIcon, group: 'Scheduling' },
  { label: 'Replacements', to: '/replacements', icon: RefreshCwIcon, group: 'Scheduling' },
  { label: 'Workstation Pools', to: '/pools', icon: MonitorSmartphoneIcon, group: 'Workstations' },
  { label: 'Laptops', to: '/laptops', icon: LaptopIcon, group: 'Workstations' },
  { label: 'Incidents', to: '/incidents', icon: ShieldAlertIcon, group: 'Workstations' },
  { label: 'Notifications', to: '/notifications', icon: BellIcon, group: 'System' },
  { label: 'Reports', to: '/reports', icon: BarChart3Icon, group: 'System' },
  { label: 'Audit Logs', to: '/audit', icon: ScrollTextIcon, group: 'System' },
  { label: 'Settings', to: '/settings', icon: SettingsIcon, group: 'System' }],

  EMPLOYEE: [
  { label: 'Dashboard', to: '/', icon: LayoutDashboardIcon },
  { label: 'My Platform', to: '/my/platform', icon: ServerIcon },
  { label: 'My Schedule', to: '/my/schedule', icon: CalendarDaysIcon },
  { label: 'My Off-days', to: '/my/off-days', icon: CalendarOffIcon },
  { label: 'My Workstation', to: '/my/workstation', icon: LaptopIcon },
  { label: 'Handover', to: '/handover', icon: ArrowLeftRightIcon },
  { label: 'Report Issue', to: '/report-issue', icon: TriangleAlertIcon },
  { label: 'Notifications', to: '/notifications', icon: BellIcon },
  { label: 'Profile', to: '/profile', icon: UserCircleIcon }],

  FREELANCER: [
  { label: 'Dashboard', to: '/', icon: LayoutDashboardIcon },
  { label: 'Availability', to: '/my/availability', icon: CalendarCheckIcon },
  { label: 'Assignments', to: '/my/assignments', icon: ClipboardListIcon },
  { label: 'My Platform', to: '/my/platform', icon: ServerIcon },
  { label: 'My Workstation', to: '/my/workstation', icon: LaptopIcon },
  { label: 'Handover', to: '/handover', icon: ArrowLeftRightIcon },
  { label: 'Report Issue', to: '/report-issue', icon: TriangleAlertIcon },
  { label: 'Notifications', to: '/notifications', icon: BellIcon },
  { label: 'Profile', to: '/profile', icon: UserCircleIcon }]

};

export const mobilePrimary: Record<Role, string[]> = {
  SUPERVISOR: ['/', '/operations', '/replacements', '/pools'],
  EMPLOYEE: ['/', '/my/schedule', '/my/off-days', '/handover'],
  FREELANCER: ['/', '/my/availability', '/my/assignments', '/handover']
};

export const roleLabels: Record<Role, string> = {
  SUPERVISOR: 'Supervisor',
  EMPLOYEE: 'Permanent Employee',
  FREELANCER: 'Freelancer'
};