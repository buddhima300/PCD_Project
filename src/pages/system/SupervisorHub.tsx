import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supervisorAreaFor } from '../../data/supervisorNavigation';
import { PageHeader } from '../../components/ui/PageHeader';
import { WorkspaceSummary } from '../../components/ui/WorkspaceSummary';
import { QueryView } from '../../components/ui/States';
import { EquipmentWorkspace } from '../resources/EquipmentWorkspace';
import { Reports } from './Reports';
import { api } from '../../services/api';
import { reportDefinitions } from '../../data/reports';
import { SupervisorAreaNavigation } from '../../components/layout/SupervisorAreaNavigation';

export function SupervisorHub() {
  const { pathname } = useLocation();
  const area = supervisorAreaFor(pathname);
  if (!area) return null;
  if (area.id === 'equipment') return <EquipmentWorkspace />;
  return <div className="area-workspace"><PageHeader title={area.label} description={area.description} /><SupervisorHubLinks />
    {area.id === 'insights' && <><InsightsSummary /><Reports embedded /></>}
  </div>;
}

export function SupervisorHubLinks() {
  const { pathname } = useLocation();
  const area = supervisorAreaFor(pathname);
  if (!area) return null;
  return <SupervisorAreaNavigation area={area}/>;
}

function InsightsSummary() {
  const notifications = useQuery({ queryKey: ['notifications', '', false], queryFn: () => api.listNotifications({}) });
  const audit = useQuery({ queryKey: ['audit-summary'], queryFn: () => api.listAudit({ page: 1, pageSize: 1 }) });
  return <><WorkspaceSummary label="Insights summary" items={[
    { label: 'Available reports', value: reportDefinitions.length },
    { label: 'Report groups', value: new Set(reportDefinitions.map(report => report.group)).size },
    { label: 'Unread notifications', value: notifications.data?.unread },
    { label: 'Audit entries', value: audit.data?.total },
  ]} />{(notifications.isError || audit.isError) && <p role="status" className="mb-3 text-xs text-warning">Some summary totals are unavailable. Reports remain accessible below.</p>}</>;
}
