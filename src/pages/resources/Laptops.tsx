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

const STATUSES: LaptopStatus[] = ['AVAILABLE', 'ASSIGNED', 'HANDOVER_PENDING', 'MAINTENANCE', 'INCIDENT', 'RETIRED'];

export function Laptops() {
  const [scope, setScope] = useState<Scope>({ category: '', platform: '', dept: '' });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LaptopStatus | ''>('');
  const [page, setPage] = useState(1);
  const query: LaptopQuery = { ...scope, search, status, page, pageSize: 25 };
  const q = useQuery({ queryKey: ['laptops', query], queryFn: () => api.listLaptops(query), placeholderData: keepPreviousData });
  const counts = (q.data as unknown as {counts?: Record<string, number>;} | undefined)?.counts ?? {};

  return (
    <div>
      <PageHeader title="Laptop inventory" description="Every physical laptop with its pool, current shift user, next scheduled user and condition." />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        <button onClick={() => {setStatus('');setPage(1);}} className={cn('rounded-xl border px-3 py-1.5 text-xs font-medium', !status ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-line bg-surface text-ink-muted')}>
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
        </div>
        <QueryView query={q} isEmpty={(d) => d.items.length === 0}>
          {(d) =>
          <>
              <LaptopTable rows={d.items} />
              <Pagination page={page} pageSize={25} total={d.total} onPage={setPage} />
            </>
          }
        </QueryView>
      </Card>
    </div>);

}