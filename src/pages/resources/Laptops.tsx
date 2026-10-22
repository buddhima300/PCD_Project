import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { ScopeFilters, type Scope } from '../../components/ui/ScopeFilters';
import { SearchInput } from '../../components/ui/SearchInput';
import { EmptyState, ErrorState, LoadingBlock, QueryView } from '../../components/ui/States';
import { DeptTag, IdText } from '../../components/ui/Tags';
import { api } from '../../services/api';
import { fmtDateTime } from '../../utils/format';
import type { WorkstationInventoryRow } from '../../types/equipment';
import { RegisterPlatformDevice } from '../../components/resources/RegisterPlatformDevice';
import { LaptopModelEditor } from '../../components/resources/LaptopModelEditor';

export function Laptops({ embedded = false }: { embedded?: boolean }) {
  const [scope, setScope] = useState<Scope>({ category: '', platform: '', dept: '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const query = { ...scope, search, page, pageSize: 25 };
  const q = useQuery({ queryKey: ['workstations', query], queryFn: () => api.listWorkstations(query), placeholderData: keepPreviousData, refetchInterval: 15000 });
  const detail = useQuery({ queryKey: ['workstation', selected], queryFn: () => api.getWorkstation(selected ?? ''), enabled: !!selected, refetchInterval: 15000 });
  const row = detail.data?.workstation;
  const laptop = row?.laptop;

  return <div className={compact ? 'equipment-inventory equipment-compact' : 'equipment-inventory'}>
    {embedded ? <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-base font-semibold">Asset inventory</h2><p className="mt-1 text-xs text-ink-muted">Workstations follow saved platform seating. Select a row for device details and activity.</p></div><span className="text-xs text-ink-muted">{q.data ? `${q.data.total} matching workstations` : 'Loading workstations…'}</span></div> : <PageHeader title="Asset inventory" description="Workstations and shared devices for every configured platform seat." />}
    <Card>
      <div className="flex flex-wrap gap-2 border-b border-line p-3">
        <SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }} placeholder="Workstation, laptop model or user" className="w-72" />
        <ScopeFilters value={scope} onChange={value => { setScope(value); setPage(1); }} show={['category', 'platform', 'dept']} />
        <button aria-pressed={compact} onClick={() => setCompact(!compact)} className="rounded-lg border border-line px-3 py-2 text-xs text-ink-muted">{compact ? 'Comfortable rows' : 'Compact rows'}</button>
        {(search || Object.values(scope).some(Boolean)) && <button className="px-3 py-2 text-xs text-primary" onClick={() => { setSearch(''); setScope({ category: '', platform: '', dept: '' }); setPage(1); }}>Clear filters</button>}
      </div>
      <QueryView query={q} isEmpty={data => data.total === 0}>
        {data => <>
          <DataTable<WorkstationInventoryRow> caption="Workstation inventory" rows={data.items} rowKey={item => item.workstationId} onRowClick={item => setSelected(item.workstationId)} columns={[
            { key: 'pool', header: 'Pool', cell: item => <span className="flex items-center gap-1.5">{item.platformCode} <DeptTag dept={item.dept} /></span> },
            { key: 'workstation', header: 'Workstation', cell: item => <IdText className="font-semibold">{item.workstationId}</IdText> },
            { key: 'model', header: 'Laptop model', cell: item => item.laptop ? <LaptopModelEditor laptop={item.laptop} /> : <span className="text-ink-subtle">No laptop registered</span> },
            { key: 'user', header: 'Current user', cell: item => item.laptop?.currentUserName ?? item.laptop?.currentUserId ?? <span className="text-ink-subtle">—</span> },
          ]} />
          <Pagination page={page} pageSize={25} total={data.total} onPage={setPage} />
          {data.total > 0 && data.items.length === 0 && <button className="m-4 text-sm text-primary" onClick={() => setPage(1)}>Return to first page</button>}
        </>}
      </QueryView>
    </Card>
    <Dialog open={!!selected} onClose={() => setSelected(null)} placement="right" title={selected ?? 'Workstation details'} description="Current device and recorded activity" footer={laptop && <Link to={`/laptops/${encodeURIComponent(laptop.assetId)}`} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white">Open full record</Link>}>
      {detail.isPending ? <LoadingBlock rows={5} /> : detail.isError ? <ErrorState error={detail.error} onRetry={() => detail.refetch()} /> : row && <>
        <dl className="space-y-3 text-sm">{[
          ['Pool', row.poolId], ['Workstation', row.workstationId], ['Platform / department', `${row.platformCode} / ${row.dept}`],
          ['Laptop model', laptop?.model ?? 'No laptop registered'], ['Asset ID', laptop?.assetId], ['Serial', laptop?.serial],
          ['Current user', laptop?.currentUserName ?? laptop?.currentUserId], ['Current shift', laptop?.currentShift],
        ].map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b border-line pb-3"><dt className="text-ink-muted">{label}</dt><dd className="text-right">{value ?? '—'}</dd></div>)}</dl>
        {!laptop && <div className="mt-4"><RegisterPlatformDevice key={row.workstationId} poolId={row.poolId} workstationId={row.workstationId} /></div>}
        <h3 className="mb-3 mt-6 text-sm font-semibold">Recent activity</h3>
        {detail.data.history.length ? <ol className="space-y-4">{detail.data.history.slice(0, 8).map((event, index) => <li key={`${event.at}-${index}`} className="border-l-2 border-line pl-3"><p className="text-sm">{event.title}</p><p className="mt-1 text-xs text-ink-muted">{event.detail}</p><p className="mt-1 text-xs text-ink-subtle">{fmtDateTime(event.at)}</p></li>)}</ol> : <EmptyState title="No activity recorded" />}
      </>}
    </Dialog>
  </div>;
}
