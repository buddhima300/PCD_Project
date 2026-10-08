import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LockIcon, MailIcon, PhoneIcon } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingBlock } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Tabs } from '../../components/ui/Tabs';
import { DeptTag, IdText, ShiftTag } from '../../components/ui/Tags';
import { api } from '../../services/api';
import { deptNames, fmtDate, fmtDateTime } from '../../utils/format';

type Tab = 'schedule' | 'platform' | 'offdays' | 'replacements' | 'workstation' | 'audit';

export function EmployeeDetail() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<Tab>('schedule');
  const q = useQuery({ queryKey: ['employee', id], queryFn: () => api.getEmployee(id) });
  if (q.isPending) return <LoadingBlock rows={8} />;
  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const { employee: e, offDays, replacements, handovers, platformHistory, scheduleHistory, audit } = q.data;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Employees', to: '/employees' }, { label: e.id }]}
        title={e.name}
        meta={<><StatusBadge status={e.status} /><StatusBadge status={e.accountStatus} /></>}
        description={`${e.id} · ${e.position} · joined ${fmtDate(e.joinedAt)}`} />
      
      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <Card className="h-fit p-5">
          <h2 className="text-sm font-semibold">Operational assignment</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-ink-muted">Platform</dt><dd><Link to={`/platforms/${e.platformCode}`} className="font-semibold hover:text-primary">{e.platformCode}</Link></dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">Workforce position</dt><dd className="font-mono font-bold text-ink">{e.positionCode ?? `${e.dept}-0${(Number(e.id.slice(-2)) % 5) + 1}`}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">Lifecycle</dt><dd><StatusBadge status={e.lifecycle ?? 'PRODUCTION_ACTIVE'} size="xs" /></dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">Department</dt><dd className="flex items-center gap-1.5"><DeptTag dept={e.dept} />{deptNames[e.dept]} <LockIcon className="h-3 w-3 text-ink-subtle" aria-label="Not editable" /></dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">Current shift</dt><dd><ShiftTag shift={e.shift} /></dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">From Oct 01</dt><dd><ShiftTag shift={e.nextShift} /></dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">Workstation pool</dt><dd><Link to={`/pools/${e.poolId}`} className="font-mono text-xs hover:text-primary">{e.poolId}</Link></dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">Workstation</dt><dd className="text-right"><IdText>{e.currentWorkstationId ?? '—'}</IdText>{e.workstationState && <span className="block text-[11px] text-ink-subtle">{e.workstationState === 'IN_USE' ? 'in use this shift' : 'scheduled tonight'}</span>}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">Off-days (Sep)</dt><dd className="tabular font-semibold">{e.offDaysUsed} / {e.offDaysAllowance}</dd></div>
          </dl>
          <div className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm text-ink-muted">
            <p className="flex items-center gap-2"><MailIcon className="h-3.5 w-3.5" /> {e.email}</p>
            <p className="flex items-center gap-2"><PhoneIcon className="h-3.5 w-3.5" /> {e.phone}</p>
          </div>
          <p className="mt-4 rounded-lg bg-canvas p-2.5 text-[11px] text-ink-muted">Department is permanent and cannot be edited. Laptops are shift resources and are not owned by employees.</p>
        </Card>

        <Card>
          <Tabs
            className="px-4"
            value={tab}
            onChange={setTab}
            tabs={[
            { id: 'schedule', label: 'Schedule history' },
            { id: 'platform', label: 'Platform history' },
            { id: 'offdays', label: 'Off-days', count: offDays.length },
            { id: 'replacements', label: 'Replacements', count: replacements.length },
            { id: 'workstation', label: 'Workstation history', count: handovers.length },
            { id: 'audit', label: 'Audit', count: audit.length }]
            } />
          
          {tab === 'schedule' &&
          <DataTable rows={scheduleHistory} rowKey={(r) => r.cycle} columns={[
          { key: 'cycle', header: 'Cycle', cell: (r) => <span className="font-medium">{r.cycle}</span> },
          { key: 'range', header: 'Period', cell: (r) => `${fmtDate(r.start, 'MMM d, yyyy')} → ${fmtDate(r.end, 'MMM d, yyyy')}` },
          { key: 'shift', header: 'Shift', cell: (r) => <ShiftTag shift={r.shift} /> }]
          } />
          }
          {tab === 'platform' &&
          <DataTable rows={platformHistory} rowKey={(r) => r.from} columns={[
          { key: 'p', header: 'Platform', cell: (r) => <span className="font-semibold">{r.platformCode}</span> },
          { key: 'from', header: 'From', cell: (r) => fmtDate(r.from) },
          { key: 'to', header: 'To', cell: (r) => r.to ? fmtDate(r.to) : <StatusBadge status="CURRENT" size="xs" /> },
          { key: 'reason', header: 'Reason', cell: (r) => <span className="text-ink-muted">{r.reason}</span> }]
          } />
          }
          {tab === 'offdays' && (offDays.length ?
          <DataTable rows={offDays} rowKey={(r) => r.id} columns={[
          { key: 'date', header: 'Date', cell: (r) => fmtDate(r.date, 'EEE, MMM d') },
          { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} size="xs" /> },
          { key: 'created', header: 'Requested', cell: (r) => fmtDateTime(r.createdAt) },
          { key: 'reason', header: 'Detail', cell: (r) => <span className="max-w-md truncate text-xs text-ink-muted">{r.override ? `Override by ${r.override.managerName}: ${r.override.reason}` : r.reason ?? 'Auto-processed'}</span> }]
          } /> :
          <EmptyState title="No off-day requests" />)}
          {tab === 'replacements' && (replacements.length ?
          <DataTable rows={replacements} rowKey={(r) => r.id} columns={[
          { key: 'id', header: 'Replacement', cell: (r) => <Link to={`/replacements/${r.id}`} className="font-mono text-xs hover:text-primary">{r.id}</Link> },
          { key: 'date', header: 'Date', cell: (r) => fmtDate(r.date, 'MMM d') },
          { key: 'type', header: 'Type', cell: (r) => <StatusBadge status={r.type} size="xs" /> },
          { key: 'fl', header: 'Freelancer', cell: (r) => <IdText>{r.freelancerId ?? '—'}</IdText> },
          { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} size="xs" /> }]
          } /> :
          <EmptyState title="No replacements for this employee" />)}
          {tab === 'workstation' && (handovers.length ?
          <DataTable rows={handovers} rowKey={(r) => r.id} columns={[
          { key: 'at', header: 'Scheduled', cell: (r) => fmtDateTime(r.scheduledAt) },
          { key: 'ws', header: 'Workstation', cell: (r) => <IdText>{r.workstationId}</IdText> },
          { key: 'asset', header: 'Laptop', cell: (r) => <Link to={`/laptops/${r.assetId}`} className="font-mono text-xs hover:text-primary">{r.assetId}</Link> },
          { key: 'dir', header: 'Direction', cell: (r) => r.incomingId === e.id ? 'Received from ' + r.outgoingId : 'Handed to ' + r.incomingId },
          { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} size="xs" /> }]
          } /> :
          <EmptyState title="No workstation history" />)}
          {tab === 'audit' && (audit.length ?
          <DataTable rows={audit} rowKey={(r) => r.id} columns={[
          { key: 'at', header: 'Timestamp', cell: (r) => fmtDateTime(r.at) },
          { key: 'action', header: 'Action', cell: (r) => <span className="font-mono text-[11px]">{r.action}</span> },
          { key: 'actor', header: 'Actor', cell: (r) => r.actorName },
          { key: 'next', header: 'Change', cell: (r) => `${r.previous} → ${r.next}` }]
          } /> :
          <EmptyState title="No audit events for this employee" />)}
        </Card>
      </div>
    </div>);

}