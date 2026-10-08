import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRightIcon, ArrowRightIcon, CalendarOffIcon, GraduationCapIcon, LaptopIcon, MoonIcon, RepeatIcon, SunIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { CapacityMeter } from '../../components/ui/CapacityMeter';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DeptTag, IdText, ShiftTag } from '../../components/ui/Tags';
import { api } from '../../services/api';
import { deptNames, fmtDate, fmtShiftWindow, fmtTime, relative } from '../../utils/format';

export function EmployeeDashboard() {
  const q = useQuery({ queryKey: ['my-work'], queryFn: () => api.getMyWork() });
  const notif = useQuery({ queryKey: ['notifications', 'summary'], queryFn: () => api.listNotifications({}) });
  if (q.isPending) return <Skeleton className="h-96" />;
  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const w = q.data;
  const incoming = w.handovers.find((h) => h.direction === 'INCOMING' && h.handover.status !== 'COMPLETED');
  const nextHo = incoming ?? w.handovers.find((h) => h.handover.status !== 'COMPLETED');
  const occ = w.platform?.occupancy.find((o) => o.dept === w.person.dept);

  return (
    <div>
      <PageHeader title={`Good evening, ${w.person.name.split(' ')[0]}`} description="Your platform, shift and workstation for today." />

      {/* On-Platform Training Notice */}
      <div className="mb-4 rounded-xl border border-primary-200 bg-primary-50/70 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary p-2 text-white">
            <GraduationCapIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-primary-950">
              Assigned Platform: {w.platform?.code} ({w.person.dept} — {deptNames[w.person.dept]})
            </h3>
            <p className="mt-1 text-xs text-primary-800">
              Platform Workforce Position: <strong>{w.person.dept}-04</strong> · Direct On-The-Job Placement.
            </p>
            <p className="mt-0.5 text-xs text-emerald-800 font-medium">
              &ldquo;New workers train on their assigned production platform for 5 working days and remain permanently assigned to that same platform upon passing evaluation.&rdquo;
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <div className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">My work</h2>
              {w.shift && <ShiftTag shift={w.shift} />}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
              <div>
                <dt className="text-xs text-ink-muted">Platform</dt>
                <dd className="mt-0.5 text-2xl font-semibold tracking-tight">{w.platform?.code}</dd>
                <dd className="text-xs text-ink-subtle">{w.platform?.categoryCode} category</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Department</dt>
                <dd className="mt-0.5 text-2xl font-semibold tracking-tight">{w.person.dept}</dd>
                <dd className="text-xs text-ink-subtle">{deptNames[w.person.dept]}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Workstation</dt>
                <dd className="mt-1 font-mono text-sm font-semibold">{w.workstation?.workstationId ?? '—'}</dd>
                <dd className="text-xs text-ink-subtle">{w.workstation?.assetId ?? 'Not allocated'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Next handover</dt>
                <dd className="mt-0.5 text-2xl font-semibold tracking-tight tabular">{nextHo ? fmtTime(nextHo.handover.scheduledAt) : '—'}</dd>
                <dd className="text-xs text-ink-subtle">{nextHo ? nextHo.direction === 'INCOMING' ? 'You receive' : 'You hand over' : 'None scheduled'}</dd>
              </div>
            </dl>
            <div className="mt-5 rounded-xl bg-primary-50 p-4">
              <p className="text-xs font-medium text-primary-700">Current shift</p>
              <p className="mt-0.5 text-[15px] font-semibold text-ink">{w.currentWindow ? fmtShiftWindow(w.currentWindow.start, w.currentWindow.end) : '—'}</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                Next shift: {w.nextWindow ? fmtShiftWindow(w.nextWindow.start, w.nextWindow.end) : '—'}
              </p>
            </div>
            {incoming &&
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-warning-100 bg-warning-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <ArrowLeftRightIcon className="mt-0.5 h-5 w-5 text-warning-600" />
                  <div>
                    <p className="text-sm font-semibold text-ink">Receive {incoming.handover.workstationId} before {fmtTime(incoming.handover.scheduledAt)}</p>
                    <p className="text-xs text-ink-muted">
                      {incoming.handover.outgoingName} ({incoming.handover.outgoingId}) · <StatusBadge status={incoming.handover.status} size="xs" />
                    </p>
                  </div>
                </div>
                <Link to="/handover">
                  <Button size="sm">Open handover</Button>
                </Link>
              </div>
            }
          </div>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader title="Off-days this month" description="4 per month · max 2 per platform department per day" icon={<CalendarOffIcon className="mt-0.5 h-4 w-4 text-violet" />} />
          <div className="p-5 pt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular">{w.offDaysRemaining}</span>
              <span className="text-sm text-ink-muted">remaining · {w.offDaysUsed} used</span>
            </div>
            <div className="mt-2">
              <CapacityMeter used={w.offDaysUsed} capacity={4} showText={false} label={undefined} />
            </div>
            <p className="mt-4 text-xs font-semibold text-ink">Upcoming off-days</p>
            {w.upcomingOffDays.length === 0 ?
            <p className="mt-1 text-sm text-ink-muted">No upcoming off-days.</p> :

            <ul className="mt-2 space-y-1.5">
                {w.upcomingOffDays.slice(0, 4).map((o) =>
              <li key={o.id} className="flex items-center justify-between text-[13px]">
                    <span>{fmtDate(o.date, 'EEE, MMM d')}</span>
                    <StatusBadge status={o.status} size="xs" />
                  </li>
              )}
              </ul>
            }
            <Link to="/my/off-days" className="mt-4 block">
              <Button variant="secondary" size="sm" className="w-full">
                Request off-day
              </Button>
            </Link>
          </div>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader title="My department on the platform" description={`${w.platform?.code} / ${w.person.dept} workstation pool`} icon={<LaptopIcon className="mt-0.5 h-4 w-4 text-primary" />} />
          {occ ?
          <div className="space-y-3 p-5 pt-4">
              <CapacityMeter label="Seats in use now" used={occ.occupiedNow} capacity={occ.capacity} size="md" pending={occ.handoverPending} />
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-canvas p-2">
                  <p className="flex items-center justify-center gap-1 text-[11px] text-ink-muted"><SunIcon className="h-3 w-3" /> Morning</p>
                  <p className="font-semibold tabular">{occ.morning} / {occ.capacity}</p>
                </div>
                <div className="rounded-lg bg-canvas p-2">
                  <p className="flex items-center justify-center gap-1 text-[11px] text-ink-muted"><MoonIcon className="h-3 w-3" /> Night</p>
                  <p className="font-semibold tabular">{occ.night} / {occ.capacity}</p>
                </div>
              </div>
            </div> :

          <EmptyState title="Platform data unavailable" />
          }
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader title="Shift rotation" icon={<RepeatIcon className="mt-0.5 h-4 w-4 text-primary" />} />
          <div className="p-5 pt-3 text-sm">
            <p className="text-ink-muted">
              Current cycle {fmtDate(w.rotation.current.start, 'MMM d')} → {fmtDate(w.rotation.current.end, 'MMM d')}
            </p>
            <div className="mt-3 flex items-center gap-3">
              {w.shift && <ShiftTag shift={w.shift} />}
              <ArrowRightIcon className="h-4 w-4 text-ink-subtle" />
              {w.shift && <ShiftTag shift={w.shift === 'NIGHT' ? 'MORNING' : 'NIGHT'} />}
            </div>
            <p className="mt-3 text-xs text-ink-muted">Starting {fmtDate(w.rotation.next.start, 'EEEE, MMM d')} at 07:30 · published by the rotation scheduler</p>
            {w.plannedCover.length > 0 &&
            <div className="mt-4 rounded-xl border border-line p-3">
                <p className="text-xs font-semibold">Planned absence covered</p>
                {w.plannedCover.map((r) =>
              <p key={r.id} className="mt-1 text-xs text-ink-muted">
                    {fmtDate(r.date, 'MMM d')} · <IdText>{r.freelancerId ?? 'searching'}</IdText> · <StatusBadge status={r.status} size="xs" />
                  </p>
              )}
              </div>
            }
          </div>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader title="Notifications" action={<Link to="/notifications" className="text-xs font-medium text-primary hover:underline">View all</Link>} />
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
      <p className="mt-4 text-xs text-ink-subtle">
        Department <DeptTag dept={w.person.dept} /> is permanent. Contact your shift manager for platform questions.
      </p>
    </div>);

}