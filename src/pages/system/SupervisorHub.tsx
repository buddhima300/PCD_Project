import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { areaLinks, contextualDestination, supervisorAreaFor } from '../../data/supervisorNavigation';
import { useBreakSnapshot } from '../../features/break-management/hooks';
import { PageHeader } from '../../components/ui/PageHeader';
import { WorkspaceSummary } from '../../components/ui/WorkspaceSummary';
import { QueryView } from '../../components/ui/States';
import { EquipmentWorkspace } from '../resources/EquipmentWorkspace';
import { Roster } from '../scheduling/Roster';
import { PlatformOperations } from '../platforms/PlatformOperations';
import { Reports } from './Reports';
import { api } from '../../services/api';
import { TODAY } from '../../utils/clock';
import { reportDefinitions } from '../../data/reports';

export function SupervisorHub() {
  const { pathname } = useLocation();
  const area = supervisorAreaFor(pathname);
  if (!area) return null;
  if (area.id === 'equipment') return <EquipmentWorkspace />;
  return <div className="area-workspace"><PageHeader title={area.label} description={area.description} /><SupervisorHubLinks />
    {area.id === 'scheduling' && <><SchedulingSummary /><Roster embedded /></>}
    {area.id === 'operations' && <PlatformOperations embedded />}
    {area.id === 'insights' && <><InsightsSummary /><Reports embedded /></>}
  </div>;
}

export function SupervisorHubLinks() {
  const { pathname, search } = useLocation();
  const breaks = useBreakSnapshot();
  const area = supervisorAreaFor(pathname);
  if (!area) return null;
  const links = areaLinks(area, breaks.data);
  return <nav aria-label={`${area.label} tools`} className="workspace-tabs mb-5 flex flex-wrap gap-1 border-b border-line">
    <Link to={area.to} aria-current="page" className="border-b-2 border-primary px-3 py-3 text-xs font-medium text-primary">Overview</Link>
    {links.map(link => <Link key={link.to} to={contextualDestination(link.to, pathname, search)} className="px-3 py-3 text-xs font-medium text-ink-muted hover:text-ink"><link.icon className="mr-1.5 inline h-4 w-4" aria-hidden />{link.label}</Link>)}
  </nav>;
}

function SchedulingSummary() {
  const query = useQuery({ queryKey: ['daily-roster', TODAY, {}], queryFn: () => api.getDailyRoster(TODAY, {}) });
  return <QueryView query={query}>{rows => <WorkspaceSummary label={`Scheduling summary for ${TODAY}`} items={[
    { label: 'Rostered staff', value: rows.length, note: `Today · ${TODAY}` },
    { label: 'Working', value: rows.filter(row => row.state === 'WORKING').length },
    { label: 'Off-day / leave', value: rows.filter(row => row.state === 'OFF' || row.state === 'LEAVE').length },
    { label: 'Absent', value: rows.filter(row => row.state === 'ABSENT').length },
    { label: 'Replaced', value: rows.filter(row => row.state === 'REPLACED').length },
  ]} />}</QueryView>;
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
