import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRightIcon, ArrowRightIcon, CalendarOffIcon, GaugeIcon, GraduationCapIcon, MoonIcon, RefreshCwIcon, RepeatIcon,
  ServerIcon, ShieldAlertIcon, SparklesIcon, SunIcon, UserCheckIcon, UsersIcon } from
'lucide-react';
import { PlatformCard } from '../../components/platform/PlatformCard';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { KpiTile } from '../../components/ui/KpiTile';
import { PageHeader } from '../../components/ui/PageHeader';
import { ScopeFilters, type Scope } from '../../components/ui/ScopeFilters';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DeptTag, IdText, ShiftTag } from '../../components/ui/Tags';
import { PlacementWizardDialog } from '../../components/placement/PlacementWizardDialog';
import { useSessionStore } from '../../hooks/useSessionStore';
import { api } from '../../services/api';
import { fmtDate, fmtShiftWindow, relative } from '../../utils/format';

const severityRank = { INCIDENT: 0, WARNING: 1, FULL: 2, OPERATIONAL: 3, INACTIVE: 4 } as const;

export function OpsDashboard() {
  const user = useSessionStore((s) => s.user)!;
  const [scope, setScope] = useState<Scope>({ category: '', platform: '', dept: '', shift: '' });
  const [placementWorker, setPlacementWorker] = useState<any | null>(null);

  const q = useQuery({ queryKey: ['dashboard', scope], queryFn: () => api.getDashboard(scope) });
  const notif = useQuery({ queryKey: ['notifications', 'summary'], queryFn: () => api.listNotifications({}) });
  const demandsQuery = useQuery({ queryKey: ['platform-demands'], queryFn: () => api.listPlatformDemands() });
  const queueQuery = useQuery({ queryKey: ['placement-queue'], queryFn: () => api.listPlacementQueue() });
  const trainingsQuery = useQuery({ queryKey: ['trainings'], queryFn: () => api.listTrainings() });

  return (
    <div>
      <PageHeader
        title="Supervisor dashboard"
        description="Live platform staffing, workstation occupancy and exceptions across every category."
        actions={<ScopeFilters value={scope} onChange={setScope} />} />
      
      {q.isError ?
      <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card> :
      q.isPending ?
      <div className="grid gap-4 xl:grid-cols-12">
          <Skeleton className="h-56 xl:col-span-8" />
          <Skeleton className="h-56 xl:col-span-4" />
          <Skeleton className="h-28 xl:col-span-12" />
          <Skeleton className="h-72 xl:col-span-12" />
        </div> :

      (() => {
        const d = q.data;
        const k = d.kpis;
        const platforms = [...d.platforms].sort((a, b) => severityRank[a.opStatus as keyof typeof severityRank] - severityRank[b.opStatus as keyof typeof severityRank]);
        const exceptions = [
        ...d.urgentReplacements.filter((r) => r.status === 'FAILED' || r.status === 'SEARCHING' || r.status === 'PENDING').map((r) => ({
          key: r.id,
          to: `/replacements/${r.id}`,
          status: r.status,
          title: `${r.platformCode} / ${r.dept} · ${r.shift === 'MORNING' ? 'Morning' : 'Night'} ${fmtDate(r.date, 'MMM d')}`,
          detail: r.status === 'FAILED' ? `No eligible freelancer · replacing ${r.absentEmployeeId}` : `Replacement ${r.status.toLowerCase()} · ${r.absentEmployeeId}`
        })),
        ...d.incidents.filter((i) => i.severity === 'HIGH' || i.severity === 'CRITICAL').slice(0, 3).map((i) => ({
          key: i.id,
          to: '/incidents',
          status: i.severity,
          title: `${i.platformCode} / ${i.dept} · ${i.assetId}`,
          detail: i.title
        }))].
        slice(0, 6);
        const hoTotal = (Object.values(d.handoverByStatus) as number[]).reduce((s, n) => s + n, 0);
        return (
          <div className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-12">
                <Card className="xl:col-span-8">
                  <div className="flex flex-col gap-5 p-5 md:flex-row">
                    <div className="md:w-[42%]">
                      <p className="text-sm text-ink-muted">Good evening, {user.name.split(' ')[0]}</p>
                      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
                        {k.pendingReplacements > 0 ? `${k.pendingReplacements} replacements need action` : 'All shifts covered'}
                      </h2>
                      <p className="mt-2 text-sm text-ink-muted">
                        Morning shift ends 19:30 — <span className="font-semibold text-ink">{k.pendingHandovers} laptop handovers</span> due across{' '}
                        {k.activePlatforms} active platforms.
                      </p>
                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-primary-50 p-3">
                          <p className="text-[11px] font-medium text-primary-700">Seats occupied now</p>
                          <p className="mt-1 text-xl font-semibold text-ink tabular">
                            {k.currentWorkforce}
                            <span className="text-sm font-medium text-ink-muted"> / {k.totalWorkstations}</span>
                          </p>
                        </div>
                        <div className="rounded-xl bg-success-50 p-3">
                          <p className="text-[11px] font-medium text-success-600">Free seats</p>
                          <p className="mt-1 text-xl font-semibold text-ink tabular">{k.availableCapacity}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link to="/replacements">
                          <Button size="sm" icon={<RefreshCwIcon className="h-3.5 w-3.5" />}>
                            Replacement Center
                          </Button>
                        </Link>
                        <Link to="/operations">
                          <Button size="sm" variant="secondary">
                            Platform operations
                          </Button>
                        </Link>
                      </div>
                    </div>
                    <div className="flex-1 md:border-l md:border-line md:pl-5">
                      <p className="text-xs font-semibold text-ink">Needs attention</p>
                      {exceptions.length === 0 ?
                    <EmptyState title="No open exceptions" description="Replacements are covered and no high-severity incidents are open." className="py-8" /> :

                    <ul className="mt-2 divide-y divide-line">
                          {exceptions.map((x) =>
                      <li key={x.key}>
                              <Link to={x.to} className="flex items-start gap-3 rounded-lg py-2.5 hover:bg-mist/60">
                                <StatusBadge status={x.status} size="xs" className="mt-0.5 w-[92px] justify-center" />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13px] font-medium text-ink">{x.title}</span>
                                  <span className="block truncate text-xs text-ink-muted">{x.detail}</span>
                                </span>
                                <ArrowRightIcon className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-subtle" />
                              </Link>
                            </li>
                      )}
                        </ul>
                    }
                    </div>
                  </div>
                </Card>

                <Card className="xl:col-span-4">
                  <CardHeader title="Current shift status" description={fmtShiftWindow(d.currentShift.start, d.currentShift.end)} />
                  <div className="grid grid-cols-2 gap-3 p-5 pt-4">
                    <div className="rounded-xl border border-line p-3">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                        <SunIcon className="h-3.5 w-3.5 text-warning-600" /> Morning · live
                      </p>
                      <p className="mt-1 text-xl font-semibold tabular">{k.morningWorkforce}</p>
                      <p className="text-[11px] text-ink-subtle">rostered permanent</p>
                    </div>
                    <div className="rounded-xl border border-line p-3">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                        <MoonIcon className="h-3.5 w-3.5 text-primary" /> Night · 19:30
                      </p>
                      <p className="mt-1 text-xl font-semibold tabular">{k.nightWorkforce}</p>
                      <p className="text-[11px] text-ink-subtle">rostered permanent</p>
                    </div>
                  </div>
                  <div className="mx-5 mb-5 flex items-center justify-between rounded-xl bg-canvas p-3">
                    <div className="flex items-center gap-2.5">
                      <RepeatIcon className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-[13px] font-semibold">Upcoming rotation · {d.rotation.next.label}</p>
                        <p className="text-[11px] text-ink-muted">
                          {fmtDate(d.rotation.next.start, 'MMM d')} 07:30 · Morning ↔ Night swap
                        </p>
                      </div>
                    </div>
                    <Link to="/rotation" className="text-xs font-medium text-primary hover:underline">
                      Preview
                    </Link>
                  </div>
                </Card>
              </div>

              <Card>
                <dl className="grid grid-cols-2 divide-line sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
                  {[
                ['Permanent employees', k.permanentEmployees],
                ['Freelancers', k.freelancers],
                ['Active platforms', `${k.activePlatforms} / ${k.totalPlatforms}`],
                ['Morning workforce', k.morningWorkforce],
                ['Night workforce', k.nightWorkforce],
                ['Freelancers free tonight', k.availableFreelancers]].
                map(([l, v]) =>
                <div key={l} className="px-5 py-3.5">
                      <dt className="truncate text-xs text-ink-muted">{l}</dt>
                      <dd className="mt-1 text-lg font-semibold tabular text-ink">{v}</dd>
                    </div>
                )}
                </dl>
              </Card>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                <KpiTile label="Pending replacements" value={k.pendingReplacements} sub={`${k.failedReplacements} failed · manual action`} icon={RefreshCwIcon} tone={k.failedReplacements ? 'danger' : 'warning'} emphasis to="/replacements" />
                <KpiTile label="Full workstation pools" value={k.fullPools} sub={`of ${d.pools.length} active pools`} icon={GaugeIcon} tone="info" emphasis to="/pools" />
                <KpiTile label="Laptop incidents" value={k.laptopIncidents} sub="open or in progress" icon={ShieldAlertIcon} tone="danger" emphasis to="/incidents" />
                <KpiTile label="Pending handovers" value={k.pendingHandovers} sub="Morning → Night 19:30" icon={ArrowLeftRightIcon} tone="warning" emphasis to="/pools" />
                <KpiTile label="Off-day capacity conflicts" value={k.offDayConflicts} sub="full groups next 7 days" icon={CalendarOffIcon} tone="violet" emphasis to="/off-days" />
              </div>

              {/* Critical Staffing Gaps & Direct Platform Placement */}
              <div className="grid gap-4 xl:grid-cols-12">
                <Card className="xl:col-span-4">
                  <CardHeader
                    title="Critical platform vacancies"
                    description="Genuine vacancies awaiting recruit placement"
                    action={<Link to="/platform-demand" className="text-xs font-medium text-primary hover:underline">View demand</Link>}
                  />
                  <div className="p-4 space-y-2.5">
                    {(demandsQuery.data ?? []).filter(dm => dm.vacancy > 0).slice(0, 3).map(dm => (
                      <div key={`${dm.platformCode}-${dm.dept}`} className="flex items-center justify-between rounded-xl border border-line bg-mist/30 p-2.5 text-xs">
                        <div>
                          <div className="flex items-center gap-1.5 font-semibold text-ink">
                            <span className="font-bold text-primary-700">{dm.platformCode}</span>
                            <DeptTag dept={dm.dept} />
                          </div>
                          <p className="mt-1 text-ink-muted">
                            Staffing: <strong>{dm.activeHeadcount} / {dm.targetHeadcount}</strong> · {dm.vacancy} {dm.vacancy === 1 ? 'vacancy' : 'vacancies'}
                          </p>
                        </div>
                        <div className="text-right">
                          {dm.resourceStatus === 'READY' ? (
                            <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                              Workstation Ready
                            </span>
                          ) : (
                            <span className="inline-block rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                              Resource Blocked
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="xl:col-span-4">
                  <CardHeader
                    title="New recruits awaiting placement"
                    description="Match directly into platform vacancies"
                    action={<Link to="/placement-queue" className="text-xs font-medium text-primary hover:underline">Queue ({(queueQuery.data ?? []).length})</Link>}
                  />
                  <div className="p-4 space-y-2.5">
                    {(queueQuery.data ?? []).filter(q => q.lifecycle === 'SELECTED' || q.lifecycle === 'ONBOARDING').slice(0, 2).map(rec => (
                      <div key={rec.workerId} className="flex items-center justify-between rounded-xl border border-line bg-mist/30 p-2.5 text-xs">
                        <div>
                          <p className="font-semibold text-ink">{rec.workerName}</p>
                          <div className="mt-1 flex items-center gap-1 text-ink-muted">
                            <DeptTag dept={rec.dept} />
                            <span>Recommended: <strong>{rec.recommendedPlatform}</strong></span>
                          </div>
                        </div>
                        <Button
                          size="xs"
                          onClick={() => setPlacementWorker(rec)}
                          icon={<SparklesIcon className="h-3 w-3 text-amber-500" />}
                        >
                          Place Worker
                        </Button>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="xl:col-span-4">
                  <CardHeader
                    title="Current on-platform training"
                    description="5-day direct production training"
                    action={<Link to="/training" className="text-xs font-medium text-primary hover:underline">All ({(trainingsQuery.data ?? []).length})</Link>}
                  />
                  <div className="p-4 space-y-2.5">
                    {(trainingsQuery.data ?? []).filter(t => t.trainingStatus === 'IN_TRAINING' || t.trainingStatus === 'TRAINING_EXTENDED').slice(0, 3).map(trn => (
                      <div key={trn.id} className="flex items-center justify-between rounded-xl border border-line bg-mist/30 p-2.5 text-xs">
                        <div>
                          <p className="font-semibold text-ink">{trn.workerName}</p>
                          <p className="text-ink-muted text-[11px]">
                            {trn.platformCode} · {trn.positionCode} ({trn.dept})
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-primary-700">Day {trn.completedTrainingDays} / {trn.requiredTrainingDays}</span>
                          <span className="block text-[10px] text-ink-subtle">{trn.trainingStatus === 'TRAINING_EXTENDED' ? 'Extended' : 'In Training'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              <Card>
                <CardHeader
                title="Platform operations"
                description="Live seat occupancy per department. Platforms with problems sort first."
                action={
                <Link to="/operations" className="text-xs font-medium text-primary hover:underline">
                      View all {d.platforms.length}
                    </Link>
                } />
              
                <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {platforms.slice(0, 8).map((p) =>
                <PlatformCard key={p.code} platform={p} />
                )}
                </div>
              </Card>

              <div className="grid gap-4 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                  <CardHeader title="Replacement Center" description="Open and upcoming replacements, soonest first" action={<Link to="/replacements" className="text-xs font-medium text-primary hover:underline">Open center</Link>} />
                  {d.urgentReplacements.length === 0 ?
                <EmptyState title="No replacements required" /> :

                <ul className="mt-2 divide-y divide-line">
                      {d.urgentReplacements.map((r) =>
                  <li key={r.id}>
                          <Link to={`/replacements/${r.id}`} className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-2.5 hover:bg-mist/60 md:grid-cols-[110px_1fr_160px_auto]">
                            <IdText className="hidden md:block">{r.id}</IdText>
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5 text-[13px] font-medium">
                                {r.platformCode} <DeptTag dept={r.dept} /> <ShiftTag shift={r.shift} />
                              </span>
                              <span className="block truncate text-xs text-ink-muted">
                                {fmtDate(r.date, 'EEE, MMM d')} · {r.absentEmployeeId} → {r.freelancerId ?? 'unassigned'}
                              </span>
                            </span>
                            <StatusBadge status={r.type} size="xs" className="hidden md:inline-flex" />
                            <StatusBadge status={r.status} />
                          </Link>
                        </li>
                  )}
                    </ul>
                }
                </Card>

                <Card>
                  <CardHeader title="Laptop handover status" description="Tonight 19:30 · Morning → Night" />
                  <div className="p-5 pt-4">
                    {hoTotal === 0 ?
                  <EmptyState title="No handovers scheduled" className="py-6" /> :

                  <>
                        <div className="flex h-2.5 overflow-hidden rounded-full bg-line">
                          {(['COMPLETED', 'OUTGOING_CONFIRMED', 'PENDING', 'ISSUE_REPORTED'] as const).map((s) =>
                      <span key={s} className={s === 'COMPLETED' ? 'bg-success' : s === 'OUTGOING_CONFIRMED' ? 'bg-primary' : s === 'PENDING' ? 'bg-warning' : 'bg-danger'} style={{ width: `${(d.handoverByStatus[s] ?? 0) / hoTotal * 100}%` }} />
                      )}
                        </div>
                        <ul className="mt-4 space-y-2">
                          {(['PENDING', 'OUTGOING_CONFIRMED', 'COMPLETED', 'ISSUE_REPORTED'] as const).map((s) =>
                      <li key={s} className="flex items-center justify-between text-sm">
                              <StatusBadge status={s} />
                              <span className="font-semibold tabular">{d.handoverByStatus[s] ?? 0}</span>
                            </li>
                      )}
                        </ul>
                      </>
                  }
                    <div className="mt-5 border-t border-line pt-4">
                      <p className="text-xs font-semibold text-ink">Workstation pool status</p>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                        {[
                      ['Full', d.pools.filter((p) => p.occupied >= p.capacity).length],
                      ['With free seats', d.pools.filter((p) => p.available > 0).length],
                      ['With incidents', d.pools.filter((p) => p.incidents > 0).length]].
                      map(([l, v]) =>
                      <div key={l} className="rounded-lg bg-canvas px-2 py-2">
                            <p className="text-base font-semibold tabular">{v}</p>
                            <p className="text-[11px] text-ink-muted">{l}</p>
                          </div>
                      )}
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader title="Off-day capacity" description="Platform + department groups at 2 / 2 in the next 7 days" action={<Link to="/off-days?tab=capacity" className="text-xs font-medium text-primary hover:underline">Capacity view</Link>} />
                  {d.offDayHotspots.length === 0 ?
                <EmptyState title="No full off-day groups" className="py-8" /> :

                <ul className="mt-2 divide-y divide-line">
                      {d.offDayHotspots.map((h) =>
                  <li key={`${h.platformCode}-${h.dept}-${h.date}`} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                          <span className="flex items-center gap-1.5">
                            <span className="w-16 text-ink-muted">{fmtDate(h.date, 'EEE d')}</span>
                            <span className="font-medium">{h.platformCode}</span>
                            <DeptTag dept={h.dept} />
                          </span>
                          <StatusBadge status={h.approved > h.limit ? 'CONFLICT' : 'FULL'} label={`${h.approved} / ${h.limit} off`} size="xs" />
                        </li>
                  )}
                    </ul>
                }
                </Card>
                <Card>
                  <CardHeader title="Recent incidents" action={<Link to="/incidents" className="text-xs font-medium text-primary hover:underline">All incidents</Link>} />
                  {d.incidents.length === 0 ?
                <EmptyState title="No open incidents" className="py-8" /> :

                <ul className="mt-2 divide-y divide-line">
                      {d.incidents.map((i) =>
                  <li key={i.id} className="px-5 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-[13px] font-medium">
                              {i.platformCode} / {i.dept} · <IdText>{i.assetId}</IdText>
                            </span>
                            <StatusBadge status={i.severity} size="xs" />
                          </div>
                          <p className="truncate text-xs text-ink-muted">{i.title}</p>
                        </li>
                  )}
                    </ul>
                }
                </Card>
                <Card>
                  <CardHeader title="Notifications" action={<Link to="/notifications" className="text-xs font-medium text-primary hover:underline">View all</Link>} />
                  <ul className="mt-2 divide-y divide-line">
                    {(notif.data?.items ?? []).slice(0, 5).map((n) =>
                  <li key={n.id} className="flex gap-2.5 px-5 py-2.5">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-line-strong' : 'bg-primary'}`} aria-label={n.read ? 'Read' : 'Unread'} />
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

      })()
      }

      <PlacementWizardDialog
        open={!!placementWorker}
        onClose={() => setPlacementWorker(null)}
        worker={
          placementWorker
            ? {
                id: placementWorker.workerId,
                name: placementWorker.workerName,
                dept: placementWorker.dept,
                employmentType: placementWorker.employmentType
              }
            : null
        }
        onSuccess={() => {
          demandsQuery.refetch();
          queueQuery.refetch();
          trainingsQuery.refetch();
        }}
      />
    </div>);

}