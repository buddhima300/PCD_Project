import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDownIcon, CheckIcon, PlayIcon, SearchXIcon, XCircleIcon } from 'lucide-react';
import { CandidateList } from '../../components/replacement/CandidateList';
import { ReplacementTimeline } from '../../components/replacement/ReplacementTimeline';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { CapacityMeter } from '../../components/ui/CapacityMeter';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Textarea } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorState, LoadingBlock } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DeptTag, IdText, ShiftTag } from '../../components/ui/Tags';
import { useSessionStore } from '../../hooks/useSessionStore';
import { api, errorMessage } from '../../services/api';
import { deptNames, fmtDate, fmtShiftWindow } from '../../utils/format';

export function ReplacementDetail() {
  const { id = '' } = useParams();
  const role = useSessionStore((s) => s.user?.role);
  const isOps = role === 'ADMIN' || role === 'MANAGER';
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: ['replacement', id], queryFn: () => api.getReplacement(id) });
  const done = (msg: string) => () => {
    toast.success(msg);
    qc.invalidateQueries();
  };
  const onErr = (e: unknown) => toast.error('Action rejected by server', { description: errorMessage(e) });
  const search = useMutation({ mutationFn: () => api.runSearch(id), onSuccess: (r) => {r.status === 'ASSIGNED' ? toast.success(`${r.freelancerId} assigned`) : toast.error('No eligible replacement found');qc.invalidateQueries();}, onError: onErr });
  const assign = useMutation({ mutationFn: (fl: string) => api.assignFreelancer(id, fl), onSuccess: done('Freelancer assigned and notified'), onError: onErr });
  const confirm = useMutation({ mutationFn: () => api.confirmReplacement(id), onSuccess: done('Assignment confirmed'), onError: onErr });
  const cancel = useMutation({ mutationFn: () => api.cancelReplacement(id, reason), onSuccess: () => {setCancelOpen(false);setReason('');done('Replacement cancelled')();} });

  if (q.isPending) return <LoadingBlock rows={10} />;
  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const { replacement: r, pool } = q.data;
  const selected = r.candidates.find((c) => c.selected);
  const chain: [string, React.ReactNode][] = [
  ['Absent employee', <span key="a"><IdText>{r.absentEmployeeId}</IdText> {r.absentEmployeeName}</span>],
  ['Platform', <span key="p">{r.platformCode} <span className="text-ink-muted">({r.categoryCode})</span></span>],
  ['Department', <DeptTag key="d" dept={r.dept} full />],
  ['Shift', <ShiftTag key="s" shift={r.shift} />],
  ['Date', fmtShiftWindow(r.shiftStart, r.shiftEnd)],
  ['Workstation requirement', pool ? `${pool.capacity} seats in ${pool.platformCode} / ${pool.dept} pool` : '—']];


  return (
    <div>
      <PageHeader
        breadcrumbs={isOps ? [{ label: 'Replacement Center', to: '/replacements' }, { label: r.id }] : [{ label: 'Assignments', to: '/my/assignments' }, { label: r.id }]}
        title={`${r.platformCode} / ${r.dept} · ${r.shift === 'MORNING' ? 'Morning' : 'Night'} ${fmtDate(r.date, 'MMM d')}`}
        meta={<><StatusBadge status={r.type} /><StatusBadge status={r.status} /></>}
        description={`${r.id} · ${r.reason}`}
        actions={
        <>
            {isOps && ['PENDING', 'SEARCHING', 'FAILED'].includes(r.status) && <Button size="sm" icon={<PlayIcon className="h-3.5 w-3.5" />} loading={search.isPending} onClick={() => search.mutate()}>Run search now</Button>}
            {r.status === 'ASSIGNED' && (isOps || role === 'FREELANCER') && <Button size="sm" icon={<CheckIcon className="h-3.5 w-3.5" />} loading={confirm.isPending} onClick={() => confirm.mutate()}>Confirm assignment</Button>}
            {isOps && r.status !== 'CANCELLED' && <Button size="sm" variant="secondary" icon={<XCircleIcon className="h-3.5 w-3.5" />} onClick={() => setCancelOpen(true)}>Cancel</Button>}
          </>
        } />
      

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {r.status === 'FAILED' &&
          <Card className="border-danger-100">
              <div role="alert" className="p-5">
                <p className="flex items-center gap-2 text-base font-semibold text-danger-600"><SearchXIcon className="h-5 w-5" /> NO ELIGIBLE REPLACEMENT</p>
                <p className="mt-2 text-sm">Required: <b>{r.platformCode} {r.dept} {r.shift === 'MORNING' ? 'Morning' : 'Night'} {fmtDate(r.date, 'MMMM d')}</b></p>
                <ul className="mt-3 space-y-1.5 text-sm text-ink-muted">
                  {r.failureReasons.map((x) => <li key={x} className="flex gap-2"><XCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />{x}</li>)}
                </ul>
                <p className="mt-3 text-xs text-ink-subtle">Update freelancer availability or priority, then run the search again. The engine never assigns an ineligible freelancer.</p>
              </div>
            </Card>
          }

          <Card>
            <CardHeader title="Replacement decision" description="Values are returned by the replacement engine — nothing is calculated in the browser." />
            <div className="grid gap-5 p-5 md:grid-cols-2">
              <ol className="space-y-1">
                {chain.map(([l, v], i) =>
                <li key={l}>
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2 text-[13px]">
                      <span className="text-ink-muted">{l}</span>
                      <span className="text-right font-medium">{v}</span>
                    </div>
                    {i < chain.length - 1 && <ArrowDownIcon className="mx-auto my-0.5 h-3 w-3 text-ink-subtle" aria-hidden />}
                  </li>
                )}
              </ol>
              <div className="rounded-xl border border-line p-4">
                <p className="text-xs font-medium text-ink-muted">Selected replacement</p>
                {r.freelancerId ?
                <>
                    <p className="mt-1 text-xl font-semibold"><IdText className="text-xl">{r.freelancerId}</IdText></p>
                    <p className="text-sm text-ink-muted">{r.freelancerName}</p>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                      <div><dt className="text-xs text-ink-muted">Department</dt><dd className="font-medium">{r.dept} · {deptNames[r.dept]}</dd></div>
                      <div><dt className="text-xs text-ink-muted">Platform</dt><dd className="font-medium">{r.platformCode}</dd></div>
                      <div><dt className="text-xs text-ink-muted">Priority</dt><dd className="font-medium">{r.freelancerPriority}</dd></div>
                      <div><dt className="text-xs text-ink-muted">Assignment</dt><dd><StatusBadge status={r.status} size="xs" /></dd></div>
                      <div className="col-span-2"><dt className="text-xs text-ink-muted">Workstation</dt><dd className="font-mono font-medium">{r.workstationId}</dd></div>
                    </dl>
                    {selected &&
                  <div className="mt-4 border-t border-line pt-3">
                        <p className="text-xs font-semibold">Why this freelancer was selected</p>
                        <ul className="mt-2 space-y-1 text-[13px]">
                          {selected.checks.map((k) => <li key={k.key} className="flex items-center gap-2"><CheckIcon className="h-3.5 w-3.5 text-success" />{k.label}</li>)}
                          <li className="flex items-center gap-2"><CheckIcon className="h-3.5 w-3.5 text-success" />Priority {selected.priority} — highest eligible in {r.dept}</li>
                        </ul>
                      </div>
                  }
                  </> :

                <p className="mt-2 text-sm text-ink-muted">{r.status === 'PENDING' ? `Search scheduled for ${fmtDate(r.initiatedAt, 'MMM d')} (${r.type === 'PLANNED' ? '7 days before the shift' : 'queued'}).` : r.status === 'SEARCHING' ? 'Search in progress.' : r.status === 'CANCELLED' ? `Cancelled — ${r.cancelReason ?? ''}` : 'No freelancer assigned.'}</p>
                }
              </div>
            </div>
          </Card>

          {isOps &&
          <Card>
              <CardHeader title="Eligible freelancer candidates" description={`${r.dept} freelancers in manager-defined priority order. Other departments are excluded by rule.`} />
              <div className="mt-3">
                <CandidateList candidates={r.candidates} canAssign={!['CANCELLED', 'CONFIRMED'].includes(r.status)} assigningId={assign.isPending ? assign.variables : null} onAssign={(fl) => assign.mutate(fl)} />
              </div>
            </Card>
          }
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Workflow" />
            <div className="p-5 pt-4"><ReplacementTimeline steps={r.timeline} /></div>
          </Card>
          {pool &&
          <Card>
              <CardHeader title="Workstation pool allocation" description={`${pool.platformCode} / ${pool.dept}`} />
              <div className="space-y-3 p-5 pt-3">
                <CapacityMeter label="Seats occupied now" used={pool.occupied} capacity={pool.capacity} pending={pool.handoverPending} />
                <p className="text-[13px]">Allocated workstation: <IdText className="font-semibold">{r.workstationId ?? 'pending assignment'}</IdText></p>
                {isOps && <Link to={`/pools/${pool.id}`} className="text-xs font-medium text-primary hover:underline">Open pool</Link>}
              </div>
            </Card>
          }
        </div>
      </div>

      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        size="sm"
        title={`Cancel ${r.id}`}
        description="The freelancer is released and their availability restored."
        footer={<><Button variant="ghost" size="sm" onClick={() => setCancelOpen(false)}>Keep</Button><Button variant="danger" size="sm" loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancel replacement</Button></>}>
        
        <Field label="Reason" htmlFor="cancel-reason"><Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Employee returned to work" /></Field>
        {cancel.isError && <p role="alert" className="mt-3 rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger-600">{errorMessage(cancel.error)}</p>}
      </Dialog>
    </div>);

}