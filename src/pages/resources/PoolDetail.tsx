import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MonitorXIcon, UserPlusIcon } from 'lucide-react';
import { LaptopTable } from '../../components/resources/LaptopTable';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { CapacityMeter } from '../../components/ui/CapacityMeter';
import { DataTable } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Input, Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingBlock } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Tabs } from '../../components/ui/Tabs';
import { IdText } from '../../components/ui/Tags';
import { ApiError, api, errorMessage } from '../../services/api';
import { fmtDateTime } from '../../utils/format';

type Tab = 'laptops' | 'handovers' | 'incidents';

export function PoolDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('laptops');
  const [assignOpen, setAssignOpen] = useState(false);
  const [asset, setAsset] = useState('');
  const [userId, setUserId] = useState('');
  const q = useQuery({ queryKey: ['pool', id], queryFn: () => api.getPool(id) });
  const assign = useMutation({
    mutationFn: () => api.assignLaptop(asset, userId.trim().toUpperCase()),
    onSuccess: (l) => {toast.success(`${l.assetId} assigned to ${l.currentUserId}`);setAssignOpen(false);qc.invalidateQueries();}
  });

  if (q.isPending) return <LoadingBlock rows={8} />;
  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const { pool: p, laptops, handovers, incidents } = q.data;
  const err = assign.error instanceof ApiError ? assign.error : null;
  const active = laptops.filter((l) => l.status !== 'RETIRED');

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Workstation pools', to: '/pools' }, { label: `${p.platformCode} / ${p.dept}` }]}
        title={`${p.platformCode} / ${p.dept}`}
        description={`${p.id} · Capacity ${p.capacity} · shared by Morning and Night shifts`}
        actions={<Button size="sm" icon={<UserPlusIcon className="h-3.5 w-3.5" />} onClick={() => {setAssignOpen(true);setAsset(active[0]?.assetId ?? '');assign.reset();}}>Assign laptop</Button>} />
      
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4 lg:col-span-2"><CapacityMeter label="Occupied now" used={p.occupied} capacity={p.capacity} size="md" pending={p.handoverPending} /></Card>
        {[
        ['Available', p.available, 'text-success-600'],
        ['Handover pending', p.handoverPending, 'text-warning-600'],
        ['Incidents', p.incidents, 'text-danger-600']].
        map(([l, v, c]) =>
        <Card key={l as string} className="p-4"><p className="text-xs text-ink-muted">{l}</p><p className={`mt-1 text-2xl font-semibold tabular ${c}`}>{v}</p></Card>
        )}
      </div>
      <Card>
        <Tabs className="px-4" value={tab} onChange={setTab} tabs={[{ id: 'laptops', label: 'Workstations', count: laptops.length }, { id: 'handovers', label: 'Handover history', count: handovers.length }, { id: 'incidents', label: 'Incident history', count: incidents.length }]} />
        {tab === 'laptops' && <LaptopTable rows={laptops} showPool={false} />}
        {tab === 'handovers' && (handovers.length ?
        <DataTable rows={handovers} rowKey={(h) => h.id} columns={[
        { key: 'at', header: 'Scheduled', cell: (h) => fmtDateTime(h.scheduledAt) },
        { key: 'ws', header: 'Workstation', cell: (h) => <IdText>{h.workstationId}</IdText> },
        { key: 'out', header: 'Outgoing', cell: (h) => <span><IdText>{h.outgoingId}</IdText> <span className="text-xs text-ink-subtle">{h.outgoingShift.toLowerCase()}</span></span> },
        { key: 'in', header: 'Incoming', cell: (h) => <span><IdText>{h.incomingId}</IdText> <span className="text-xs text-ink-subtle">{h.incomingShift.toLowerCase()}</span></span> },
        { key: 'st', header: 'Status', cell: (h) => <StatusBadge status={h.status} size="xs" /> },
        { key: 'cond', header: 'Condition', cell: (h) => h.checklist ? <StatusBadge status={h.checklist.laptopCondition} size="xs" /> : '—' }]
        } /> :
        <EmptyState title="No handovers recorded" />)}
        {tab === 'incidents' && (incidents.length ?
        <DataTable rows={incidents} rowKey={(i) => i.id} columns={[
        { key: 'id', header: 'Incident', cell: (i) => <IdText>{i.id}</IdText> },
        { key: 'asset', header: 'Laptop', cell: (i) => <IdText>{i.assetId}</IdText> },
        { key: 't', header: 'Title', cell: (i) => i.title },
        { key: 'sev', header: 'Severity', cell: (i) => <StatusBadge status={i.severity} size="xs" /> },
        { key: 'st', header: 'Status', cell: (i) => <StatusBadge status={i.status} size="xs" /> }]
        } /> :
        <EmptyState title="No incidents in this pool" />)}
      </Card>

      <Dialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign laptop for current shift"
        description="Resource assignment: laptop + platform + department + shift + employee. The backend validates availability and pool membership."
        footer={<><Button variant="ghost" size="sm" onClick={() => setAssignOpen(false)}>Cancel</Button><Button size="sm" loading={assign.isPending} disabled={!asset || !userId} onClick={() => assign.mutate()}>Assign</Button></>}>
        
        <div className="space-y-4">
          <Field label="Laptop" htmlFor="asset">
            <Select id="asset" value={asset} onChange={(e) => {setAsset(e.target.value);assign.reset();}} options={active.map((l) => ({ value: l.assetId, label: `${l.workstationId} · ${l.assetId} · ${l.status.replace('_', ' ').toLowerCase()}` }))} />
          </Field>
          <Field label="Employee or freelancer ID" htmlFor="uid" hint={`Must be working on ${p.platformCode} / ${p.dept} this shift.`}>
            <Input id="uid" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="e.g. EMP-00123" />
          </Field>
          {err?.code === 'WORKSTATION_UNAVAILABLE' && err.details ?
          <div role="alert" className="rounded-xl border border-danger-100 bg-danger-50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-danger-600"><MonitorXIcon className="h-4 w-4" /> WORKSTATION UNAVAILABLE</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {[
              ['Laptop', err.details.laptop],
              ['Current platform', err.details.platform],
              ['Department', err.details.dept],
              ['Current shift', err.details.currentShift],
              ['Current user', err.details.currentUser],
              ['Next scheduled user', err.details.nextUser],
              ['Handover', err.details.handover]].
              map(([l, v]) =>
              <React.Fragment key={l as string}><dt className="text-ink-muted">{l}</dt><dd className="font-mono font-medium">{v}</dd></React.Fragment>
              )}
              </dl>
            </div> :
          assign.isError ?
          <p role="alert" className="rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger-600">{errorMessage(assign.error)}</p> :
          null}
        </div>
      </Dialog>
      <p className="mt-3 text-xs text-ink-subtle"><Link to={`/platforms/${p.platformCode}`} className="hover:text-primary">View platform {p.platformCode}</Link></p>
    </div>);

}