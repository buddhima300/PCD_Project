import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { QueryView } from '../ui/States';
import { api, errorMessage } from '../../services/api';
import type { HandoverCorrectionInput } from '../../types/attendance';
import { businessDate, businessDateTime, businessTime, handoverInstant } from '../../utils/shiftTime';

function localValue(timestamp: string | null) { return timestamp ? `${businessDate(handoverInstant(timestamp))}T${businessTime(handoverInstant(timestamp))}` : ''; }
function fromLocal(value: string) { return value ? new Date(`${value}+05:30`).toISOString() : null; }

export function HandoverCorrectionDialog({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const [id, setId] = useState(ids[0]);
  const [draft, setDraft] = useState<HandoverCorrectionInput | null>(null);
  const [receipt, setReceipt] = useState(''); const [outgoing, setOutgoing] = useState('');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['attendance-handover', id], queryFn: () => api.getAttendanceHandover(id) });
  const options = useQuery({ queryKey: ['handover-correction-options', id], queryFn: () => api.getHandoverCorrectionOptions(id) });
  useEffect(() => { if (q.data) { const h = q.data; setDraft({ assetId: h.assetId, outgoingId: h.outgoingId, incomingId: h.incomingId, outgoingConfirmedAt: h.outgoingConfirmedAt, receivedAt: h.receivedAt, reason: '', expectedRevision: h.revision ?? 0 }); setReceipt(localValue(h.receivedAt)); setOutgoing(localValue(h.outgoingConfirmedAt)); } }, [q.data]);
  const save = useMutation({ mutationFn: () => api.correctAttendanceHandover(id, { ...draft!, receivedAt: receipt === localValue(draft!.receivedAt) ? draft!.receivedAt : fromLocal(receipt), outgoingConfirmedAt: outgoing === localValue(draft!.outgoingConfirmedAt) ? draft!.outgoingConfirmedAt : fromLocal(outgoing) }), onSuccess: () => { void qc.invalidateQueries(); toast.success('Correction saved with the original record preserved'); onClose(); }, onError: e => toast.error(errorMessage(e)) });
  const set = (key: keyof HandoverCorrectionInput, value: string) => setDraft(prev => prev ? { ...prev, [key]: value } : prev);
  return <Dialog open size="lg" title="Review & correct handover" description="Only supervisors can correct submitted values. Original confirmation evidence is retained." onClose={() => { if (!save.isPending) onClose(); }} footer={<><Button variant="secondary" disabled={save.isPending} onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!draft || draft.reason.trim().length < 5 || options.isPending || options.isError} onClick={() => save.mutate()}>Save audited correction</Button></>}>
    {ids.length > 1 && <Field label="Transfer to review" htmlFor="correction-transfer"><Select id="correction-transfer" disabled={save.isPending} value={id} onChange={e => { setDraft(null); save.reset(); setId(e.target.value); }} options={ids.map(value => ({ value, label: value }))} /></Field>}
    <QueryView query={q}>{h => <div className="mt-4 space-y-4">
      <p className="text-xs text-ink-muted">{h.platformCode} / {h.dept} · {businessDateTime(handoverInstant(h.scheduledAt))}</p>
      <fieldset disabled={save.isPending} className="space-y-4">
        <Field label="Laptop allocation" htmlFor="correction-laptop"><Select id="correction-laptop" value={draft?.assetId ?? h.assetId} onChange={e => set('assetId', e.target.value)} options={(options.data?.laptops ?? []).map(l => ({ value: l.assetId, label: `${l.assetId} · ${l.workstationId}` }))} /></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Outgoing worker" htmlFor="correction-outgoing-worker"><Select id="correction-outgoing-worker" placeholder="No outgoing worker scheduled" value={draft?.outgoingId ?? h.outgoingId} onChange={e => set('outgoingId', e.target.value)} options={(options.data?.people ?? []).map(p => ({ value: p.id, label: `${p.name} · ${p.id}` }))} /></Field><Field label="Incoming worker" htmlFor="correction-incoming-worker"><Select id="correction-incoming-worker" value={draft?.incomingId ?? h.incomingId} onChange={e => set('incomingId', e.target.value)} options={(options.data?.people ?? []).map(p => ({ value: p.id, label: `${p.name} · ${p.id}` }))} /></Field></div>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Outgoing confirmation time · Colombo" htmlFor="correction-outgoing-time" hint={!h.outgoingConfirmedAt ? 'No outgoing confirmation exists.' : undefined}><Input id="correction-outgoing-time" type="datetime-local" step="1" disabled={!h.outgoingConfirmedAt} value={outgoing} onChange={e => setOutgoing(e.target.value)} /></Field><Field label="Incoming receipt time · Colombo" htmlFor="correction-receipt-time" hint={!h.receivedAt ? 'No receipt confirmation exists.' : undefined}><Input id="correction-receipt-time" type="datetime-local" step="1" disabled={!h.receivedAt} value={receipt} onChange={e => setReceipt(e.target.value)} /></Field></div>
        <Field label="Required correction reason" htmlFor="correction-reason"><Textarea id="correction-reason" value={draft?.reason ?? ''} maxLength={2000} onChange={e => set('reason', e.target.value)} /></Field>
      </fieldset>
      {options.isError && <p role="alert" className="text-sm text-danger-600">{errorMessage(options.error)} <Button variant="secondary" onClick={() => void options.refetch()}>Retry</Button></p>}
      <div className="rounded-xl bg-mist p-3 text-xs"><h3 className="font-semibold">Original submission evidence</h3>{[h.outgoingConfirmation, h.incomingConfirmation].filter(Boolean).map((c, i) => <p key={i} className="mt-1">{c!.actorName} ({c!.actorId}) · {businessDateTime(c!.deviceTimestamp)} · device offset {c!.timezoneOffsetMinutes} min</p>)}{!h.outgoingConfirmation && !h.incomingConfirmation && <p className="mt-1">Legacy handover timestamps are retained in the first correction.</p>}</div>
      {h.corrections?.map((c, i) => <div key={i} className="rounded-xl border border-line p-3 text-xs"><p className="font-semibold">{c.actorName} · {businessDateTime(c.at)}</p><p className="mt-1">{c.reason}</p>{Object.keys(c.next).filter(k => c.next[k] !== c.previous[k]).map(k => <p key={k} className="mt-1 break-all">{k}: {c.previous[k] || '—'} → {c.next[k] || '—'}</p>)}</div>)}
      {save.isError && <p role="alert" className="text-sm text-danger-600">{errorMessage(save.error)}</p>}
    </div>}</QueryView>
  </Dialog>;
}
