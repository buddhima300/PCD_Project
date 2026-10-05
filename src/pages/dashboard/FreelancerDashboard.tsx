import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRightIcon, CalendarCheckIcon, ClipboardListIcon, MoonIcon, SunIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { CapacityMeter } from '../../components/ui/CapacityMeter';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DeptTag, IdText, ShiftTag } from '../../components/ui/Tags';
import { api } from '../../services/api';
import { deptNames, fmtDate, fmtShiftWindow, fmtTime, relative } from '../../utils/format';

export function FreelancerDashboard() {
  const q = useQuery({ queryKey: ['my-work'], queryFn: () => api.getMyWork() });
  const notif = useQuery({ queryKey: ['notifications', 'summary'], queryFn: () => api.listNotifications({}) });
  if (q.isPending) return <Skeleton className="h-96" />;
  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const w = q.data;
  const cur = w.currentAssignment;
  const today = w.availability[0];
  const incoming = w.handovers.find((h) => h.direction === 'INCOMING' && h.handover.status !== 'COMPLETED');

  return (
    <div>
      <PageHeader
        title={`Good evening, ${w.person.name.split(' ')[0]}`}
        description={`${w.person.id} · ${deptNames[w.person.dept]} freelancer · Priority ${w.person.priority} in ${w.person.dept}`} />
      
      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Current assignment</h2>
              {cur && <StatusBadge status={cur.type} />}
            </div>
            {!cur ?
            <EmptyState icon={ClipboardListIcon} title="You have no upcoming replacement assignments" description="Keep your availability up to date — assignments are made automatically by department priority." action={<Link to="/my/availability"><Button size="sm">Update availability</Button></Link>} /> :

            <>
                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
                  <div>
                    <dt className="text-xs text-ink-muted">Platform</dt>
                    <dd className="mt-0.5 text-2xl font-semibold">{cur.platformCode}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted">Department</dt>
                    <dd className="mt-0.5 text-2xl font-semibold">{cur.dept}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted">Replacing</dt>
                    <dd className="mt-1 font-mono text-sm font-semibold">{cur.absentEmployeeId}</dd>
                    <dd className="text-xs text-ink-subtle">{cur.absentEmployeeName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted">Workstation</dt>
                    <dd className="mt-1 font-mono text-sm font-semibold">{cur.workstationId ?? '—'}</dd>
                    <dd className="text-xs text-ink-subtle">{w.workstation?.assetId}</dd>
                  </div>
                </dl>
                <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-primary-50 p-4">
                  <ShiftTag shift={cur.shift} />
                  <span className="text-[15px] font-semibold">{fmtShiftWindow(cur.shiftStart, cur.shiftEnd)}</span>
                  <StatusBadge status={cur.status} className="ml-auto" />
                </div>
                {incoming &&
              <div className="mt-3 flex flex-col gap-3 rounded-xl border border-warning-100 bg-warning-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <ArrowLeftRightIcon className="mt-0.5 h-5 w-5 text-warning-600" />
                      <div>
                        <p className="text-sm font-semibold">Receive {incoming.handover.workstationId} at {fmtTime(incoming.handover.scheduledAt)}</p>
                        <p className="text-xs text-ink-muted">From {incoming.handover.outgoingName} · {incoming.handover.status.replace('_', ' ').toLowerCase()}</p>
                      </div>
                    </div>
                    <Link to="/handover"><Button size="sm">Open handover</Button></Link>
                  </div>
              }
              </>
            }
          </div>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader title="Current workload" description="Maximum 2 shifts in any rolling 24 hours" />
          <div className="p-5 pt-3">
            <p className="text-3xl font-semibold tabular">
              {w.workloadUsed} <span className="text-base font-medium text-ink-muted">/ {w.workloadLimit} shifts</span>
            </p>
            <div className="mt-2"><CapacityMeter used={w.workloadUsed} capacity={w.workloadLimit} showText={false} /></div>
            {w.workloadUsed >= w.workloadLimit && <p className="mt-2 text-xs font-semibold text-danger-600">Workload limit reached — no further assignments in this window.</p>}
            <div className="mt-5 border-t border-line pt-4">
              <p className="text-xs font-semibold">Today’s availability</p>
              {today &&
              <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-canvas p-2.5">
                    <p className="flex items-center gap-1 text-[11px] text-ink-muted"><SunIcon className="h-3 w-3" /> Morning</p>
                    <StatusBadge status={today.MORNING} size="xs" className="mt-1" />
                  </div>
                  <div className="rounded-lg bg-canvas p-2.5">
                    <p className="flex items-center gap-1 text-[11px] text-ink-muted"><MoonIcon className="h-3 w-3" /> Night</p>
                    <StatusBadge status={today.NIGHT} size="xs" className="mt-1" />
                  </div>
                </div>
              }
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader title="Upcoming assignments" action={<Link to="/my/assignments" className="text-xs font-medium text-primary hover:underline">All assignments</Link>} />
          {w.assignments.length === 0 ?
          <EmptyState title="No upcoming assignments" /> :

          <ul className="mt-2 divide-y divide-line">
              {w.assignments.map((r) =>
            <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                      {r.platformCode} <DeptTag dept={r.dept} /> <ShiftTag shift={r.shift} />
                    </p>
                    <p className="text-xs text-ink-muted">
                      {fmtDate(r.date, 'EEE, MMM d')} · replacing <IdText>{r.absentEmployeeId}</IdText>
                    </p>
                  </div>
                  <StatusBadge status={r.status} size="xs" />
                </li>
            )}
            </ul>
          }
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader title="Next 7 days availability" icon={<CalendarCheckIcon className="mt-0.5 h-4 w-4 text-success" />} action={<Link to="/my/availability" className="text-xs font-medium text-primary hover:underline">Manage</Link>} />
          <ul className="mt-2 divide-y divide-line">
            {w.availability.map((a) =>
            <li key={a.date} className="grid grid-cols-[72px_1fr_1fr] items-center gap-2 px-5 py-2 text-[13px]">
                <span className="text-ink-muted">{fmtDate(a.date, 'EEE d')}</span>
                <StatusBadge status={a.MORNING} size="xs" />
                <StatusBadge status={a.NIGHT} size="xs" />
              </li>
            )}
          </ul>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader title="Notifications" />
          <ul className="mt-2 divide-y divide-line">
            {(notif.data?.items ?? []).slice(0, 5).map((n) =>
            <li key={n.id} className="flex gap-2.5 px-5 py-2.5">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-line-strong' : 'bg-primary'}`} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{n.title}</p>
                  <p className="text-[11px] text-ink-subtle">{relative(n.createdAt)}</p>
                </div>
              </li>
            )}
          </ul>
        </Card>
      </div>
    </div>);

}