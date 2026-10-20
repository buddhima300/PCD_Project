import React, { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { LaptopTable } from '../../components/resources/LaptopTable';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { ScopeFilters, type Scope } from '../../components/ui/ScopeFilters';
import { SearchInput } from '../../components/ui/SearchInput';
import { QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { api, type LaptopQuery } from '../../services/api';
import type { LaptopStatus } from '../../types/domain';
import { cn } from '../../utils/cn';
import { Link } from 'react-router-dom';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState, ErrorState, LoadingBlock } from '../../components/ui/States';
import { fmtDateTime } from '../../utils/format';

const STATUSES: LaptopStatus[] = ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'INCIDENT', 'RETIRED'];

export function Laptops({ embedded = false }: { embedded?: boolean }) {
  const [scope, setScope] = useState<Scope>({ category: '', platform: '', dept: '' });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LaptopStatus | ''>('');
  const [page, setPage] = useState(1);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const detail = useQuery({ queryKey: ['laptop', selectedAsset], queryFn: () => api.getLaptop(selectedAsset ?? ''), enabled: !!selectedAsset });
  const query: LaptopQuery = { ...scope, search, status, page, pageSize: 25 };
  const q = useQuery({ queryKey: ['laptops', query], queryFn: () => api.listLaptops(query), placeholderData: keepPreviousData });
  const counts = (q.data as unknown as {counts?: Record<string, number>;} | undefined)?.counts ?? {};

  return (
    <div className={compact ? 'equipment-inventory equipment-compact' : 'equipment-inventory'}>
      {embedded ? <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-base font-semibold">Asset inventory</h2><p className="mt-1 text-xs text-ink-muted">Select a row to inspect assignments and history.</p></div><span className="text-xs text-ink-muted">{q.data ? `${q.data.total} matching assets` : 'Loading assets…'}</span></div> : <PageHeader title="Laptop inventory" description="Shared platform inventory, device condition and equipment issues." />}
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        <button aria-pressed={!status} onClick={() => {setStatus('');setPage(1);}} className={cn('rounded-xl border px-3 py-1.5 text-xs font-medium', !status ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-line bg-surface text-ink-muted')}>
          All <span className="tabular">{Object.values(counts).reduce((s, n) => s + n, 0)}</span>
        </button>
        {STATUSES.map((s) =>
        <button key={s} onClick={() => {setStatus(s);setPage(1);}} aria-pressed={status === s} className={cn('flex items-center gap-1.5 rounded-xl border px-2 py-1 text-xs', status === s ? 'border-primary-200 bg-primary-50' : 'border-line bg-surface')}>
            <StatusBadge status={s} size="xs" /> <span className="tabular font-semibold">{counts[s] ?? 0}</span>
          </button>
        )}
      </div>
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <SearchInput value={search} onChange={(v) => {setSearch(v);setPage(1);}} placeholder="Asset ID, serial, workstation, user" className="w-72" />
          <ScopeFilters value={scope} onChange={(v) => {setScope(v);setPage(1);}} show={['category', 'platform', 'dept']} />
          <button aria-pressed={compact} onClick={() => setCompact(!compact)} className="rounded-lg border border-line px-3 py-2 text-xs text-ink-muted">{compact ? 'Comfortable rows' : 'Compact rows'}</button>
          {(search || status || Object.values(scope).some(Boolean)) && <button className="px-3 py-2 text-xs text-primary" onClick={() => {setSearch('');setStatus('');setScope({ category: '', platform: '', dept: '' });setPage(1);}}>Clear filters</button>}
        </div>
        <QueryView query={q} isEmpty={(d) => d.items.length === 0}>
          {(d) =>
          <>
              <LaptopTable rows={d.items} onSelect={laptop => setSelectedAsset(laptop.assetId)} />
              <Pagination page={page} pageSize={25} total={d.total} onPage={setPage} />
            </>
          }
        </QueryView>
      </Card>
      <Dialog open={!!selectedAsset} onClose={() => setSelectedAsset(null)} placement="right" title={selectedAsset ?? 'Asset details'} description="Resource assignment and recent activity" footer={selectedAsset && <Link to={`/laptops/${selectedAsset}`} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white">Open full record</Link>}>
        {detail.isPending ? <LoadingBlock rows={5} /> : detail.isError ? <ErrorState error={detail.error} onRetry={() => detail.refetch()} /> : detail.data && <>
          <div className="mb-5 flex gap-2"><StatusBadge status={detail.data.laptop.status} /><StatusBadge status={detail.data.laptop.condition} /></div>
          <dl className="space-y-3 text-sm">{[
            ['Model', detail.data.laptop.model], ['Serial', detail.data.laptop.serial], ['Workstation', detail.data.laptop.workstationId],
            ['Platform / department', `${detail.data.laptop.platformCode} / ${detail.data.laptop.dept}`],
            ['Current user', detail.data.laptop.currentUserName ?? detail.data.laptop.currentUserId], ['Current shift', detail.data.laptop.currentShift],
            ['Open incident', detail.data.laptop.openIncidentId],
          ].map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b border-line pb-3"><dt className="text-ink-muted">{label}</dt><dd className="text-right">{value ?? '—'}</dd></div>)}</dl>
          {detail.data.laptop.poolId && <Link to={`/pools/${detail.data.laptop.poolId}`} className="mt-4 inline-block text-xs text-primary">Open workstation pool →</Link>}
          <h3 className="mb-3 mt-6 text-sm font-semibold">Recent activity</h3>
          {detail.data.history.length ? <ol className="space-y-4">{detail.data.history.slice(0, 8).map((event, index) => <li key={`${event.at}-${index}`} className="border-l-2 border-line pl-3"><p className="text-sm">{event.title}</p><p className="mt-1 text-xs text-ink-muted">{event.detail}</p><p className="mt-1 text-xs text-ink-subtle">{fmtDateTime(event.at)}</p></li>)}</ol> : <EmptyState title="No activity recorded" />}
        </>}
      </Dialog>
    </div>);

}
