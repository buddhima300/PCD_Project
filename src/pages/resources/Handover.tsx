import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeftRightIcon, ClipboardCheckIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Checkbox, Field, Input, Select, Textarea } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { ScopeFilters, type Scope } from '../../components/ui/ScopeFilters';
import { EmptyState, QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DeptTag, IdText, ShiftTag } from '../../components/ui/Tags';
import { useSessionStore } from '../../hooks/useSessionStore';
import { api, errorMessage } from '../../services/api';
import type { ChecklistResult, Condition, Handover as HandoverT, HandoverStatus } from '../../types/domain';
import { TODAY } from '../../utils/clock';
import { fmtDateTime, fmtTime } from '../../utils/format';

const EMPTY: ChecklistResult = { laptopCondition: 'GOOD', chargerPresent: true, mousePresent: true, physicalDamage: false, screenOk: true, keyboardOk: true, otherEquipment: 'Headset', notes: '' };

export function Handover() {
  const role = useSessionStore((s) => s.user?.role);
  return role === 'ADMIN' || role === 'MANAGER' ? <OpsHandovers /> : <MyHandovers />;
}

function OpsHandovers() {
  const [scope, setScope] = useState<Scope>({ category: '', platform: '', dept: '' });
  const [status, setStatus] = useState<HandoverStatus | ''>('');
  const [date, setDate] = useState(TODAY);
  const q = useQuery({ queryKey: ['handovers', scope, status, date], queryFn: () => api.listHandovers({ date, platform: scope.platform, dept: scope.dept, status }) });
  return (
    <div>
      <PageHeader title="Laptop handovers" description="Shift-change handovers between outgoing and incoming users of the same workstation pool." />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <ScopeFilters value={scope} onChange={setScope} show={['category', 'platform', 'dept']} />
          <Input type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-40" />
          <Select compact className="w-44" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as HandoverStatus)} placeholder="Any status" options={['PENDING', 'OUTGOING_CONFIRMED', 'RECEIVED', 'ISSUE_REPORTED', 'COMPLETED'].map((s) => ({ value: s, label: s.replace('_', ' ').toLowerCase() }))} />
        </div>
        <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No handovers for these filters" />}>
          {(rows) =>
          <DataTable rows={rows} rowKey={(h) => h.id} columns={[
          { key: 'at', header: 'Scheduled', cell: (h) => fmtDateTime(h.scheduledAt) },
          { key: 'pool', header: 'Pool', cell: (h) => <span className="flex items-center gap-1.5">{h.platformCode} <DeptTag dept={h.dept} /></span> },
          { key: 'ws', header: 'Workstation', cell: (h) => <IdText>{h.workstationId}</IdText> },
          { key: 'out', header: 'Outgoing', cell: (h) => <span className="flex items-center gap-1.5"><IdText>{h.outgoingId}</IdText><ShiftTag shift={h.outgoingShift} /></span> },
          { key: 'in', header: 'Incoming', cell: (h) => <span className="flex items-center gap-1.5"><IdText>{h.incomingId}</IdText><ShiftTag shift={h.incomingShift} /></span> },
          { key: 'st', header: 'Status', cell: (h) => <StatusBadge status={h.status} size="xs" /> },
          { key: 'inc', header: 'Incident', cell: (h) => h.incidentId ? <IdText className="text-danger-600">{h.incidentId}</IdText> : '—' }]
          } />
          }
        </QueryView>
      </Card>
    </div>);

}

