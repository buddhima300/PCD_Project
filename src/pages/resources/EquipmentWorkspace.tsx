import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../components/ui/PageHeader';
import { api } from '../../services/api';
import { legacyNavByRole } from '../../data/navigation';
import { Laptops } from './Laptops';
import { WorkspaceSummary } from '../../components/ui/WorkspaceSummary';

const destinations = ['/laptops', '/capacity', '/pools', '/incidents', '/platforms', '/categories', '/platform-config'];

export function EquipmentWorkspace() {
  const query = useQuery({ queryKey: ['equipment-summary'], queryFn: () => api.listLaptops({ page: 1, pageSize: 1 }) });
  const counts = (query.data as unknown as { counts?: Record<string, number> } | undefined)?.counts;
  const metrics = [
    ['Total laptops', query.data?.total], ['Available', counts ? counts.AVAILABLE ?? 0 : undefined],
    ['Assigned', counts ? counts.ASSIGNED ?? 0 : undefined], ['Handover pending', counts ? counts.HANDOVER_PENDING ?? 0 : undefined],
    ['Needs attention', counts ? (counts.MAINTENANCE ?? 0) + (counts.INCIDENT ?? 0) : undefined],
  ] as const;
  return <div className="equipment-workspace">
    <PageHeader title="Equipment" description="Track assets, inspect assignments and manage platform capacity." actions={<Link to="/report-issue" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white">Report issue</Link>} />
    <nav aria-label="Equipment tools" className="equipment-tabs mb-5 flex flex-wrap gap-1 border-b border-line">
      {legacyNavByRole.SUPERVISOR.filter(item => destinations.includes(item.to)).sort((a, b) => destinations.indexOf(a.to) - destinations.indexOf(b.to)).map(item => <Link key={item.to} to={item.to} className={`px-3 py-3 text-xs font-medium ${item.to === '/laptops' ? 'border-b-2 border-primary text-primary' : 'text-ink-muted hover:text-ink'}`}><item.icon className="mr-1.5 inline h-4 w-4" aria-hidden />{item.label}</Link>)}
    </nav>
    <WorkspaceSummary label="Equipment summary" items={metrics.map(([label, value]) => ({ label, value }))} />
    {query.isError && <p role="status" className="mb-3 text-xs text-warning">Summary unavailable. Use the inventory below or <button className="underline" onClick={() => query.refetch()}>retry</button>.</p>}
    <Laptops embedded />
  </div>;
}
