import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { useSessionStore } from '../../hooks/useSessionStore';
import { breakApi } from './api';
import { breakConfig } from './config';
import { defaultFilters, type BreakSession, type BreakRequest, type BreakFilters as Filters, type BreakExport } from './contracts';
import { useBreakSnapshot, useBreakMonitor, useBreakConnection } from './hooks';
import { BreakAllowance, BreakAudit, BreakHistory, BreakNotice, BreakStatus, BreakTimer } from './components';
import { WorkflowDialog, type Workflow } from './WorkflowDialog';
import { BreakFilters } from './BreakFilters';
import { businessTime, normalizeBreakError } from './utils';

export function BreakManagementPage() {
  const snapshot = useBreakSnapshot(); const online = useBreakConnection(); const location = useLocation();
  const [workflow, setWorkflow] = useState<Workflow>(); const [detail, setDetail] = useState<BreakSession>(); const [feedback, setFeedback] = useState<{ message: string; error: boolean }>();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const isPolicy = location.pathname.endsWith('/policy'); const isReports = location.pathname.endsWith('/reports');
  const supervisor = useSessionStore(s => s.user?.role === 'SUPERVISOR');
  const s = snapshot.data; const monitor = useBreakMonitor(filters, !!s?.capabilities.monitor && !isPolicy);
  const user = useSessionStore(st => st.user);
  const history = useQuery({ queryKey: ['breaks', user?.id, 'history', filters.page], queryFn: () => breakApi.history(filters.page, 20), enabled: !!s && !supervisor, retry: false });
  const disabled = !online || snapshot.isFetching || snapshot.isError || Date.now() - snapshot.dataUpdatedAt > 60000;
  const onFeedback = (message: string, error: boolean) => setFeedback({ message, error });
  if (!snapshot.enabled) return <BreakNotice>Break Management is disabled. Other application routes remain available.</BreakNotice>;
  if (snapshot.error) return <div className="space-y-3"><PageHeader title="Break Management" /><BreakNotice error>{snapshot.error.message}</BreakNotice><Button onClick={() => snapshot.refetch()} disabled={!online}>Refresh access</Button></div>;
  if (!s) return <BreakNotice>{snapshot.isPending ? 'Loading break access and authoritative state…' : 'Break access is unavailable.'}</BreakNotice>;
  if ((supervisor && !s.capabilities.monitor) || (isPolicy && !s.capabilities.policy) || (isReports && !s.capabilities.monitor)) return <BreakNotice error>Your current verified capabilities do not permit this page.</BreakNotice>;
  return <div className="space-y-5">
    <PageHeader title={isPolicy ? 'Break Policy' : isReports ? 'Break History & Reports' : 'Break Management'} description={supervisor ? 'Operational visibility with individual actions limited to the returned authorization scope.' : 'Manage your breaks within the scheduled shift allowance.'} actions={<Button variant="secondary" loading={snapshot.isFetching || monitor.isFetching} disabled={!online} onClick={() => { snapshot.refetch(); if (s.capabilities.monitor && !isPolicy) monitor.refetch(); }}>Refresh</Button>} />
    {breakConfig.adapter === 'mock' && <BreakNotice>Development simulation · No production break records, emails, or disciplinary cases are created. Demo fixture shifts are explicitly assigned to Morning.</BreakNotice>}
    {!online && <BreakNotice error>Offline. Displaying last confirmed data. Start, end, and review actions are disabled; no operations are queued.</BreakNotice>}
    {feedback && <BreakNotice error={feedback.error}>{feedback.message}</BreakNotice>}
    <p className="text-xs text-ink-muted">Last confirmed update: {businessTime(s.serverNow, s.timezone)} · Policy v{s.policy.version}{disabled && online ? ' · Refreshing or stale: actions disabled' : ''}</p>
    {s.notices.map(n => <BreakNotice key={n}>{n}</BreakNotice>)}
    {supervisor && <nav aria-label="Break Management sections" className="flex flex-wrap gap-4 text-sm text-primary"><Link to="/breaks">Monitoring</Link><Link to="/breaks/reports">History & reports</Link>{s.capabilities.policy && <Link to="/breaks/policy">Policy settings</Link>}</nav>}
    {isPolicy ? <Card className="space-y-4 p-5"><h2 className="font-semibold">Current effective policy v{s.policy.version}</h2><p className="text-sm">Effective {businessTime(s.policy.effectiveAt, s.timezone)} · Standard allowance {s.policy.allowanceMinutes} minutes</p><dl className="grid gap-3 text-sm sm:grid-cols-2">{Object.entries(s.policy).filter(([k]) => k !== 'effectiveAt').map(([k, v]) => <div key={k}><dt className="text-ink-muted">{k.replace(/([A-Z])/g, ' $1')}</dt><dd>{Array.isArray(v) ? v.join(', ') : v}</dd></div>)}</dl><Button disabled={disabled} onClick={() => setWorkflow({ kind: 'policy', policy: s.policy })}>Configure policy</Button><h3 className="font-semibold">Policy change history</h3>{s.policyHistory.map(p => <p key={p.version} className="text-sm">v{p.version} · {p.allowanceMinutes} minutes · Effective {businessTime(p.effectiveAt, s.timezone)}{Date.parse(p.effectiveAt) > Date.parse(s.serverNow) ? ' · Scheduled' : ''}</p>)}</Card> : supervisor ? <>
      {monitor.isError ? <BreakNotice error>{normalizeBreakError(monitor.error).message} Monitoring data is hidden until refresh succeeds.</BreakNotice> : <>
        {monitor.data && <div className="grid gap-3 sm:grid-cols-3">{[['Active sessions', monitor.data.activeCount], ['Pending approvals', monitor.data.pendingCount], ['Unreviewed overruns', monitor.data.overrunCount]].map(([label, value]) => <Card key={label} className="p-4"><h2 className="text-xs text-ink-muted">{label}</h2><p className="mt-2 text-2xl font-semibold">{value}</p></Card>)}</div>}
        <BreakFilters filters={filters} onChange={setFilters} departments={monitor.data?.departments ?? []} platforms={monitor.data?.platforms ?? []} />
        <Card className="space-y-4 p-5"><h2 className="font-semibold">{isReports ? 'Filtered break history' : 'Operational sessions'}</h2>{monitor.isPending ? <p role="status">Loading sessions…</p> : <BreakHistory sessions={monitor.data?.sessions ?? []} timezone={s.timezone} onView={setDetail} />}<div className="flex items-center justify-between gap-3"><Button variant="secondary" disabled={filters.page === 1 || monitor.isFetching} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Previous</Button><p className="text-sm">Page {filters.page} · {monitor.data?.total ?? 0} matching sessions</p><Button variant="secondary" disabled={!monitor.data || filters.page * filters.pageSize >= Math.max(monitor.data.total, isReports ? 0 : monitor.data.requestTotal) || monitor.isFetching} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Next</Button></div></Card>
        {!isReports && <Card className="space-y-3 p-5"><h2 className="font-semibold">Extra-break approval queue</h2><Requests requests={monitor.data?.requests ?? []} disabled={disabled || monitor.isFetching} onAction={setWorkflow} timezone={s.timezone} /></Card>}
        {isReports && <Exports key={JSON.stringify(filters)} filters={filters} allowed={s.capabilities.export && !disabled} />}
      </>}
    </> : <>
      <Card className="space-y-4 p-5"><h2 className="font-semibold">Your scheduled shift</h2>{s.shift ? <><p className="text-sm">{s.shift.code} · Scheduled shift date {s.shift.date} · {s.shift.department} / {s.shift.platform}</p><p className="text-xs text-ink-muted">{businessTime(s.shift.startsAt, s.timezone)} → {businessTime(s.shift.endsAt, s.timezone)}</p></> : <BreakNotice>No scheduled shift assignment available.</BreakNotice>}<BreakAllowance snapshot={s} />{s.active && <BreakTimer session={s.active} snapshot={s} />}{s.actions.restriction && <BreakNotice>{s.actions.restriction}</BreakNotice>}<div className="flex flex-wrap gap-2">{s.active ? <Button disabled={disabled || !s.actions.end} onClick={() => setWorkflow({ kind: 'end', session: s.active ?? undefined })}>End Break</Button> : <Button disabled={disabled || !s.actions.start} onClick={() => setWorkflow({ kind: 'start' })}>Start Break</Button>}{s.actions.request && <Button variant="secondary" disabled={disabled} onClick={() => setWorkflow({ kind: 'request' })}>Request Extra Break</Button>}</div></Card>
      <Card className="space-y-3 p-5"><h2 className="font-semibold">Extra-break requests</h2><Requests requests={s.requests} disabled={disabled} onAction={setWorkflow} timezone={s.timezone} /></Card>
      <Card className="space-y-4 p-5"><h2 className="font-semibold">Your session history</h2><p className="text-xs text-ink-muted">Latest {s.history.length} sessions, retaining backend scheduled shift dates.</p><BreakHistory sessions={history.isError ? [] : history.data?.sessions ?? []} timezone={s.timezone} onView={setDetail} />{history.isError && <BreakNotice error>{normalizeBreakError(history.error).message}</BreakNotice>}<div className="flex justify-between"><Button variant="secondary" disabled={filters.page === 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Previous</Button><span>Page {filters.page}</span><Button variant="secondary" disabled={!history.data || filters.page * 20 >= history.data.total} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Next</Button></div></Card>
      <Link to="/notifications" className="inline-block text-sm text-primary underline">View operational notifications</Link>
    </>}
    {workflow && <WorkflowDialog workflow={workflow} onClose={() => setWorkflow(undefined)} onFeedback={onFeedback} />}
    {detail && <SessionDetails id={detail.id} timezone={s.timezone} disabled={disabled} onClose={() => setDetail(undefined)} onAction={w => { setDetail(undefined); setWorkflow(w); }} />}
  </div>;
}
function Requests({ requests, disabled, onAction, timezone }: { requests: BreakRequest[]; disabled: boolean; onAction: (w: Workflow) => void; timezone: string }) {
  if (!requests.length) return <BreakNotice>No extra-break requests in this view.</BreakNotice>;
  return <ul className="space-y-3">{requests.map(r => <li key={r.id} className="space-y-2 rounded-xl border border-line p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{r.workerName} · {r.requestedMinutes} minutes</strong><BreakStatus status={r.status} /></div><p>{r.reason}</p><p className="text-xs text-ink-muted">Shift date {r.shiftDate} · Expires {businessTime(r.expiresAt, timezone)}</p>{r.approvedMinutes && <p>Approved duration: {r.approvedMinutes} minutes. Original allowance remains unchanged.</p>}{r.decisionReason && <p>Decision reason: {r.decisionReason}</p>}{r.actions.decide && <Button size="sm" disabled={disabled} onClick={() => onAction({ kind: 'decide', request: r })}>Review request</Button>}{r.actions.withdraw && <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onAction({ kind: 'withdraw', request: r })}>Withdraw request</Button>}<details><summary className="cursor-pointer">Request audit history</summary><BreakAudit events={r.events} timezone={timezone} /></details></li>)}</ul>;
}
function SessionDetails({ id, timezone, disabled, onClose, onAction }: { id: string; timezone: string; disabled: boolean; onClose: () => void; onAction: (w: Workflow) => void }) {
  const user = useSessionStore(s => s.user); const query = useQuery({ queryKey: ['breaks', user?.id, 'session', id], queryFn: () => breakApi.session(id), retry: false, refetchInterval: 30000 }); const s = query.isError ? undefined : query.data;
  return <Dialog open onClose={onClose} title="Break session details" size="lg"><div className="space-y-3">{query.isError && <BreakNotice error>{normalizeBreakError(query.error).message}</BreakNotice>}{!s && !query.isError && <p role="status">Loading session details…</p>}{s && <><p>{s.workerName} · {s.workerId} · Scheduled shift date {s.shiftDate}</p><BreakStatus status={s.status} /><p className="text-sm">Started {businessTime(s.startedAt, timezone)}<br />Ended {s.endedAt ? businessTime(s.endedAt, timezone) : 'Not closed'}</p>{s.review && <BreakNotice>{s.review.outcome} · {s.review.reason} · {s.review.actor} · {businessTime(s.review.at, timezone)}</BreakNotice>}{s.escalation.message && <BreakNotice>{s.escalation.message}</BreakNotice>}{s.escalation.caseId && <Link to="/disciplinary" className="text-primary underline">Open existing disciplinary module · {s.escalation.caseId}</Link>}<div className="flex gap-2">{s.actions.correct && <Button disabled={disabled || query.isFetching} onClick={() => onAction({ kind: 'correct', session: s })}>Correct timer</Button>}{s.actions.review && <Button disabled={disabled || query.isFetching} onClick={() => onAction({ kind: 'review', session: s })}>Review overrun</Button>}</div><h3 className="font-semibold">Original events and correction history</h3><BreakAudit events={s.events} timezone={timezone} /></>}</div></Dialog>;
}
function Exports({ filters, allowed }: { filters: Filters; allowed: boolean }) {
  const [job, setJob] = useState<BreakExport>(); const [error, setError] = useState('');
  const mutation = useMutation({ mutationFn: (format: 'CSV' | 'XLSX') => breakApi.export(filters, format, crypto.randomUUID()), retry: false, onSuccess: setJob, onError: e => setError(normalizeBreakError(e).message) });
  const user = useSessionStore(s => s.user);
  const status = useQuery({ queryKey: ['breaks', user?.id, 'export', job?.id], queryFn: () => breakApi.exportStatus(job?.id ?? ''), enabled: allowed && !!job && ['Queued', 'Processing'].includes(job.status), refetchInterval: q => ['Ready', 'Failed'].includes(q.state.data?.status ?? '') ? false : 2000, retry: false });
  const result = status.data ?? job;
  const safeUrl = result?.downloadUrl && (/^https:\/\//.test(result.downloadUrl) || (breakConfig.adapter === 'mock' && (result.downloadUrl.startsWith('data:text/csv') || result.downloadUrl.startsWith('data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,'))));
  return <Card className="space-y-3 p-5"><h2 className="font-semibold">Authorized exports</h2><p className="text-sm text-ink-muted">Export the current filters and assignment context through the selected adapter.</p><div className="flex gap-2">{(['CSV', 'XLSX'] as const).map(format => <Button key={format} disabled={!allowed || mutation.isPending} onClick={() => { setJob(undefined); setError(''); mutation.mutate(format); }}>Request {format}</Button>)}</div>{!allowed && <BreakNotice>Explicit export permission and fresh online data are required.</BreakNotice>}{error && <BreakNotice error>{error}</BreakNotice>}{status.isError && <BreakNotice error>{normalizeBreakError(status.error).message}</BreakNotice>}{allowed && !status.isError && result && <BreakNotice error={result.status === 'Failed'}>{result.status} · {result.progress}% · {result.message}{result.status === 'Ready' && safeUrl && <a className="ml-3 text-primary underline" href={result.downloadUrl ?? ''} download={`break-history.${result.format.toLowerCase()}`} rel="noopener noreferrer">Download {result.format}</a>}</BreakNotice>}</Card>;
}


