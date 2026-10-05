import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AvailabilityBoard } from '../../components/freelancer/AvailabilityBoard';
import { PriorityManager } from '../../components/freelancer/PriorityManager';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { SearchInput } from '../../components/ui/SearchInput';
import { QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Tabs } from '../../components/ui/Tabs';
import { DeptTag, IdText } from '../../components/ui/Tags';
import { api } from '../../services/api';
import type { DeptCode } from '../../types/domain';
import { cn } from '../../utils/cn';
import { deptNames } from '../../utils/format';

type Tab = 'directory' | 'priority' | 'availability';

export function Freelancers() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') as Tab ?? 'directory';
  const [dept, setDept] = useState<DeptCode | ''>('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const query = { dept, status, search, page, pageSize: 25 };
  const q = useQuery({ queryKey: ['freelancers', query], queryFn: () => api.listFreelancers(query), placeholderData: keepPreviousData, enabled: tab === 'directory' });

  return (
    <div>
      <PageHeader title="Freelancers" description="Replacement workforce. Each freelancer belongs to one department and may only replace employees from that department." />
      <Tabs className="mb-4" value={tab} onChange={(t) => setParams({ tab: t })} tabs={[{ id: 'directory', label: 'Directory' }, { id: 'priority', label: 'Priority management' }, { id: 'availability', label: 'Availability' }]} />
      {tab === 'priority' && <PriorityManager />}
      {tab === 'availability' && <AvailabilityBoard />}
      {tab === 'directory' &&
      <Card>
          <div className="flex flex-wrap gap-2 border-b border-line p-3">
            <SearchInput value={search} onChange={(v) => {setSearch(v);setPage(1);}} placeholder="Search ID or name" className="w-60" />
            <Select compact className="w-44" aria-label="Department" value={dept} onChange={(e) => {setDept(e.target.value as DeptCode);setPage(1);}} placeholder="All departments" options={(Object.keys(deptNames) as DeptCode[]).map((d) => ({ value: d, label: `${d} · ${deptNames[d]}` }))} />
            <Select compact className="w-32" aria-label="Status" value={status} onChange={(e) => {setStatus(e.target.value);setPage(1);}} placeholder="Any status" options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]} />
          </div>
          <QueryView query={q} isEmpty={(d) => d.items.length === 0}>
            {(d) =>
          <>
                <DataTable
              rows={d.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => navigate(`/freelancers/${r.id}`)}
              columns={[
              { key: 'id', header: 'Freelancer', cell: (r) => <IdText>{r.id}</IdText> },
              { key: 'name', header: 'Name', cell: (r) => <span className="font-medium">{r.name}</span> },
              { key: 'dept', header: 'Dept', cell: (r) => <DeptTag dept={r.dept} /> },
              { key: 'prio', header: 'Priority', align: 'right', cell: (r) => r.priority },
              { key: 'av', header: 'Today M / N', cell: (r) => <span className="flex gap-1"><StatusBadge status={r.todayMorning} size="xs" /><StatusBadge status={r.todayNight} size="xs" /></span> },
              { key: 'asg', header: 'Current assignment', cell: (r) => r.currentAssignmentId ? <IdText>{r.currentAssignmentId}</IdText> : <span className="text-ink-subtle">—</span> },
              { key: 'plat', header: 'Platform', cell: (r) => r.currentPlatform ?? '—' },
              { key: 'wl', header: 'Workload', cell: (r) => <span className={cn('tabular', r.workloadUsed >= r.workloadLimit && 'font-semibold text-danger-600')}>{r.workloadUsed} / {r.workloadLimit} shifts</span> },
              { key: 'compat', header: 'Cleared for', cell: (r) => <span className="text-xs text-ink-muted">{r.compatibleCategories.join(' · ')}</span> },
              { key: 'acct', header: 'Account', cell: (r) => <StatusBadge status={r.status} size="xs" /> }]
              } />
            
                <Pagination page={page} pageSize={25} total={d.total} onPage={setPage} />
              </>
          }
          </QueryView>
        </Card>
      }
    </div>);

}