function MyHandovers() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<{h: HandoverT;dir: 'INCOMING' | 'OUTGOING';} | null>(null);
  const [check, setCheck] = useState<ChecklistResult>(EMPTY);
  const [notes, setNotes] = useState('');
  const q = useQuery({ queryKey: ['my-handovers'], queryFn: () => api.getMyHandovers() });
  const done = (msg: string) => {toast.success(msg);setTarget(null);qc.invalidateQueries();};
  const outgoing = useMutation({ mutationFn: () => api.confirmOutgoing(target!.h.id, check), onSuccess: (h) => done(h.status === 'ISSUE_REPORTED' ? `Issue reported — incident ${h.incidentId} created` : 'Outgoing handover confirmed') });
  const receipt = useMutation({ mutationFn: (accepted: boolean) => api.confirmReceipt(target!.h.id, { accepted, notes }), onSuccess: (h) => done(h.status === 'COMPLETED' ? 'Receipt confirmed — handover completed' : `Issue reported — incident ${h.incidentId}`) });
  const err = outgoing.error ?? receipt.error;
  const open = (h: HandoverT, dir: 'INCOMING' | 'OUTGOING') => {setTarget({ h, dir });setCheck(EMPTY);setNotes('');outgoing.reset();receipt.reset();};
  const bool = (k: keyof ChecklistResult, label: string) => <Checkbox id={k} label={label} checked={check[k] as boolean} onChange={(v) => setCheck({ ...check, [k]: v })} />;

  return (
    <div>
      <PageHeader title="Handover" description="Hand your workstation to the next shift, or receive it from the previous one. Issues found create an incident automatically." />
      <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<Card><EmptyState icon={ArrowLeftRightIcon} title="No handovers scheduled" description="You have no workstation handovers for the upcoming shift change." /></Card>}>
        {(rows) =>
        <div className="grid gap-3 md:grid-cols-2">
            {rows.map(({ handover: h, direction }) =>
          <Card key={h.id} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{direction === 'INCOMING' ? 'Receive' : 'Hand over'}</span>
                  <StatusBadge status={h.status} size="xs" />
                </div>
                <p className="mt-2 font-mono text-lg font-semibold">{h.workstationId}</p>
                <p className="text-xs text-ink-muted">{h.assetId} · {h.platformCode} / {h.dept} · {fmtTime(h.scheduledAt)}</p>
                <p className="mt-2 text-sm">{direction === 'INCOMING' ? `From ${h.outgoingName} (${h.outgoingId})` : `To ${h.incomingName} (${h.incomingId})`}</p>
                {(direction === 'OUTGOING' && h.status === 'PENDING' || direction === 'INCOMING' && h.status === 'OUTGOING_CONFIRMED') &&
            <Button size="sm" className="mt-3 w-full" icon={<ClipboardCheckIcon className="h-4 w-4" />} onClick={() => open(h, direction)}>{direction === 'OUTGOING' ? 'Complete checklist' : 'Review & confirm receipt'}</Button>
            }
                {direction === 'INCOMING' && h.status === 'PENDING' && <p className="mt-3 text-xs text-ink-subtle">Waiting for {h.outgoingName} to confirm the outgoing checklist.</p>}
              </Card>
          )}
          </div>
        }
      </QueryView>
      <Dialog
        open={!!target}
        onClose={() => setTarget(null)}
        title={target?.dir === 'OUTGOING' ? 'Outgoing condition checklist' : 'Confirm receipt'}
        description={target ? `${target.h.workstationId} · ${target.h.assetId}` : ''}
        footer={target?.dir === 'OUTGOING' ?
        <><Button variant="ghost" size="sm" onClick={() => setTarget(null)}>Cancel</Button><Button size="sm" loading={outgoing.isPending} onClick={() => outgoing.mutate()}>Confirm handover</Button></> :

        <><Button variant="secondary" size="sm" loading={receipt.isPending && receipt.variables === false} onClick={() => receipt.mutate(false)}>Report issue</Button><Button size="sm" loading={receipt.isPending && receipt.variables === true} onClick={() => receipt.mutate(true)}>Confirm receipt</Button></>
        }>
        
        {target && (target.dir === 'OUTGOING' ?
        <div className="space-y-3">
            <Field label="Laptop condition" htmlFor="cond"><Select id="cond" value={check.laptopCondition} onChange={(e) => setCheck({ ...check, laptopCondition: e.target.value as Condition })} options={[{ value: 'GOOD', label: 'Good' }, { value: 'FAIR', label: 'Fair' }, { value: 'DAMAGED', label: 'Damaged' }]} /></Field>
            <div className="grid grid-cols-2 gap-2">
              {bool('chargerPresent', 'Charger present')}
              {bool('mousePresent', 'Mouse present')}
              {bool('screenOk', 'Screen OK')}
              {bool('keyboardOk', 'Keyboard OK')}
              {bool('physicalDamage', 'Physical damage')}
            </div>
            <Field label="Other equipment" htmlFor="oe"><Input id="oe" value={check.otherEquipment} onChange={(e) => setCheck({ ...check, otherEquipment: e.target.value })} /></Field>
            <Field label="Notes" htmlFor="notes"><Textarea id="notes" value={check.notes} onChange={(e) => setCheck({ ...check, notes: e.target.value })} /></Field>
          </div> :

        <div className="space-y-3 text-sm">
            {target.h.checklist &&
          <dl className="grid grid-cols-2 gap-2 rounded-xl bg-canvas p-3">
                <div><dt className="text-xs text-ink-muted">Condition</dt><dd><StatusBadge status={target.h.checklist.laptopCondition} size="xs" /></dd></div>
                <div><dt className="text-xs text-ink-muted">Charger / mouse</dt><dd>{target.h.checklist.chargerPresent ? 'Yes' : 'No'} / {target.h.checklist.mousePresent ? 'Yes' : 'No'}</dd></div>
                <div><dt className="text-xs text-ink-muted">Screen / keyboard</dt><dd>{target.h.checklist.screenOk ? 'OK' : 'Issue'} / {target.h.checklist.keyboardOk ? 'OK' : 'Issue'}</dd></div>
                <div><dt className="text-xs text-ink-muted">Other</dt><dd>{target.h.checklist.otherEquipment || '—'}</dd></div>
              </dl>
          }
            <Field label="Notes (required if reporting an issue)" htmlFor="rn"><Textarea id="rn" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>)
        }
        {err && <p role="alert" className="mt-3 rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger-600">{errorMessage(err)}</p>}
      </Dialog>
    </div>);

}