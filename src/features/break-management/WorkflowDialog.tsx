import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { breakApi } from './api';
import { commandSchema, reviewOutcomeSchema, type BreakCommand, type BreakSnapshot, type BreakSession, type BreakRequest, type BreakPolicy } from './contracts';
import { normalizeBreakError, businessTime } from './utils';
import { BreakNotice } from './components';
import { useBreakConnection } from './hooks';
import { useSessionStore } from '../../hooks/useSessionStore';

export type Workflow = { kind: BreakCommand['kind']; session?: BreakSession; request?: BreakRequest; policy?: BreakPolicy };
const labels: Record<BreakCommand['kind'], string> = { start: 'Start Break', end: 'End Break', request: 'Request Extra Break', withdraw: 'Withdraw Request', decide: 'Review Extra-break Request', correct: 'Correct Forgotten Timer', review: 'Review Overrun', policy: 'Update Break Policy' };
export function WorkflowDialog({ workflow, onClose, onFeedback }: { workflow: Workflow; onClose: () => void; onFeedback: (message: string, error: boolean) => void }) {
  const qc = useQueryClient(); const online = useBreakConnection(); const user = useSessionStore(s => s.user); const identity = useRef(user?.id);
  const [snapshot, setSnapshot] = useState<BreakSnapshot>(); const [record, setRecord] = useState<BreakSession>(); const [request, setRequest] = useState<BreakRequest>();
  const [reason, setReason] = useState(''); const [minutes, setMinutes] = useState(5); const [decision, setDecision] = useState<'Approved' | 'Rejected'>('Approved'); const [outcome, setOutcome] = useState<'Confirmed' | 'Not a policy violation' | 'Needs further review'>('Needs further review');
  const [endedAt, setEndedAt] = useState(''); const [policy, setPolicy] = useState(workflow.policy); const [preview, setPreview] = useState<BreakCommand>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const lock = useRef(false);
  useEffect(() => {
    let alive = true;
    Promise.all([breakApi.snapshot(), workflow.session ? breakApi.session(workflow.session.id) : Promise.resolve(undefined), workflow.request ? breakApi.request(workflow.request.id) : Promise.resolve(undefined)]).then(([s, r, q]) => {
      if (!alive) return; setSnapshot(s); setRecord(r); setRequest(q); setEndedAt(s.serverNow); if (workflow.kind === 'policy') setPolicy({ ...s.policy, version: Math.max(...s.policyHistory.map(p => p.version)) });
    }).catch(e => { if (alive) setError(normalizeBreakError(e).message); });
    return () => { alive = false; };
  }, [workflow]);
  const validIdentity = !!user && user.id === identity.current;
  const close = () => { if (!lock.current) onClose(); };
  function build(): BreakCommand {
    if (!snapshot) throw new Error('Fresh authoritative state is required.');
    const kind = workflow.kind;
    if (kind === 'start') return { kind, policyVersion: snapshot.policy.version, shiftDate: snapshot.shift?.date ?? '' };
    if (kind === 'end' && record) return { kind, id: record.id, version: record.version };
    if (kind === 'request') return { kind, minutes, reason };
    if (kind === 'withdraw' && request) return { kind, id: request.id, version: request.version };
    if (kind === 'decide' && request) return { kind, id: request.id, version: request.version, decision, minutes, reason };
    if (kind === 'correct' && record) return { kind, id: record.id, version: record.version, endedAt, reason };
    if (kind === 'review' && record) return { kind, id: record.id, version: record.version, outcome, reason };
    if (kind === 'policy' && policy) return { kind, policy };
    throw new Error('The authoritative record is unavailable.');
  }
  function permitted(s: BreakSnapshot, r?: BreakSession, q?: BreakRequest) {
    if (!s.available || !s.capabilities.view) return false;
    switch (workflow.kind) { case 'start': return s.actions.start; case 'end': return s.actions.end && !!r && r.workerId === user?.id && r.status === 'ACTIVE'; case 'request': return s.actions.request; case 'withdraw': return q?.actions.withdraw; case 'decide': return q?.actions.decide; case 'correct': return r?.actions.correct; case 'review': return r?.actions.review; case 'policy': return s.capabilities.policy; }
  }
  const review = () => {
    const parsed = commandSchema.safeParse(build()); if (!parsed.success) { setError(parsed.error.issues.map(i => i.message).join('. ')); return; }
    if ('minutes' in parsed.data && snapshot && parsed.data.minutes > snapshot.policy.extraMaximumMinutes) { setError(`Maximum extra break is ${snapshot.policy.extraMaximumMinutes} minutes.`); return; }
    setError(''); setPreview(parsed.data);
  };
  const confirm = async () => {
    if (!preview || lock.current || !online || !validIdentity) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const fresh = await breakApi.snapshot(); const r = record ? await breakApi.session(record.id) : undefined; const q = request ? await breakApi.request(request.id) : undefined;
      if (!permitted(fresh, r, q)) throw new Error('Permission or record state changed. This action is no longer available.');
      if ((r && record && r.version !== record.version) || (q && request && q.version !== request.version) || (preview.kind === 'start' && (fresh.shift?.date !== preview.shiftDate || fresh.policy.version !== preview.policyVersion)) || (preview.kind === 'policy' && Math.max(...fresh.policyHistory.map(p => p.version)) !== preview.policy.version)) {
        setSnapshot(fresh); setRecord(r); setRequest(q); if (policy) setPolicy({ ...policy, version: Math.max(...fresh.policyHistory.map(p => p.version)) }); setPreview(undefined); throw new Error('Another authorized user changed the record. Latest data loaded; review and confirm again.');
      }
      if (!navigator.onLine || useSessionStore.getState().user?.id !== identity.current) throw new Error('Connection or account changed. Submission blocked.');
      await breakApi.execute(preview, crypto.randomUUID());
      await qc.invalidateQueries({ queryKey: ['breaks'] });
      onFeedback(`${labels[workflow.kind]} confirmed by ${import.meta.env.PROD ? 'the server' : 'the development adapter'}.`, false); toast.success(`${labels[workflow.kind]} confirmed`); onClose();
    } catch (e) {
      const normalized = e instanceof Error && !(e.name === 'ZodError') ? e.message : normalizeBreakError(e).message;
      setError(normalized); onFeedback(normalized, true); setPreview(undefined);
      // Never retry an uncertain mutation. Refresh before allowing a new deliberate decision.
      await qc.invalidateQueries({ queryKey: ['breaks'] });
      try { const fresh = await breakApi.snapshot(); setSnapshot(fresh); if (record) setRecord(await breakApi.session(record.id)); if (request) setRequest(await breakApi.request(request.id)); } catch { setSnapshot(undefined); }
    } finally { lock.current = false; setBusy(false); }
  };
  const needReason = ['request', 'decide', 'correct', 'review'].includes(workflow.kind);
  const allowed = snapshot && permitted(snapshot, record, request) && validIdentity && online;
  return <Dialog open onClose={close} title={labels[workflow.kind]} description="Review fresh authoritative details before confirming an operational change." footer={<><Button variant="secondary" disabled={busy} onClick={close}>Cancel</Button>{preview ? <><Button variant="secondary" disabled={busy} onClick={() => setPreview(undefined)}>Back</Button><Button disabled={!allowed} loading={busy} onClick={confirm}>Confirm {labels[workflow.kind]}</Button></> : <Button disabled={!allowed || busy} onClick={review}>Review decision</Button>}</>}>
    <div className="space-y-4">
      {!online && <BreakNotice error>Offline. No action will be queued.</BreakNotice>}{error && <BreakNotice error>{error}</BreakNotice>}{!snapshot && !error && <p role="status">Loading fresh record…</p>}
      {snapshot && <><p className="text-sm">Scheduled shift date: {record?.shiftDate ?? request?.shiftDate ?? snapshot.shift?.date ?? 'Not applicable'} · Remaining: {snapshot.allowance ? `${snapshot.allowance.remainingSeconds / 60} minutes` : 'Unavailable'}</p>{record && <p className="text-sm">{record.workerName} · {record.status} · Started {businessTime(record.startedAt, snapshot.timezone)} · Version {record.version}</p>}{request && <p className="text-sm">{request.workerName} · {request.context.department} / {request.context.platform} · {request.context.shift} · {request.requestedMinutes} minutes requested · {request.reason} · {request.status} · Expires {businessTime(request.expiresAt, snapshot.timezone)}</p>}{!allowed && <BreakNotice error>{snapshot.actions.restriction || 'The returned permissions or current record do not permit this action.'}</BreakNotice>}</>}
      {preview ? <BreakNotice><strong>Confirm proposed change</strong><CommandPreview command={preview} timezone={snapshot?.timezone ?? 'UTC'} /><p className="mt-2">This change takes effect only after confirmation from the API.</p></BreakNotice> : <>
        {['request', 'decide'].includes(workflow.kind) && <Field label="Duration in minutes" htmlFor="break-minutes"><Input id="break-minutes" type="number" min={1} max={snapshot?.policy.extraMaximumMinutes} value={minutes} onChange={e => setMinutes(Number(e.target.value))} /></Field>}
        {workflow.kind === 'decide' && <Field label="Decision" htmlFor="break-decision"><Select id="break-decision" value={decision} onChange={e => setDecision(e.target.value === 'Approved' ? 'Approved' : 'Rejected')} options={['Approved', 'Rejected'].map(v => ({ value: v, label: v }))} /></Field>}
        {workflow.kind === 'review' && <Field label="Review outcome" htmlFor="break-outcome"><Select id="break-outcome" value={outcome} onChange={e => setOutcome(reviewOutcomeSchema.parse(e.target.value))} options={['Confirmed', 'Not a policy violation', 'Needs further review'].map(v => ({ value: v, label: v }))} /></Field>}
        {workflow.kind === 'correct' && <Field label="Proposed end timestamp (ISO 8601 with timezone)" htmlFor="break-ended" hint="Original events will remain in correction history."><Input id="break-ended" value={endedAt} onChange={e => setEndedAt(e.target.value)} /></Field>}
        {needReason && <Field label="Reason (required)" htmlFor="break-reason"><Textarea id="break-reason" maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></Field>}
        {workflow.kind === 'policy' && snapshot && policy && <PolicyForm policy={policy} onChange={setPolicy} />}
      </>}
    </div>
  </Dialog>;
}
function CommandPreview({ command: c, timezone }: { command: BreakCommand; timezone: string }) {
  if (c.kind === 'start') return <p className="mt-2">Start a break in scheduled shift {c.shiftDate}. The shared allowance continues across all sessions.</p>;
  if (c.kind === 'end') return <p className="mt-2">End the active break. The API will confirm the final elapsed duration.</p>;
  if (c.kind === 'withdraw') return <p className="mt-2">Withdraw this pending extra-break request.</p>;
  if (c.kind === 'request') return <p className="mt-2">Request {c.minutes} extra minutes. Reason: {c.reason}. Approval is required before use.</p>;
  if (c.kind === 'decide') return <p className="mt-2">{c.decision === 'Approved' ? `Approve ${c.minutes} extra minutes` : 'Reject this request'}. Reason: {c.reason}. The original allowance and existing overruns remain unchanged.</p>;
  if (c.kind === 'correct') return <p className="mt-2">Close the timer at {businessTime(c.endedAt, timezone)}. Reason: {c.reason}. The original start and later correction remain in history.</p>;
  if (c.kind === 'review') return <p className="mt-2">Outcome: {c.outcome}. Reason: {c.reason}. {c.outcome === 'Confirmed' ? 'This confirmed violation may count toward backend disciplinary escalation.' : 'This decision does not count toward disciplinary escalation.'}</p>;
  return <div className="mt-2 space-y-1"><p>Effective {businessTime(c.policy.effectiveAt, timezone)}. Shared allowance: {c.policy.allowanceMinutes} minutes.</p><p>Supervisor warnings: {c.policy.supervisorWarnings.join(', ')} minutes; employee warnings: {c.policy.employeeWarnings.join(', ')} minutes.</p><p>Extra maximum: {c.policy.extraMaximumMinutes} minutes; pending expiry: {c.policy.expiryMinutes} minutes.</p><p>Escalation: {c.policy.escalationThreshold} confirmed violations in {c.policy.countingDays} days. Retention: {c.policy.retentionDays} days.</p><p>Historical events remain unchanged.</p></div>;
}
function PolicyForm({ policy, onChange }: { policy: BreakPolicy; onChange: (p: BreakPolicy) => void }) {
  const numeric: { key: 'allowanceMinutes' | 'extraMaximumMinutes' | 'expiryMinutes' | 'escalationThreshold' | 'countingDays' | 'retentionDays'; label: string }[] = [{ key: 'allowanceMinutes', label: 'Standard allowance (minutes)' }, { key: 'extraMaximumMinutes', label: 'Extra-break maximum (minutes)' }, { key: 'expiryMinutes', label: 'Pending request expiry (minutes)' }, { key: 'escalationThreshold', label: 'Confirmed-overrun escalation threshold' }, { key: 'countingDays', label: 'Escalation counting period (days)' }, { key: 'retentionDays', label: 'History retention (days)' }];
  return <div className="space-y-3">{numeric.map(f => <Field key={f.key} label={f.label} htmlFor={`policy-${f.key}`}><Input id={`policy-${f.key}`} type="number" min={1} value={policy[f.key]} onChange={e => onChange({ ...policy, [f.key]: Number(e.target.value) })} /></Field>)}{(['supervisorWarnings', 'employeeWarnings'] as const).map(k => <Field key={k} label={k === 'supervisorWarnings' ? 'Supervisor warning minutes (comma separated)' : 'Employee warning minutes (comma separated)'} htmlFor={`policy-${k}`}><Input id={`policy-${k}`} value={policy[k].join(',')} onChange={e => onChange({ ...policy, [k]: e.target.value.split(',').map(Number) })} /></Field>)}<Field label="Effective timestamp (ISO 8601 with timezone)" htmlFor="policy-effective"><Input id="policy-effective" value={policy.effectiveAt} onChange={e => onChange({ ...policy, effectiveAt: e.target.value })} /></Field></div>;
}
