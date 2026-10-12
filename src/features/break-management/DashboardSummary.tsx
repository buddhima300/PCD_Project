import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useBreakSnapshot, useBreakMonitor, useBreakConnection } from './hooks';
import { defaultFilters } from './contracts';
import { BreakAllowance, BreakTimer, BreakNotice } from './components';
import { WorkflowDialog, type Workflow } from './WorkflowDialog';
import { breakConfig } from './config';

export function BreakDashboardSummary() {
  const query = useBreakSnapshot(); const online = useBreakConnection();
  const monitor = useBreakMonitor(defaultFilters, !!query.data?.capabilities.monitor);
  const [workflow, setWorkflow] = useState<Workflow>(); const [feedback, setFeedback] = useState<{ message: string; error: boolean }>();
  if (!query.enabled || !query.data) return null;
  const s = query.data; const disabled = !online || query.isFetching;
  return <Card className="mb-5 space-y-3 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Break Management</h2><Link className="text-sm text-primary underline" to={s.capabilities.monitor ? '/breaks' : '/my/breaks'}>Open Break Management</Link></div>{breakConfig.adapter === 'mock' && <p className="text-xs text-ink-muted">Development simulation · no production break operations</p>}{feedback && <BreakNotice error={feedback.error}>{feedback.message}</BreakNotice>}{s.capabilities.monitor ? monitor.isError ? <BreakNotice error>Monitoring unavailable; refresh in Break Management.</BreakNotice> : <dl className="grid grid-cols-3 gap-3">{[['Active', monitor.data?.activeCount], ['Pending approvals', monitor.data?.pendingCount], ['Unreviewed overruns', monitor.data?.overrunCount]].map(([label, value]) => <div key={label} className="rounded-xl border border-line p-3"><dt className="text-xs text-ink-muted">{label}</dt><dd className="mt-1 text-xl font-semibold">{value ?? 'Loading…'}</dd></div>)}</dl> : <><p className="text-sm">Scheduled shift date {s.shift?.date ?? 'Unavailable'} · {s.shift?.code ?? ''}</p><BreakAllowance snapshot={s} />{s.active && <BreakTimer session={s.active} snapshot={s} />}<div className="flex flex-wrap gap-2">{s.active ? <Button disabled={disabled || !s.actions.end} onClick={() => setWorkflow({ kind: 'end', session: s.active ?? undefined })}>End Break</Button> : <Button disabled={disabled || !s.actions.start} onClick={() => setWorkflow({ kind: 'start' })}>Start Break</Button>}{s.actions.request && <Button variant="secondary" disabled={disabled} onClick={() => setWorkflow({ kind: 'request' })}>Request Extra Break</Button>}</div></>}{workflow && <WorkflowDialog workflow={workflow} onClose={() => setWorkflow(undefined)} onFeedback={(message, error) => setFeedback({ message, error })} />}</Card>;
}
