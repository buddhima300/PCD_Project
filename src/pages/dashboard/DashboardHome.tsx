import { useSessionStore } from '../../hooks/useSessionStore';
import { EmployeeDashboard } from './EmployeeDashboard';
import { FreelancerDashboard } from './FreelancerDashboard';
import { OpsDashboard } from './OpsDashboard';
import { BreakDashboardSummary } from '../../features/break-management/DashboardSummary';

export function DashboardHome() {
  const role = useSessionStore((s) => s.user?.role);
  return <><BreakDashboardSummary />{role === 'EMPLOYEE' ? <EmployeeDashboard /> : role === 'FREELANCER' ? <FreelancerDashboard /> : <OpsDashboard />}</>;
}
