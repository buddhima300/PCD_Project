import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MailIcon, PhoneIcon } from 'lucide-react';
import { AvailabilityCalendar } from '../../components/freelancer/AvailabilityCalendar';
import { Card, CardHeader } from '../../components/ui/Card';
import { CapacityMeter } from '../../components/ui/CapacityMeter';
import { DataTable } from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingBlock } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DeptTag, IdText, ShiftTag } from '../../components/ui/Tags';
import { api } from '../../services/api';
import { TODAY } from '../../utils/clock';
import { deptNames, fmtDate, fmtShiftWindow } from '../../utils/format';

export function FreelancerDetail() {
  const { id = '' } = useParams();
  const [month, setMonth] = useState(TODAY.slice(0, 7));
  const q = useQuery({ queryKey: ['freelancer', id, month], queryFn: () => api.getFreelancer(id, month) });
  if (q.isPending) return <LoadingBlock rows={8} />;
  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const { freelancer: f, availability, assignments } = q.data;

  return (
    <div>
      <PageHeader breadcrumbs={[{ label: 'Freelancers', to: '/freelancers' }, { label: f.id }]} title={f.name} meta={<StatusBadge status={f.status} />} description={`${f.id} · ${deptNames[f.dept]} · Priority ${f.priority}`} />
      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-ink-muted">Department</dt><dd><DeptTag dept={f.dept} full /></dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Priority</dt><dd className="font-semibold">#{f.priority}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Cleared for</dt><dd>{f.compatibleCategories.join(' · ')}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Current assignment</dt><dd>{f.currentAssignmentId ? <Link to={`/replacements/${f.currentAssignmentId}`} className="font-mono text-xs hover:text-primary">{f.currentAssignmentId}</Link> : '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Current platform</dt><dd>{f.currentPlatform ?? '—'}</dd></div>
            </dl>
            <div className="mt-4 border-t border-line pt-4">
              <CapacityMeter label="Workload · rolling 24h" used={f.workloadUsed} capacity={f.workloadLimit} suffix="shifts" size="md" />
              {f.workloadUsed >= f.workloadLimit && <p className="mt-2 text-xs font-semibold text-danger-600">WORKLOAD LIMIT REACHED</p>}
            </div>
            <div className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm text-ink-muted">
              <p className="flex items-center gap-2"><MailIcon className="h-3.5 w-3.5" /> {f.email}</p>
              <p className="flex items-center gap-2"><PhoneIcon className="h-3.5 w-3.5" /> {f.phone}</p>
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Availability calendar" description="Availability is separate from assignments — assigned shifts are set by the replacement engine." />
            <div className="p-5 pt-3">
              <AvailabilityCalendar month={month} onMonth={setMonth} days={availability} freelancerId={f.id} editable={false} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Assignment & replacement history" />
            {assignments.length === 0 ? <EmptyState title="No assignments yet" /> :
            <div className="mt-3">
                <DataTable rows={assignments} rowKey={(r) => r.id} columns={[
              { key: 'id', header: 'Replacement', cell: (r) => <Link to={`/replacements/${r.id}`} className="font-mono text-xs hover:text-primary">{r.id}</Link> },
              { key: 'when', header: 'Shift', cell: (r) => <span className="flex items-center gap-1.5"><ShiftTag shift={r.shift} />{fmtShiftWindow(r.shiftStart, r.shiftEnd)}</span> },
              { key: 'plat', header: 'Platform', cell: (r) => <span className="flex items-center gap-1.5">{r.platformCode} <DeptTag dept={r.dept} /></span> },
              { key: 'abs', header: 'Replacing', cell: (r) => <IdText>{r.absentEmployeeId}</IdText> },
              { key: 'type', header: 'Type', cell: (r) => <StatusBadge status={r.type} size="xs" /> },
              { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} size="xs" /> },
              { key: 'date', header: 'Date', cell: (r) => fmtDate(r.date, 'MMM d') }]
              } />
              </div>
            }
          </Card>
        </div>
      </div>
    </div>);

}