import React from 'react';
import { useSessionStore } from '../../hooks/useSessionStore';
import { EmployeeDashboard } from './EmployeeDashboard';
import { FreelancerDashboard } from './FreelancerDashboard';
import { OpsDashboard } from './OpsDashboard';

export function DashboardHome() {
  const role = useSessionStore((s) => s.user?.role);
  if (role === 'EMPLOYEE') return <EmployeeDashboard />;
  if (role === 'FREELANCER') return <FreelancerDashboard />;
  return <OpsDashboard />;
}