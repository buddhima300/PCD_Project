import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Input, Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { ScopeFilters, type Scope } from '../../components/ui/ScopeFilters';
import { EmptyState, QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DeptTag, IdText, ShiftTag } from '../../components/ui/Tags';
import { useSessionStore } from '../../hooks/useSessionStore';
import { api } from '../../services/api';
import type { HandoverStatus } from '../../types/domain';
import { businessDate, businessDateTime, handoverInstant } from '../../utils/shiftTime';
import { MyWorkstation } from './MyWorkstation';

export function Handover() {
  const role = useSessionStore(s => s.user?.role);
  return role === 'SUPERVISOR' ? <OpsHandovers /> : <MyWorkstation />;
}

function OpsHandovers() {
  const [scope, setScope] = useState<Scope>({ category: '', platform: '', dept: '' });
  const [status, setStatus] = useState<HandoverStatus | ''>('');
  const [date, setDate] = useState(() => businessDate());
  const q = useQuery({ queryKey: ['handovers', scope, status, date], queryFn: () => api.listHandovers({ date, platform: scope.platform, dept: scope.dept, status }), refetchInterval: 30000 });
  return <div><PageHeader title="Laptop handovers" description="Planned and completed transfers between outgoing and incoming workers. Attendance records are available in Shift overview." />
    <Card><div className="flex flex-wrap gap-2 border-b border-line p-3"><ScopeFilters value={scope} onChange={setScope} show={['category', 'platform', 'dept']} /><Input type="date" aria-label="Date" value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }} className="h-9 w-40" /><Select compact className="w-44" aria-label="Status" value={status} onChange={e => setStatus(e.target.value as HandoverStatus)} placeholder="Any status" options={['PENDING', 'OUTGOING_CONFIRMED', 'RECEIVED', 'ISSUE_REPORTED', 'COMPLETED'].map(s => ({ value: s, label: s.split('_').join(' ').toLowerCase() }))} /></div>
      <QueryView query={q} isEmpty={d => d.length === 0} empty={<EmptyState title="No handovers for these filters" />}>{rows => <DataTable rows={rows} rowKey={h => h.id} columns={[
        { key: 'at', header: 'Scheduled', cell: h => businessDateTime(handoverInstant(h.scheduledAt)) },
        { key: 'pool', header: 'Pool', cell: h => <span className="flex items-center gap-1.5">{h.platformCode} <DeptTag dept={h.dept} /></span> },
        { key: 'ws', header: 'Laptop', cell: h => <IdText>{h.assetId}</IdText> },
        { key: 'out', header: 'Outgoing', cell: h => <span>{h.outgoingName} <ShiftTag shift={h.outgoingShift} /></span> },
        { key: 'in', header: 'Incoming', cell: h => <span>{h.incomingName} <ShiftTag shift={h.incomingShift} /></span> },
        { key: 'st', header: 'Status', cell: h => <StatusBadge status={h.status} size="xs" /> },
        { key: 'inc', header: 'Incident', cell: h => h.incidentId ? <IdText className="text-danger-600">{h.incidentId}</IdText> : '—' }
      ]} />}</QueryView>
    </Card>
  </div>;
}
