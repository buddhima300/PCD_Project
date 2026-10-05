import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Select, Textarea } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { ScopeFilters, type Scope } from '../../components/ui/ScopeFilters';
import { SearchInput } from '../../components/ui/SearchInput';
import { EmptyState, QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DeptTag, IdText } from '../../components/ui/Tags';
import { useSessionStore } from '../../hooks/useSessionStore';
import { api, errorMessage } from '../../services/api';
import type { Incident, IncidentStatus, Severity } from '../../types/domain';
import { fmtDateTime } from '../../utils/format';

export function Incidents() {
  const role = useSessionStore((s) => s.user?.role);
  const isOps = role === 'ADMIN' || role === 'MANAGER';
  const qc = useQueryClient();
  const [scope, setScope] = useState<Scope>({ category: '', platform: '', dept: '' });
  const [status, setStatus] = useState<IncidentStatus | ''>('');
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState<Incident | null>(null);
  const [next, setNext] = useState<IncidentStatus>('IN_PROGRESS');
  const [note, setNote] = useState('');
  const q = useQuery({ queryKey: ['incidents', scope, status, severity, search], queryFn: () => api.listIncidents({ ...scope, status, severity, search }) });
  const update = useMutation({
    mutationFn: () => api.updateIncidentStatus(sel!.id, next, note),
    onSuccess: (i) => {toast.success(`${i.id} marked ${i.status.replace('_', ' ').toLowerCase()}`);setSel(null);qc.invalidateQueries();}
  });

  return (
    <div>
      <PageHeader title="Laptop incidents" description="Incidents raised from handovers or reported directly. High and critical incidents block the laptop from use." actions={<Link to="/report-issue"><Button size="sm">Report issue</Button></Link>} />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Incident, laptop, title" className="w-56" />
          {isOps && <ScopeFilters value={scope} onChange={setScope} show={['category', 'platform', 'dept']} />}
          <Select compact className="w-36" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as IncidentStatus)} placeholder="Any status" options={[{ value: 'OPEN', label: 'Open' }, { value: 'IN_PROGRESS', label: 'In progress' }, { value: 'RESOLVED', label: 'Resolved' }]} />
          <Select compact className="w-36" aria-label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} placeholder="Any severity" options={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))} />
        </div>
        <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No incidents match these filters" />}>
          {(rows) =>
          <DataTable rows={rows} rowKey={(i) => i.id} onRowClick={(i) => {setSel(i);setNext(i.status === 'OPEN' ? 'IN_PROGRESS' : 'RESOLVED');setNote('');update.reset();}} columns={[
          { key: 'id', header: 'Incident', cell: (i) => <IdText>{i.id}</IdText> },
          { key: 'asset', header: 'Laptop', cell: (i) => <IdText>{i.assetId}</IdText> },
          { key: 'pool', header: 'Pool', cell: (i) => <span className="flex items-center gap-1.5">{i.platformCode} <DeptTag dept={i.dept} /></span> },
          { key: 't', header: 'Title', cell: (i) => <span className="block max-w-xs truncate">{i.title}</span> },
          { key: 'sev', header: 'Severity', cell: (i) => <StatusBadge status={i.severity} size="xs" /> },
          { key: 'st', header: 'Status', cell: (i) => <StatusBadge status={i.status} size="xs" /> },
          { key: 'by', header: 'Reported by', cell: (i) => <IdText>{i.reportedById}</IdText> },
          { key: 'at', header: 'Created', cell: (i) => <span className="text-xs text-ink-muted">{fmtDateTime(i.createdAt)}</span> }]
          } />
          }
        </QueryView>
      </Card>
      <Dialog
        open={!!sel}
        onClose={() => setSel(null)}
        title={sel ? `${sel.id} · ${sel.assetId}` : ''}
        description={sel ? `${sel.platformCode} / ${sel.dept} · ${sel.category}` : ''}
        footer={isOps && sel && sel.status !== 'RESOLVED' ? <><Button variant="ghost" size="sm" onClick={() => setSel(null)}>Close</Button><Button size="sm" loading={update.isPending} onClick={() => update.mutate()}>Update status</Button></> : undefined}>
        
        {sel &&
        <div className="space-y-3 text-sm">
            <p className="font-medium">{sel.title}</p>
            <p className="text-ink-muted">{sel.description}</p>
            <div className="flex gap-2"><StatusBadge status={sel.severity} /><StatusBadge status={sel.status} /></div>
            <p className="text-xs text-ink-subtle">Reported by {sel.reportedByName} · {fmtDateTime(sel.createdAt)}{sel.handoverId ? ` · from handover ${sel.handoverId}` : ''}</p>
            {isOps && sel.status !== 'RESOLVED' &&
          <>
                <Field label="New status" htmlFor="ns"><Select id="ns" value={next} onChange={(e) => setNext(e.target.value as IncidentStatus)} options={[{ value: 'IN_PROGRESS', label: 'In progress' }, { value: 'RESOLVED', label: 'Resolved' }]} /></Field>
                <Field label="Note" htmlFor="nn"><Textarea id="nn" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              </>
          }
            {update.isError && <p role="alert" className="rounded-xl bg-danger-50 px-3 py-2 text-danger-600">{errorMessage(update.error)}</p>}
          </div>
        }
      </Dialog>
    </div>);

}