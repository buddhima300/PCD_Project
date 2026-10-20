import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDownIcon, ArrowUpIcon, UserPlusIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
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
import { Dialog } from '../../components/ui/Dialog';
import { EmployeePlatformAction } from '../../components/placement/EmployeePlatformAction';
import { OffDayBalance } from '../../components/offday/OffDayBalance';
import { EmployeeCareerSummary } from '../../components/placement/EmployeeCareer';
import { EmployeeLoginToggle } from '../../components/placement/EmployeeLoginToggle';
import { fmtDate } from '../../utils/format';

const PAGE_SIZE = 100;
const COLS = 'grid-cols-[110px_minmax(160px,1.4fr)_90px_60px_minmax(150px,1.2fr)_96px_90px_210px_90px]';

const headers: {key: keyof Employee;label: string;}[] = [
{ key: 'id', label: 'Employee ID' },
{ key: 'name', label: 'Name' },
{ key: 'platformCode', label: 'Platform' },
{ key: 'dept', label: 'Dept' },
{ key: 'position', label: 'Position' },
{ key: 'shift', label: 'Shift' },
{ key: 'offDaysUsed', label: 'Off-days' },
{ key: 'status', label: 'Employment' },
{ key: 'accountStatus', label: 'Account' }];


export function Employees({ embedded = false }: { embedded?: boolean }) {
  const [scope, setScope] = useState<Scope>({ category: '', platform: '', dept: '', shift: '' });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const detail = useQuery({ queryKey: ['employee', selectedId], queryFn: () => api.getEmployee(selectedId ?? ''), enabled: !!selectedId });
  const [sort, setSort] = useState<{key: keyof Employee;dir: 'asc' | 'desc';}>({ key: 'id', dir: 'asc' });
  const query: EmployeeQuery = { ...scope, search, status, page, pageSize: PAGE_SIZE, sort: sort.key, dir: sort.dir };
  const q = useQuery({ queryKey: ['employees', query], queryFn: () => api.listEmployees(query), placeholderData: keepPreviousData });
  const parentRef = useRef<HTMLDivElement>(null);
  const items = q.data?.items ?? [];
  const rowHeight = compact ? 36 : 44;
  const virtualizer = useVirtualizer({ count: items.length, getScrollElement: () => parentRef.current, estimateSize: () => rowHeight, overscan: 10 });
  useEffect(() => { virtualizer.measure(); }, [rowHeight, virtualizer]);

  const update = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <div className={embedded ? 'mt-5' : undefined}>
      {embedded ? <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-base font-semibold">Employee directory</h2><p className="mt-1 text-xs text-ink-muted">Search staff and inspect assignments without leaving the directory.</p></div><span className="text-xs text-ink-muted">{q.data ? `${q.data.total} matching employees` : 'Loading staff…'}</span></div> : <PageHeader title="Employee directory" description="Search, filter and inspect workforce records. Rows are virtualised for large result sets." actions={<Link to="/register"><Button icon={<UserPlusIcon className="h-4 w-4" />}>Register staff</Button></Link>} />}
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={search} onChange={update(setSearch)} placeholder="Search ID, name, email" className="w-64" />
          <ScopeFilters value={scope} onChange={update(setScope)} />
          <Select compact className="w-40" aria-label="Status" value={status} onChange={(e) => update(setStatus)(e.target.value)} placeholder="Any status" options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'ON_LEAVE', label: 'On leave' }, { value: 'LOCKED', label: 'Account locked' }, { value: 'INVITED', label: 'Account invited' }]} />
          <button aria-pressed={compact} onClick={() => setCompact(!compact)} className="rounded-lg border border-line px-3 py-2 text-xs text-ink-muted">{compact ? 'Comfortable rows' : 'Compact rows'}</button>
          {(search || status || Object.values(scope).some(Boolean)) && <button onClick={() => {setSearch('');setStatus('');setScope({ category: '', platform: '', dept: '', shift: '' });setPage(1);}} className="px-3 py-2 text-xs text-primary">Clear filters</button>}
        </div>
        {q.isPending ?
        <LoadingBlock rows={10} /> :
        q.isError ?
        <ErrorState error={q.error} onRetry={() => q.refetch()} /> :
        items.length === 0 ?
        <EmptyState title="No employees match these filters" description="Try another platform, department or search term." /> :

        <div className="scroll-thin overflow-x-auto">
            <div role="table" aria-label="Employees" aria-rowcount={q.data.total} className="min-w-[1170px]">
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
                      onClick={() => setSelectedId(e.id)}
                      onKeyDown={(ev) => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); setSelectedId(e.id); } }}
                      className={cn('absolute left-0 right-0 grid cursor-pointer items-center border-b border-line text-[13px] hover:bg-primary-50/50 focus-visible:bg-primary-50 focus-visible:outline-none', COLS)}
                      style={{ height: v.size, transform: `translateY(${v.start}px)` }}>
                      
                        <div role="cell" className="px-3"><IdText>{e.staffNumber??e.id}</IdText></div>
                        <div role="cell" className="truncate px-3 font-medium">{e.name}</div>
                        <div role="cell" className="px-3">{e.platformCode || <span className="text-ink-subtle">Unassigned</span>}</div>
                        <div role="cell" className="px-3"><DeptTag dept={e.dept} /></div>
                        <div role="cell" className="truncate px-3 text-ink-muted">{e.position}</div>
                        <div role="cell" className="px-3"><ShiftTag shift={e.shift} filled /></div>
                        <div role="cell" className="px-3 tabular">{e.offDaysUsed} / {e.offDaysAllowance}</div>
                        <div role="cell" className="flex items-center gap-2 px-3"><StatusBadge status={e.status} filled size="xs" /><EmployeeLoginToggle employee={e} /></div>
                        <div role="cell" className="px-3">{e.loginAccess?.hasAccount === false ? <span className="text-xs text-ink-subtle">No login</span> : <StatusBadge status={e.accountStatus} filled size="xs" />}</div>
                      </div>);

                })}
                </div>
              </div>
            </div>
          </div>
        }
        {q.data && <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={setPage} />}
      </Card>
      <Dialog open={!!selectedId} onClose={() => setSelectedId(null)} placement="right" title={detail.data?.employee.name ?? selectedId ?? 'Employee details'} description={selectedId ?? undefined} footer={selectedId && <Link to={`/employees/${selectedId}`} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white">Open full record</Link>}>
        {detail.isPending ? <LoadingBlock rows={5} /> : detail.isError ? <ErrorState error={detail.error} onRetry={() => detail.refetch()} /> : detail.data && <>
          <div className="mb-5 flex gap-2"><StatusBadge status={detail.data.employee.status} /><StatusBadge status={detail.data.employee.accountStatus} /></div>
          <OffDayBalance detail={detail.data} /><EmployeeCareerSummary employee={detail.data.employee} /><EmployeePlatformAction key={detail.data.employee.id} employee={detail.data.employee} /><h3 className="mb-3 text-sm font-semibold">Operational assignment</h3><dl className="space-y-3 text-sm">{[
            ['Platform', detail.data.employee.platformCode || 'Unassigned'], ['Department', detail.data.employee.dept], ['Position', detail.data.employee.position],
            ['Shift', detail.data.employee.shift], ['Shared device pool', detail.data.employee.poolId], ['Device currently held', detail.data.employee.workstationState === 'IN_USE' ? detail.data.employee.currentWorkstationId : null],
            ['Off-days used', `${detail.data.employee.offDaysUsed} / ${detail.data.employee.offDaysAllowance}`], ['Joined', fmtDate(detail.data.employee.joinedAt)],
          ].map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b border-line pb-3"><dt className="text-ink-muted">{label}</dt><dd className="text-right">{value ?? '—'}</dd></div>)}</dl>
          <h3 className="mb-3 mt-6 text-sm font-semibold">Contact details</h3><p className="break-all text-sm text-ink-muted">{detail.data.employee.email}</p><p className="mt-1 text-sm text-ink-muted">{detail.data.employee.phone}</p>
          <p className="mt-4 text-xs text-ink-subtle">Open the full record for schedules, off-days, replacements and audit history.</p>
        </>}
      </Dialog>
    </div>);

}
