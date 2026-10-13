import { useState } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowDownLeftIcon, ArrowUpRightIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Checkbox, Field, Input, Textarea } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { SwitchWorkerButton } from '../../components/resources/SwitchWorkerButton';
import { useSessionStore } from '../../hooks/useSessionStore';
import { useDeviceClock } from '../../hooks/useDeviceClock';
import { api, errorMessage } from '../../services/api';
import type { Handover } from '../../types/domain';
import { businessDateTime, captureDeviceTime, handoverInstant, liveShift } from '../../utils/shiftTime';

export function MyWorkstation() {
  const userId = useSessionStore(s => s.user?.id);
  const now = useDeviceClock();
  const [date, setDate] = useState(() => liveShift(new Date()).date);
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['workstation-handovers', userId, date, page], queryFn: () => api.getMyWorkstationHandovers(date, page), refetchInterval: 30000 });
  const busy = useIsMutating({ mutationKey: ['handover-confirmation', userId] }) > 0;
  return <div className="space-y-4">
    <PageHeader title="My workstation & handover" description="Confirm your receipt and outgoing handover under your own account. All times are shown in Asia/Colombo." actions={<SwitchWorkerButton disabled={busy} />} />
    <div className="flex flex-wrap items-center gap-3"><Field label="Shift start date" htmlFor="my-handover-date"><Input id="my-handover-date" type="date" value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }} /></Field><p className="max-w-xl text-xs text-ink-muted">Night shifts include the next morning’s outgoing handover. Daily supervisor reports split events by calendar date.</p></div>
    <QueryView query={q}>{data => <>
      {data.workstation && <Card className="p-4"><p className="text-sm font-semibold">Current laptop · {data.workstation.assetId}</p><p className="mt-1 text-xs text-ink-muted">{data.workstation.model} · {data.workstation.workstationId} · {data.workstation.platformCode} / {data.workstation.dept}</p><Link to="/report-issue" className="mt-2 inline-block text-xs font-medium text-primary">Report another equipment issue</Link></Card>}
      <div className="grid items-start gap-4 xl:grid-cols-2">{(['INCOMING', 'OUTGOING'] as const).map(direction => {
        const rows = data.tasks.filter(h => (direction === 'INCOMING' ? h.incomingId : h.outgoingId) === userId);
        return <Card key={direction}><CardHeader title={direction === 'INCOMING' ? 'Receive shift' : 'Hand over shift'} description={direction === 'INCOMING' ? 'Confirm the laptop received from the previous worker.' : 'Confirm the same laptop and notes for the next worker.'} />
          {!rows.length ? <EmptyState title={direction === 'INCOMING' ? 'No receipt scheduled' : 'No outgoing handover scheduled'} description="Ask your supervisor to check your shift roster and workstation allocation." /> : <div className="space-y-4 p-4">{rows.map(h => <ConfirmationForm key={`${h.id}-${direction}`} handover={h} direction={direction} now={now} userId={userId ?? ''} />)}</div>}
        </Card>;
      })}</div>
      <Card><CardHeader title="My handover history" description="Saved confirmations, counterpart details and supervisor corrections." />
        {!data.history.length ? <EmptyState title="No handover confirmations yet" /> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-line bg-mist"><tr>{['Transfer', 'Laptop / partner', 'My confirmation', 'Counterpart', 'Attendance / condition', 'Notes / corrections'].map(label => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{data.history.map(h => {
          const incoming = h.incomingId === userId || h.incomingConfirmation?.actorId === userId;
          const confirmed = !!h.receivedAt && (!!h.outgoingConfirmedAt || !!h.selfConfirmationReason);
          return <tr key={h.id}><td className="px-4 py-3">{incoming ? 'Received' : 'Handed over'}<p className="mt-1 text-ink-muted">{businessDateTime(handoverInstant(h.scheduledAt))}</p></td><td className="px-4 py-3 font-medium">{h.assetId}<p className="mt-1 font-normal">{incoming ? h.outgoingName : h.incomingName}</p></td><td className="px-4 py-3 tabular">{businessDateTime((incoming ? h.receivedAt : h.outgoingConfirmedAt) ? handoverInstant((incoming ? h.receivedAt : h.outgoingConfirmedAt)!) : null)}</td><td className="px-4 py-3">{businessDateTime((incoming ? h.outgoingConfirmedAt : h.receivedAt) ? handoverInstant((incoming ? h.outgoingConfirmedAt : h.receivedAt)!) : null)}</td><td className="px-4 py-3"><StatusBadge status={confirmed ? 'COMPLETED' : 'PENDING'} label={confirmed ? 'Attendance confirmed' : 'Pending counterpart'} size="xs" />{h.selfConfirmationReason && <p className="mt-2 text-warning-600">Self-confirmed: {h.selfConfirmationReason}</p>}{h.equipmentIssue && <p className="mt-2 text-danger-600">Equipment: {h.equipmentIssue}</p>}</td><td className="max-w-sm px-4 py-3"><p>{incoming ? h.incomingNotes || '—' : h.outgoingNotes || h.checklist?.notes || '—'}</p>{h.corrections?.length ? <details className="mt-2"><summary className="cursor-pointer font-medium text-primary">{h.corrections.length} supervisor correction(s)</summary>{h.corrections.map((c, i) => <div key={i} className="mt-2 rounded-lg bg-mist p-2"><p>{c.actorName} · {businessDateTime(c.at)}</p><p>{c.reason}</p>{Object.keys(c.next).filter(k => c.next[k] !== c.previous[k]).map(k => <p key={k} className="break-all">{k}: {c.previous[k] || '—'} → {c.next[k] || '—'}</p>)}</div>)}</details> : null}</td></tr>;
        })}</tbody></table></div>}
        <div className="flex items-center justify-between border-t border-line p-3"><span className="text-xs text-ink-muted">{data.totalHistory} transfer records · page {page}</span><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={page * 20 >= data.totalHistory} onClick={() => setPage(page + 1)}>Next</Button></div></div>
      </Card>
    </>}</QueryView>
  </div>;
}

