import React, { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Checkbox, Input, Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { ScopeFilters, type Scope } from '../../components/ui/ScopeFilters';
import { SearchInput } from '../../components/ui/SearchInput';
import { QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { IdText } from '../../components/ui/Tags';
import { api } from '../../services/api';
import { fmtDateTime } from '../../utils/format';

export function AuditLog() {
  const [scope, setScope] = useState<Scope>({ category: '', platform: '', dept: '' });
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [overridesOnly, setOverridesOnly] = useState(false);
  const [page, setPage] = useState(1);
  const query = { actor, platform: scope.platform, dept: scope.dept, action, entity, from, to, overridesOnly, page, pageSize: 25 };
  const q = useQuery({ queryKey: ['audit', query], queryFn: () => api.listAudit(query), placeholderData: keepPreviousData });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {fn(v);setPage(1);};

  return (
    <div>
      <PageHeader title="Audit log" description="Immutable record of operational changes. Manager overrides are highlighted." />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={actor} onChange={reset(setActor)} placeholder="Actor" className="w-44" />
          <ScopeFilters value={scope} onChange={reset(setScope)} show={['category', 'platform', 'dept']} />
          <Select compact className="w-52" aria-label="Action" value={action} onChange={(e) => reset(setAction)(e.target.value)} placeholder="Any action" options={(q.data?.actions ?? []).map((a) => ({ value: a, label: a }))} />
          <Select compact className="w-40" aria-label="Entity" value={entity} onChange={(e) => reset(setEntity)(e.target.value)} placeholder="Any entity" options={(q.data?.entities ?? []).map((a) => ({ value: a, label: a }))} />
          <Input type="date" aria-label="From" value={from} onChange={(e) => reset(setFrom)(e.target.value)} className="h-9 w-40" />
          <Input type="date" aria-label="To" value={to} onChange={(e) => reset(setTo)(e.target.value)} className="h-9 w-40" />
          <Checkbox id="ovr" label="Overrides only" checked={overridesOnly} onChange={reset(setOverridesOnly)} />
        </div>
        <QueryView query={q} isEmpty={(d) => d.items.length === 0}>
          {(d) =>
          <>
              <DataTable rows={d.items} rowKey={(r) => r.id} rowClassName={(r) => r.isOverride ? 'bg-violet-50/50' : ''} columns={[
            { key: 'at', header: 'Timestamp', cell: (r) => <span className="text-xs">{fmtDateTime(r.at)}</span> },
            { key: 'actor', header: 'Actor', cell: (r) => r.actorName },
            { key: 'role', header: 'Role', cell: (r) => <span className="text-xs text-ink-muted">{r.role}</span> },
            { key: 'action', header: 'Action', cell: (r) => <span className="flex items-center gap-1.5"><span className="font-mono text-[11px]">{r.action}</span>{r.isOverride && <StatusBadge status="OVERRIDE_APPROVED" label="Override" size="xs" />}</span> },
            { key: 'entity', header: 'Entity', cell: (r) => r.entity },
            { key: 'eid', header: 'Entity ID', cell: (r) => <IdText>{r.entityId}</IdText> },
            { key: 'p', header: 'Platform', cell: (r) => r.platformCode ?? '—' },
            { key: 'd', header: 'Dept', cell: (r) => r.dept ?? '—' },
            { key: 'prev', header: 'Previous', cell: (r) => <span className="block max-w-[160px] truncate text-ink-muted">{r.previous}</span> },
            { key: 'next', header: 'New', cell: (r) => <span className="block max-w-[160px] truncate font-medium">{r.next}</span> },
            { key: 'reason', header: 'Reason', cell: (r) => <span className="block max-w-[200px] truncate text-xs text-ink-muted">{r.reason}</span> }]
            } />
              <Pagination page={page} pageSize={25} total={d.total} onPage={setPage} />
            </>
          }
        </QueryView>
      </Card>
    </div>);

}