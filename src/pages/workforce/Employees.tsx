import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { ScopeFilters, type Scope } from '../../components/ui/ScopeFilters';
import { SearchInput } from '../../components/ui/SearchInput';
import { EmptyState, ErrorState, LoadingBlock } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DeptTag, IdText, ShiftTag } from '../../components/ui/Tags';
import { api, type EmployeeQuery } from '../../services/api';
import type { Employee } from '../../types/domain';
import { cn } from '../../utils/cn';

const PAGE_SIZE = 100;
const COLS = 'grid-cols-[110px_minmax(160px,1.4fr)_90px_60px_minmax(150px,1.2fr)_96px_minmax(150px,1fr)_90px_100px_90px]';

const headers: {key: keyof Employee;label: string;}[] = [
{ key: 'id', label: 'Employee ID' },
{ key: 'name', label: 'Name' },
{ key: 'platformCode', label: 'Platform' },
{ key: 'dept', label: 'Dept' },
{ key: 'position', label: 'Position' },
{ key: 'shift', label: 'Shift' },
{ key: 'currentWorkstationId', label: 'Workstation' },
{ key: 'offDaysUsed', label: 'Off-days' },
{ key: 'status', label: 'Employment' },
{ key: 'accountStatus', label: 'Account' }];


export function Employees() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope>({ category: '', platform: '', dept: '', shift: '' });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{key: keyof Employee;dir: 'asc' | 'desc';}>({ key: 'id', dir: 'asc' });
  const query: EmployeeQuery = { ...scope, search, status, page, pageSize: PAGE_SIZE, sort: sort.key, dir: sort.dir };
  const q = useQuery({ queryKey: ['employees', query], queryFn: () => api.listEmployees(query), placeholderData: keepPreviousData });
  const parentRef = useRef<HTMLDivElement>(null);
  const items = q.data?.items ?? [];
  const virtualizer = useVirtualizer({ count: items.length, getScrollElement: () => parentRef.current, estimateSize: () => 44, overscan: 10 });

  const update = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <div>
      <PageHeader title="Employee directory" description="Server-side search, filtering, sorting and pagination. Rows are virtualised for large result sets." />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={search} onChange={update(setSearch)} placeholder="Search ID, name, email" className="w-64" />
          <ScopeFilters value={scope} onChange={update(setScope)} />
          <Select compact className="w-40" aria-label="Status" value={status} onChange={(e) => update(setStatus)(e.target.value)} placeholder="Any status" options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'ON_LEAVE', label: 'On leave' }, { value: 'LOCKED', label: 'Account locked' }, { value: 'INVITED', label: 'Account invited' }]} />
        </div>
        {q.isPending ?
        <LoadingBlock rows={10} /> :
        q.isError ?
        <ErrorState error={q.error} onRetry={() => q.refetch()} /> :
        items.length === 0 ?
        <EmptyState title="No employees match these filters" description="Try another platform, department or search term." /> :

        <div className="scroll-thin overflow-x-auto">
            <div role="table" aria-label="Employees" aria-rowcount={q.data.total} className="min-w-[1180px]">
              <div role="rowgroup">
                <div role="row" className={cn('grid border-b border-line bg-mist/70', COLS)}>
                  {headers.map((h) =>
                <div role="columnheader" key={h.key} className="px-3 py-2.5" aria-sort={sort.key === h.key ? sort.dir === 'asc' ? 'ascending' : 'descending' : undefined}>
                      <button
                    onClick={() => setSort((s) => ({ key: h.key, dir: s.key === h.key && s.dir === 'asc' ? 'desc' : 'asc' }))}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle hover:text-ink">
                    
                        {h.label}
                        {sort.key === h.key && (sort.dir === 'asc' ? <ArrowUpIcon className="h-3 w-3" /> : <ArrowDownIcon className="h-3 w-3" />)}
                      </button>
                    </div>
                )}
                </div>
              </div>
              <div ref={parentRef} role="rowgroup" className={cn('scroll-thin relative h-[600px] overflow-y-auto', q.isFetching && 'opacity-60')}>
                <div style={{ height: virtualizer.getTotalSize() }} className="relative">
                  {virtualizer.getVirtualItems().map((v) => {
                  const e = items[v.index];
                  return (
                    <div
                      key={e.id}
                      role="row"
                      tabIndex={0}
                      onClick={() => navigate(`/employees/${e.id}`)}
                      onKeyDown={(ev) => ev.key === 'Enter' && navigate(`/employees/${e.id}`)}
                      className={cn('absolute left-0 right-0 grid cursor-pointer items-center border-b border-line text-[13px] hover:bg-primary-50/50 focus-visible:bg-primary-50 focus-visible:outline-none', COLS)}
                      style={{ height: v.size, transform: `translateY(${v.start}px)` }}>
                      
                        <div role="cell" className="px-3"><IdText>{e.id}</IdText></div>
                        <div role="cell" className="truncate px-3 font-medium">{e.name}</div>
                        <div role="cell" className="px-3">{e.platformCode}</div>
                        <div role="cell" className="px-3"><DeptTag dept={e.dept} /></div>
                        <div role="cell" className="truncate px-3 text-ink-muted">{e.position}</div>
                        <div role="cell" className="px-3"><ShiftTag shift={e.shift} /></div>
                        <div role="cell" className="truncate px-3">{e.currentWorkstationId ? <IdText>{e.currentWorkstationId}</IdText> : <span className="text-ink-subtle">—</span>}</div>
                        <div role="cell" className="px-3 tabular">{e.offDaysUsed} / {e.offDaysAllowance}</div>
                        <div role="cell" className="px-3"><StatusBadge status={e.status} size="xs" /></div>
                        <div role="cell" className="px-3"><StatusBadge status={e.accountStatus} size="xs" /></div>
                      </div>);

                })}
                </div>
              </div>
            </div>
          </div>
        }
        {q.data && <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={setPage} />}
      </Card>
    </div>);

}