function ConfirmationForm({ handover: h, direction, now, userId }: { handover: Handover; direction: 'INCOMING' | 'OUTGOING'; now: Date; userId: string }) {
  const [notes, setNotes] = useState(''); const [equipmentIssue, setEquipmentIssue] = useState('');
  const [selfConfirm, setSelfConfirm] = useState(false); const [reason, setReason] = useState('');
  const qc = useQueryClient(); const incoming = direction === 'INCOMING';
  const at = incoming ? h.receivedAt : h.outgoingConfirmedAt;
  const scheduled = Date.parse(handoverInstant(h.scheduledAt));
  const early = now.getTime() < scheduled - 15 * 60000;
  const ended = incoming && now.getTime() >= scheduled + 12 * 3600000;
  const save = useMutation({ mutationKey: ['handover-confirmation', userId], mutationFn: () => api.submitHandoverConfirmation(h.id, { ...captureDeviceTime(), direction, notes, equipmentIssue, ...(incoming && selfConfirm ? { selfConfirmationReason: reason } : {}) }), onSuccess: result => { void qc.invalidateQueries(); toast.success(incoming ? result.outgoingConfirmedAt || result.selfConfirmationReason ? 'Receipt saved · attendance confirmed' : 'Receipt saved · pending outgoing confirmation' : 'Handover saved'); }, onError: e => toast.error(errorMessage(e)) });
  const Icon = incoming ? ArrowDownLeftIcon : ArrowUpRightIcon;
  return <div className="rounded-xl border border-line p-4">
    <div className="flex items-center justify-between gap-3"><h3 className="inline-flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4" />{h.assetId}</h3><StatusBadge status={h.status} size="xs" /></div>
    <dl className="mt-3 grid gap-2 text-xs"><div><dt className="text-ink-muted">{incoming ? 'From previous worker' : 'To next worker'}</dt><dd className="mt-1 font-medium">{incoming ? h.outgoingName : h.incomingName} · {incoming ? h.outgoingId || 'Unassigned' : h.incomingId}</dd></div><div><dt className="text-ink-muted">Workstation / platform</dt><dd>{h.workstationId} · {h.platformCode} / {h.dept}</dd></div><div><dt className="text-ink-muted">Scheduled shift change</dt><dd className="tabular">{businessDateTime(handoverInstant(h.scheduledAt))}</dd></div></dl>
    {incoming && (h.outgoingNotes || h.checklist?.notes) && <div className="mt-3 rounded-lg bg-mist p-3 text-xs"><p className="font-semibold">Previous worker’s notes</p><p className="mt-1 whitespace-pre-wrap">{h.outgoingNotes || h.checklist?.notes}</p></div>}
    {h.equipmentIssue && <p className="mt-3 text-xs text-danger-600">Equipment issue: {h.equipmentIssue}</p>}
    {at ? <div className="mt-4 space-y-3"><p className="text-sm font-medium text-success-600">Your confirmation is saved · {businessDateTime(handoverInstant(at))}</p>{incoming && !h.outgoingConfirmedAt && !h.selfConfirmationReason && <form className="space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(); }}><p className="text-xs text-ink-muted">Waiting for the outgoing worker. If they are unavailable, add a self-confirmation reason; your original receipt time stays unchanged.</p><Checkbox id={`pending-exception-${h.id}`} label="Outgoing worker is unavailable" checked={selfConfirm} onChange={setSelfConfirm} />{selfConfirm && <Field label="Required reason for self-confirmation" htmlFor={`pending-reason-${h.id}`}><Textarea id={`pending-reason-${h.id}`} required minLength={5} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></Field>}{save.isError && <p role="alert" className="text-xs text-danger-600">{errorMessage(save.error)}</p>}<Button type="submit" loading={save.isPending} disabled={!selfConfirm || reason.trim().length < 5 || ended}>Self-confirm pending attendance</Button></form>}</div> : <form className="mt-4 space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
      <fieldset disabled={save.isPending} className="space-y-3">
        <Field label={incoming ? 'Receipt notes (optional)' : 'Special notes for the next worker'} htmlFor={`notes-${h.id}-${direction}`}><Textarea id={`notes-${h.id}-${direction}`} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        <Field label="Equipment issue (optional)" htmlFor={`equipment-${h.id}-${direction}`} hint="Reporting an issue flags it separately; it does not block attendance confirmation."><Textarea id={`equipment-${h.id}-${direction}`} maxLength={2000} value={equipmentIssue} onChange={e => setEquipmentIssue(e.target.value)} /></Field>
        {incoming && !h.outgoingConfirmedAt && <><Checkbox id={`exception-${h.id}`} label="Outgoing worker unavailable · self-confirm attendance" checked={selfConfirm} onChange={setSelfConfirm} />{selfConfirm && <Field label="Required reason for self-confirmation" htmlFor={`reason-${h.id}`}><Textarea id={`reason-${h.id}`} minLength={5} maxLength={1000} required value={reason} onChange={e => setReason(e.target.value)} /></Field>}</>}
      </fieldset>
      <p className="text-xs text-ink-muted">Submission time is captured automatically from this device.</p>
      {early && <p className="text-xs text-warning-600">Opens at {businessDateTime(new Date(scheduled - 15 * 60000).toISOString())}.</p>}
      {ended && <p className="text-xs text-warning-600">This shift has ended. Contact your supervisor for review.</p>}
      {save.isError && <p role="alert" className="text-xs text-danger-600">{errorMessage(save.error)}</p>}
      <Button type="submit" loading={save.isPending} disabled={early || ended || (selfConfirm && reason.trim().length < 5)}>{incoming ? selfConfirm ? 'Self-confirm attendance' : 'Confirm receipt' : 'Handover'}</Button>
    </form>}
  </div>;
}
