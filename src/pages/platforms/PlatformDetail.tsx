import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MoonIcon, SlidersHorizontalIcon, SunIcon } from 'lucide-react';
import { OffDayCapacityGrid } from '../../components/offday/OffDayCapacityGrid';
import { LaptopTable } from '../../components/resources/LaptopTable';
import { PlatformRosterView } from '../../components/roster/PlatformRosterView';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { CapacityMeter } from '../../components/ui/CapacityMeter';
import { DataTable } from '../../components/ui/DataTable';
import { Input } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingBlock, QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Tabs } from '../../components/ui/Tabs';
import { DeptTag, IdText, ShiftTag } from '../../components/ui/Tags';
import { useSessionStore } from '../../hooks/useSessionStore';
import { api } from '../../services/api';
import { TODAY } from '../../utils/clock';
import { deptNames, fmtDate, fmtDateTime } from '../../utils/format';

type Tab = 'overview' | 'workforce' | 'roster' | 'offdays' | 'freelancers' | 'workstations' | 'incidents' | 'reports' | 'audit';

export function PlatformDetail() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const role = useSessionStore((s) => s.user?.role);
  const [tab, setTab] = useState<Tab>('overview');
  const [date, setDate] = useState(TODAY);
  const q = useQuery({ queryKey: ['platform', code], queryFn: () => api.getPlatform(code) });
  const emps = useQuery({ queryKey: ['employees', { platform: code, pageSize: 200 }], queryFn: () => api.listEmployees({ platform: code, pageSize: 200 }), enabled: tab === 'workforce' });
  const reps = useQuery({ queryKey: ['replacements', { platform: code }], queryFn: () => api.listReplacements({ platform: code }), enabled: tab === 'freelancers' || tab === 'overview' });
  const laps = useQuery({ queryKey: ['laptops', { platform: code, pageSize: 200 }], queryFn: () => api.listLaptops({ platform: code, pageSize: 200 }), enabled: tab === 'workstations' });
  const incs = useQuery({ queryKey: ['incidents', { platform: code }], queryFn: () => api.listIncidents({ platform: code }), enabled: tab === 'incidents' });
  const audit = useQuery({ queryKey: ['config-history', code], queryFn: () => api.getConfigHistory(code), enabled: tab === 'audit' });

  if (q.isPending) return <LoadingBlock rows={8} />;
  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const { platform: p, pools } = q.data;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Platforms', to: '/platforms' }, { label: p.categoryCode, to: role === 'ADMIN' ? `/categories/${p.categoryCode}` : undefined }, { label: p.code }]}
        title={p.code}
        meta={<><StatusBadge status={p.status} /><StatusBadge status={p.opStatus} /></>}
        description={`${p.id} · Category ${p.categoryCode} · ${p.occupancy.map((o) => `${o.dept} ${o.capacity}`).join(' · ')} · Total ${p.totalWorkstations} workstations`}
        actions={role === 'ADMIN' && <Link to={`/platform-config/${p.code}`}><Button variant="secondary" size="sm" icon={<SlidersHorizontalIcon className="h-3.5 w-3.5" />}>Configure</Button></Link>} />
      
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'workforce', label: 'Workforce', count: p.morningWorkforce + p.nightWorkforce },
        { id: 'roster', label: 'Roster' },
        { id: 'offdays', label: 'Off-days', count: p.offDayAlerts },
        { id: 'freelancers', label: 'Freelancers' },
        { id: 'workstations', label: 'Workstations', count: p.totalWorkstations },
        { id: 'incidents', label: 'Incidents', count: p.activeIncidents },
        { id: 'reports', label: 'Reports' },
        { id: 'audit', label: 'Audit' }]
        } />
      

      {tab === 'overview' &&
      <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Capacity by department" description="Configured workstations = employees per active shift" />
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {p.occupancy.map((o) =>
            <Link key={o.dept} to={`/pools/${o.poolId}`} className="rounded-xl border border-line p-4 transition-colors duration-150 hover:border-primary-200">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold">
                      {o.dept} <span className="font-normal text-ink-muted">· {deptNames[o.dept]}</span>
                    </p>
                    <span className="text-xs text-ink-muted">{o.capacity} seats</span>
                  </div>
                  <CapacityMeter label="Live" used={o.occupiedNow} capacity={o.capacity} size="md" pending={o.handoverPending} />
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <CapacityMeter label="Morning" used={o.morning} capacity={o.capacity} />
                    <CapacityMeter label="Night" used={o.night} capacity={o.capacity} />
                  </div>
                </Link>
            )}
            </div>
            <div className="flex flex-wrap gap-6 border-t border-line px-5 py-3 text-sm">
              <span>Total <b className="tabular">{p.currentWorkforce} / {p.totalWorkstations}</b> occupied</span>
              <span className="flex items-center gap-1"><SunIcon className="h-4 w-4 text-warning-600" /> Morning <b className="tabular">{p.morningWorkforce} / {p.totalWorkstations}</b></span>
              <span className="flex items-center gap-1"><MoonIcon className="h-4 w-4 text-primary" /> Night <b className="tabular">{p.nightWorkforce} / {p.totalWorkstations}</b></span>
            </div>
          </Card>
          <Card>
            <CardHeader title="Operations" />
            <dl className="divide-y divide-line px-5 py-2">
              {[
            ['Pending replacements', p.pendingReplacements, 'freelancers'],
            ['Handover pending tonight', p.pendingHandovers, 'workstations'],
            ['Open incidents', p.activeIncidents, 'incidents'],
            ['Off-day capacity alerts (14d)', p.offDayAlerts, 'offdays'],
            ['Available workstations now', p.availableWorkstations, 'workstations']].
            map(([l, v, t]) =>
            <div key={l as string} className="flex items-center justify-between py-2.5">
                  <dt className="text-sm text-ink-muted">{l}</dt>
                  <dd>
                    <button onClick={() => setTab(t as Tab)} className="text-base font-semibold tabular hover:text-primary">{v}</button>
                  </dd>
                </div>
            )}
            </dl>
            <div className="border-t border-line px-5 py-3">
              <p className="text-xs font-semibold">Upcoming replacements</p>
              {(reps.data?.items ?? []).filter((r) => r.date >= TODAY && r.status !== 'CANCELLED').slice(0, 4).map((r) =>
            <Link key={r.id} to={`/replacements/${r.id}`} className="mt-2 flex items-center justify-between text-[13px] hover:text-primary">
                  <span>{fmtDate(r.date, 'MMM d')} · <DeptTag dept={r.dept} /> <ShiftTag shift={r.shift} /></span>
                  <StatusBadge status={r.status} size="xs" />
                </Link>
            )}
            </div>
          </Card>
        </div>
      }

      {tab === 'workforce' &&
      <Card>
          <QueryView query={emps} isEmpty={(d) => d.items.length === 0}>
            {(d) =>
          <DataTable
            rows={d.items}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/employees/${r.id}`)}
            columns={[
            { key: 'id', header: 'Employee', cell: (r) => <IdText>{r.id}</IdText> },
            { key: 'name', header: 'Name', cell: (r) => r.name },
            { key: 'dept', header: 'Dept', cell: (r) => <DeptTag dept={r.dept} /> },
            { key: 'pos', header: 'Position', cell: (r) => r.position },
            { key: 'shift', header: 'Shift', cell: (r) => <ShiftTag shift={r.shift} /> },
            { key: 'ws', header: 'Workstation', cell: (r) => r.currentWorkstationId ? <span><IdText>{r.currentWorkstationId}</IdText> <span className="text-[11px] text-ink-subtle">{r.workstationState === 'IN_USE' ? 'in use' : 'scheduled'}</span></span> : '—' },
            { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} size="xs" /> }]
            } />

          }
          </QueryView>
        </Card>
      }

      {tab === 'roster' &&
      <div>
          <div className="mb-3 flex items-center gap-2">
            <label htmlFor="pr-date" className="text-xs font-medium text-ink-muted">Date</label>
            <Input id="pr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-44" />
          </div>
          <PlatformRosterView code={p.code} date={date} />
        </div>
      }

      {tab === 'offdays' &&
      <Card>
          <CardHeader title="Off-day capacity · next 21 days" description={`Each department on ${p.code} is its own group — max 2 approved off per date.`} />
          <div className="mt-3"><OffDayCapacityGrid platform={p.code} start={TODAY} days={21} /></div>
        </Card>
      }

      {tab === 'freelancers' &&
      <Card>
          <CardHeader title="Freelancer replacements on this platform" />
          <QueryView query={reps} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No replacements recorded for this platform" />}>
            {(d) =>
          <div className="mt-3">
                <DataTable
              rows={d.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => navigate(`/replacements/${r.id}`)}
              columns={[
              { key: 'id', header: 'Replacement', cell: (r) => <IdText>{r.id}</IdText> },
              { key: 'date', header: 'Date', cell: (r) => fmtDate(r.date, 'EEE, MMM d') },
              { key: 'dept', header: 'Dept', cell: (r) => <DeptTag dept={r.dept} /> },
              { key: 'shift', header: 'Shift', cell: (r) => <ShiftTag shift={r.shift} /> },
              { key: 'abs', header: 'Absent', cell: (r) => <IdText>{r.absentEmployeeId}</IdText> },
              { key: 'fl', header: 'Freelancer', cell: (r) => r.freelancerId ? <IdText>{r.freelancerId}</IdText> : '—' },
              { key: 'prio', header: 'Priority', align: 'right', cell: (r) => r.freelancerPriority ?? '—' },
              { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} size="xs" /> }]
              } />
            
              </div>
          }
          </QueryView>
        </Card>
      }

      {tab === 'workstations' &&
      <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {pools.map((pl) =>
          <Link key={pl.id} to={`/pools/${pl.id}`} className="rounded-2xl border border-line bg-surface p-4 hover:border-primary-200">
                <p className="text-sm font-semibold">{pl.platformCode} / {pl.dept}</p>
                <div className="mt-2"><CapacityMeter used={pl.occupied} capacity={pl.capacity} pending={pl.handoverPending} /></div>
                <p className="mt-2 text-xs text-ink-muted">{pl.available} available · {pl.handoverPending} handover · {pl.incidents} incidents</p>
              </Link>
          )}
          </div>
          <Card>
            <QueryView query={laps}>{(d) => <LaptopTable rows={d.items} showPool={false} />}</QueryView>
          </Card>
        </div>
      }

      {tab === 'incidents' &&
      <Card>
          <QueryView query={incs} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No incidents on this platform" />}>
            {(d) =>
          <DataTable
            rows={d}
            rowKey={(r) => r.id}
            columns={[
            { key: 'id', header: 'Incident', cell: (r) => <IdText>{r.id}</IdText> },
            { key: 'asset', header: 'Laptop', cell: (r) => <IdText>{r.assetId}</IdText> },
            { key: 'dept', header: 'Dept', cell: (r) => <DeptTag dept={r.dept} /> },
            { key: 'title', header: 'Title', cell: (r) => <span className="max-w-xs truncate">{r.title}</span> },
            { key: 'sev', header: 'Severity', cell: (r) => <StatusBadge status={r.severity} size="xs" /> },
            { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} size="xs" /> },
            { key: 'at', header: 'Created', cell: (r) => fmtDateTime(r.createdAt) }]
            } />

          }
          </QueryView>
        </Card>
      }

      {tab === 'reports' &&
      <Card>
          <CardHeader title="Platform reports" description="Opens the reports area pre-filtered to this platform." />
          <div className="grid gap-2 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
          ['platform-capacity', 'Platform capacity'],
          ['platform-roster', 'Platform roster'],
          ['offday-utilization', 'Off-day utilisation'],
          ['replacement-history', 'Replacement history'],
          ['handover-history', 'Laptop handover history'],
          ['platform-incidents', 'Platform incidents']].
          map(([k, l]) =>
          <Link key={k} to={`/reports?report=${k}&platform=${p.code}`} className="rounded-xl border border-line px-4 py-3 text-sm font-medium hover:border-primary-200 hover:text-primary">
                {l}
              </Link>
          )}
          </div>
        </Card>
      }

      {tab === 'audit' &&
      <Card>
          <CardHeader title="Configuration & status history" description="Every change is audited with actor, reason and previous value." />
          <QueryView query={audit} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No configuration changes recorded" />}>
            {(d) =>
          <div className="mt-3">
                <DataTable
              rows={d}
              rowKey={(r) => r.id}
              columns={[
              { key: 'at', header: 'Timestamp', cell: (r) => fmtDateTime(r.at) },
              { key: 'actor', header: 'Actor', cell: (r) => `${r.actorName}` },
              { key: 'action', header: 'Action', cell: (r) => <span className="font-mono text-[11px]">{r.action}</span> },
              { key: 'prev', header: 'Previous', cell: (r) => <span className="text-ink-muted">{r.previous}</span> },
              { key: 'next', header: 'New', cell: (r) => <span className="font-medium">{r.next}</span> },
              { key: 'reason', header: 'Reason', cell: (r) => <span className="max-w-xs truncate text-ink-muted">{r.reason}</span> }]
              } />
            
              </div>
          }
          </QueryView>
        </Card>
      }
    </div>);

}