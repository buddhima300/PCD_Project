import { ActivityIcon, BarChart3Icon, CalendarDaysIcon, LaptopIcon, LayoutDashboardIcon, UsersIcon } from 'lucide-react';
import { legacyNavByRole, type NavItem } from './navigation';
import type { BreakSnapshot } from '../features/break-management/contracts';
import type { Role } from '../types/domain';

export interface SupervisorArea extends NavItem {
  id: string;
  description: string;
  routes: readonly string[];
}

// Existing route guards remain authoritative. These areas organize supervisor-only routes.
export const supervisorAreas: SupervisorArea[] = [
  { id: 'dashboard', label: 'Dashboard', to: '/', icon: LayoutDashboardIcon, description: 'Your current operational overview.', routes: ['/'] },
  { id: 'workforce', label: 'Workforce', to: '/workforce', icon: UsersIcon, description: 'Find workforce records, manage recruitment and placement, and review training.', routes: ['/workforce', '/employees', '/freelancers', '/departments', '/positions', '/candidates', '/register', '/placement-queue', '/platform-demand', '/training'] },
  { id: 'scheduling', label: 'Scheduling', to: '/scheduling', icon: CalendarDaysIcon, description: 'Plan coverage with the roster, shift definitions, rotation history and off-day approvals.', routes: ['/roster', '/shifts', '/rotation', '/off-days'] },
  { id: 'operations', label: 'Operations', to: '/supervisor-operations', icon: ActivityIcon, description: 'Review live platform operations, coordinate replacements, monitor breaks and manage conduct cases.', routes: ['/operations', '/replacements', '/breaks', '/disciplinary'] },
  { id: 'equipment', label: 'Equipment', to: '/equipment', icon: LaptopIcon, description: 'Review platform capacity, shared workstations, laptops and equipment incidents.', routes: ['/platforms', '/categories', '/platform-config', '/capacity', '/pools', '/laptops', '/incidents'] },
  { id: 'insights', label: 'Insights & Tools', to: '/insights', icon: BarChart3Icon, description: 'Review reports, audit activity and notifications, or open system settings.', routes: ['/reports', '/audit', '/notifications', '/settings', '/profile'] },
];

export function matchesDestination(pathname: string, to: string) {
  return pathname === to || (to !== '/' && pathname.startsWith(`${to}/`));
}

export function supervisorAreaFor(pathname: string) {
  return supervisorAreas.find(area => pathname === area.to || area.routes.some(to => matchesDestination(pathname, to)));
}

export function visibleNavigation(items: NavItem[], role: Role, snapshot?: BreakSnapshot): NavItem[] {
  return items.filter(item => {
    if (!item.to.startsWith('/breaks') && item.to !== '/my/breaks') return true;
    if (!snapshot?.capabilities.view) return false;
    if (role !== 'SUPERVISOR') return item.to === '/my/breaks';
    if (item.to === '/breaks/policy') return snapshot.capabilities.monitor && snapshot.capabilities.policy;
    return snapshot.capabilities.monitor;
  });
}

export function areaLinks(area: SupervisorArea, snapshot?: BreakSnapshot) {
  const items = legacyNavByRole.SUPERVISOR.filter(item => area.routes.includes(item.to) && item.to !== area.to);
  if (area.id === 'operations') {
    items.push({ label: 'Break history & reports', to: '/breaks/reports', icon: CalendarDaysIcon, group: 'Breaks' });
    items.push({ label: 'Break policy', to: '/breaks/policy', icon: ActivityIcon, group: 'Breaks' });
  }
  return visibleNavigation(items, 'SUPERVISOR', snapshot);
}

// Carry only compatible, shared scope keys. Workflow-specific tabs and record IDs never leak.
const scopeKeys: Record<string, readonly string[]> = {
  '/scheduling': ['category', 'dept', 'platform'],
  '/roster': ['category', 'dept', 'platform'],
  '/off-days': ['category', 'dept', 'platform'],
};
export function contextualDestination(to: string, pathname: string, search: string) {
  const source = new URLSearchParams(search);
  const target = new URLSearchParams();
  for (const key of scopeKeys[to] ?? []) {
    const value = source.get(key);
    if (scopeKeys[pathname]?.includes(key) && value !== null) target.set(key, value);
  }
  return to + (target.size ? `?${target}` : '');
}
