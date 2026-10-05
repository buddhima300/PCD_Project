import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { GaugeIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { ScopeFilters, type Scope } from '../../components/ui/ScopeFilters';
import { SearchInput } from '../../components/ui/SearchInput';
import { QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DeptTag } from '../../components/ui/Tags';
import { api, type PlatformQuery } from '../../services/api';

export function Platforms() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope>({ category: '', dept: '' });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<PlatformQuery['sort']>('code');
  const query: PlatformQuery = { category: scope.category, dept: scope.dept, search, status, sort };
  const q = useQuery({ queryKey: ['platforms', query], queryFn: () => api.listPlatforms(query) });

  return (
    <div>
      <PageHeader
        title="Platforms"
        description="Each platform runs its own department mix with its own workstation count."
        actions={<Link to="/capacity"><Button variant="secondary" size="sm" icon={<GaugeIcon className="h-3.5 w-3.5" />}>Capacity matrix</Button></Link>} />
      
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search platform code or ID" className="w-60" />
          <ScopeFilters value={scope} onChange={setScope} show={['category', 'dept']} />
          <Select compact className="w-32" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Any status" options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]} />
          <Select compact className="w-44" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as PlatformQuery['sort'])} options={[{ value: 'code', label: 'Sort: category & code' }, { value: 'workstations', label: 'Sort: most workstations' }, { value: 'available', label: 'Sort: most available' }, { value: 'incidents', label: 'Sort: most incidents' }]} />
        </div>
        <QueryView query={q} isEmpty={(d) => d.length === 0}>
          {(rows) =>
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            caption="Platforms"
            onRowClick={(r) => navigate(`/platforms/${r.code}`)}
            columns={[
            { key: 'code', header: 'Platform', cell: (r) => <span className="font-semibold">{r.code}</span> },
            { key: 'id', header: 'Platform ID', cell: (r) => <span className="font-mono text-xs text-ink-muted">{r.id}</span> },
            { key: 'cat', header: 'Category', cell: (r) => r.categoryCode },
            { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.opStatus} size="xs" /> },
            {
              key: 'depts',
              header: 'Departments · seats',
              cell: (r) =>
              <span className="flex gap-1">
                      {r.occupancy.map((o) =>
                <span key={o.dept} className="inline-flex items-center gap-1">
                          <DeptTag dept={o.dept} />
                          <span className="tabular text-xs text-ink-muted">{o.capacity}</span>
                        </span>
                )}
                    </span>

            },
            { key: 'ws', header: 'Workstations', align: 'right', cell: (r) => r.totalWorkstations },
            { key: 'cur', header: 'Current', align: 'right', cell: (r) => r.currentWorkforce },
            { key: 'm', header: 'Morning', align: 'right', cell: (r) => r.morningWorkforce },
            { key: 'n', header: 'Night', align: 'right', cell: (r) => r.nightWorkforce },
            { key: 'av', header: 'Available', align: 'right', cell: (r) => r.availableWorkstations },
            { key: 'inc', header: 'Incidents', align: 'right', cell: (r) => r.activeIncidents ? <span className="font-semibold text-danger-600">{r.activeIncidents}</span> : 0 }]
            } />

          }
        </QueryView>
      </Card>
    </div>);

}