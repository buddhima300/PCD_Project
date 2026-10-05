import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { api } from '../../services/api';
import type { CategorySummary } from '../../types/domain';
import { fmtDate } from '../../utils/format';

export function PlatformCategories() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<{key: string;dir: 'asc' | 'desc';}>({ key: 'code', dir: 'asc' });
  const q = useQuery({ queryKey: ['categories'], queryFn: () => api.listCategories() });
  const rows = useMemo(() => {
    const list = (q.data ?? []).filter((c) => (!status || c.status === status) && (!search || `${c.code} ${c.name} ${c.description}`.toLowerCase().includes(search.toLowerCase())));
    const k = sort.key as keyof CategorySummary;
    return [...list].sort((a, b) => (typeof a[k] === 'number' ? (a[k] as number) - (b[k] as number) : String(a[k]).localeCompare(String(b[k]))) * (sort.dir === 'asc' ? 1 : -1));
  }, [q.data, search, status, sort]);

  return (
    <div>
      <PageHeader title="Platform categories" description="Top level of the platform hierarchy. Counts are provided by the operations API." />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search categories" className="w-64" />
          <Select compact className="w-36" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Any status" options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]} />
        </div>
        <QueryView query={q} isEmpty={() => rows.length === 0}>
          {() =>
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            sort={sort}
            onSort={(key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))}
            onRowClick={(r) => navigate(`/categories/${r.code}`)}
            columns={[
            { key: 'code', header: 'Code', sortable: true, cell: (r) => <span className="font-semibold">{r.code}</span> },
            { key: 'id', header: 'Category ID', cell: (r) => <span className="font-mono text-xs text-ink-muted">{r.id}</span> },
            { key: 'description', header: 'Description', cell: (r) => <span className="text-ink-muted">{r.description}</span> },
            { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
            { key: 'platformCount', header: 'Platforms', sortable: true, align: 'right', cell: (r) => `${r.activePlatforms} / ${r.platformCount}` },
            { key: 'totalWorkstations', header: 'Workstations', sortable: true, align: 'right', cell: (r) => r.totalWorkstations },
            { key: 'assignedWorkforce', header: 'Workforce', sortable: true, align: 'right', cell: (r) => r.assignedWorkforce },
            { key: 'activeIncidents', header: 'Open incidents', sortable: true, align: 'right', cell: (r) => r.activeIncidents },
            { key: 'createdAt', header: 'Created', sortable: true, cell: (r) => fmtDate(r.createdAt) },
            { key: 'updatedAt', header: 'Updated', sortable: true, cell: (r) => fmtDate(r.updatedAt) }]
            } />

          }
        </QueryView>
      </Card>
    </div>);

}