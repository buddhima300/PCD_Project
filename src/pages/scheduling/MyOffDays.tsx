import React, { useState } from 'react';
import { getDay, parseISO } from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarXIcon, CheckCircle2Icon, InfoIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { CapacityMeter } from '../../components/ui/CapacityMeter';
import { Dialog } from '../../components/ui/Dialog';
import { MonthNav } from '../../components/ui/MonthNav';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorState, LoadingBlock } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useSessionStore } from '../../hooks/useSessionStore';
import { api, errorMessage } from '../../services/api';
import type { OffDayCalendarCell, OffDayRequestResult } from '../../types/domain';
import { TODAY } from '../../utils/clock';
import { cn } from '../../utils/cn';
import { deptNames, fmtDate } from '../../utils/format';

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function cellState(c: OffDayCalendarCell, optimistic: boolean): string {
  if (optimistic) return 'REQUESTED';
  if (c.myRequest && c.myRequest.status !== 'CANCELLED') return c.myRequest.status;
  if (c.groupState === 'CONFLICT') return 'CONFLICT';
  if (c.groupState === 'FULL') return 'FULL';
  return 'AVAILABLE';
}

export function MyOffDays() {
  const user = useSessionStore((s) => s.user)!;
  const qc = useQueryClient();
  const [month, setMonth] = useState(TODAY.slice(0, 7));
  const [selected, setSelected] = useState<OffDayCalendarCell | null>(null);
  const [result, setResult] = useState<OffDayRequestResult | null>(null);
  const q = useQuery({ queryKey: ['offday-calendar', user.id, month], queryFn: () => api.getOffDayCalendar(user.id, month) });
  const request = useMutation({
    mutationFn: (date: string) => api.requestOffDay(user.id, date),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['offday-calendar'] });
      qc.invalidateQueries({ queryKey: ['my-work'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    }
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelOffDay(id),
    onSuccess: () => {
      toast.success('Off-day cancelled');
      setSelected(null);
      qc.invalidateQueries({ queryKey: ['offday-calendar'] });
    },
    onError: (e) => toast.error(errorMessage(e))
  });

  const close = () => {
    setSelected(null);
    setResult(null);
    request.reset();
  };

  if (q.isPending) return <LoadingBlock rows={8} />;
  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const cal = q.data;
  const lead = (getDay(parseISO(cal.cells[0].date)) + 6) % 7;
  const full = selected && !selected.selectable && (selected.groupState === 'FULL' || selected.groupState === 'CONFLICT') && !selected.myRequest;

  return (
    <div>
      <PageHeader title="My off-days" description={`Capacity group: ${cal.platformCode} · ${cal.dept} (${deptNames[cal.dept]}). Requests are processed first-come-first-served — maximum 2 approved per date.`} />
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3">
            <MonthNav month={month} onChange={setMonth} min="2026-09" max="2026-11" />
            <div className="flex flex-wrap gap-2 text-[11px]">
              {['AVAILABLE', 'REQUESTED', 'APPROVED', 'REJECTED', 'FULL', 'CONFLICT'].map((s) => <StatusBadge key={s} status={s} size="xs" />)}
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5 p-3">
            {WEEK.map((d) => <div key={d} className="text-center text-[11px] font-medium text-ink-subtle">{d}</div>)}
            {Array.from({ length: lead }).map((_, i) => <div key={i} />)}
            {cal.cells.map((c) => {
              const optimistic = request.isPending && request.variables === c.date;
              const st = cellState(c, optimistic);
              return (
                <button
                  key={c.date}
                  onClick={() => {setResult(null);request.reset();setSelected(c);}}
                  disabled={c.isPast && !c.myRequest}
                  className={cn(
                    'flex min-h-[78px] flex-col rounded-xl border p-1.5 text-left transition-colors duration-150 disabled:cursor-default sm:p-2',
                    c.isPast ? 'border-line bg-canvas opacity-60' : 'border-line hover:border-primary-200',
                    st === 'APPROVED' && 'border-success-100 bg-success-50',
                    st === 'OVERRIDE_APPROVED' && 'border-violet-100 bg-violet-50',
                    st === 'REJECTED' && 'border-danger-100 bg-danger-50/60',
                    st === 'FULL' && !c.isPast && 'bg-mist',
                    st === 'REQUESTED' && 'animate-pulse border-warning-100 bg-warning-50',
                    c.date === TODAY && 'ring-2 ring-primary/40'
                  )}
                  aria-label={`${fmtDate(c.date, 'MMMM d')}: ${c.approvedInGroup} of ${c.limit} off in ${cal.dept} on ${cal.platformCode}. ${st.replace('_', ' ').toLowerCase()}`}>
                  
                  <span className="text-xs font-semibold tabular">{fmtDate(c.date, 'd')}</span>
                  <span className={cn('mt-auto text-[10px] font-semibold tabular', c.groupState === 'FULL' ? 'text-primary-700' : c.groupState === 'CONFLICT' ? 'text-danger-600' : 'text-ink-subtle')}>
                    {c.approvedInGroup} / {c.limit} OFF
                  </span>
                  {st !== 'AVAILABLE' && <StatusBadge status={st} size="xs" className="mt-1 hidden max-w-full truncate lg:inline-flex" />}
                </button>);

            })}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-xs font-medium text-ink-muted">{fmtDate(`${month}-01`, 'MMMM')} allowance</p>
            <p className="mt-1 text-3xl font-semibold tabular">{cal.remaining} <span className="text-base font-medium text-ink-muted">of {cal.allowance} remaining</span></p>
            <div className="mt-3"><CapacityMeter used={cal.used} capacity={cal.allowance} showText={false} /></div>
          </Card>
          <Card>
            <CardHeader title="How approval works" icon={<InfoIcon className="mt-0.5 h-4 w-4 text-primary" />} />
            <ul className="space-y-2 p-5 pt-3 text-[13px] text-ink-muted">
              <li>Capacity is counted per <b className="text-ink">platform + department + date</b> — {cal.platformCode} {cal.dept} is separate from other platforms and departments.</li>
              <li>If fewer than 2 are approved, your request is approved immediately.</li>
              <li>If 2 are already approved, it is rejected. You choose another date — we never move it for you.</li>
            </ul>
          </Card>
        </div>
      </div>

      <Dialog
        open={!!selected}
        onClose={close}
        size="sm"
        title={selected ? fmtDate(selected.date, 'EEEE, MMMM d') : ''}
        description={`${cal.platformCode} · ${cal.dept}`}
        footer={
        selected && !result &&
        <>
              <Button variant="ghost" size="sm" onClick={close}>{full ? 'Choose another date' : 'Close'}</Button>
              {selected.selectable && <Button size="sm" loading={request.isPending} onClick={() => request.mutate(selected.date)}>Request off-day</Button>}
              {selected.myRequest && (selected.myRequest.status === 'APPROVED' || selected.myRequest.status === 'OVERRIDE_APPROVED') && !selected.isPast &&
          <Button variant="danger" size="sm" loading={cancel.isPending} onClick={() => cancel.mutate(selected.myRequest!.id)}>Cancel off-day</Button>
          }
            </>

        }>
        
        {selected && result ?
        result.outcome === 'APPROVED' ?
        <div className="text-center">
              <CheckCircle2Icon className="mx-auto h-10 w-10 text-success" />
              <p className="mt-2 text-base font-semibold">Off-day approved</p>
              <p className="mt-1 text-sm text-ink-muted">{result.message}</p>
              <Button size="sm" className="mt-4" onClick={close}>Done</Button>
            </div> :

        <UnavailablePanel platform={cal.platformCode} dept={cal.dept} date={selected.date} approved={result.capacity.approved} limit={result.capacity.limit} reason={result.message} onChoose={close} /> :

        selected && full ?
        <UnavailablePanel platform={cal.platformCode} dept={cal.dept} date={selected.date} approved={selected.approvedInGroup} limit={selected.limit} reason={selected.unavailableReason ?? ''} onChoose={close} /> :
        selected ?
        <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-xl bg-canvas p-3">
              <span className="text-ink-muted">Capacity for this date</span>
              <span className="font-semibold tabular">{selected.approvedInGroup} / {selected.limit} OFF</span>
            </div>
            {selected.myRequest &&
          <div className="rounded-xl border border-line p-3">
                <div className="flex items-center justify-between"><span className="text-ink-muted">Your request</span><StatusBadge status={selected.myRequest.status} /></div>
                {selected.myRequest.reason && <p className="mt-2 text-xs text-ink-muted">{selected.myRequest.reason}</p>}
              </div>
          }
            {selected.selectable ?
          <p className="text-ink-muted">Submitting now takes the next available slot. You’ll see the result immediately.</p> :

          selected.unavailableReason && !selected.myRequest && <p className="text-ink-muted">{selected.unavailableReason}</p>
          }
            {request.isError && <p role="alert" className="rounded-xl bg-danger-50 px-3 py-2 text-danger-600">{errorMessage(request.error)}</p>}
          </div> :
        null}
      </Dialog>
    </div>);

}

function UnavailablePanel({ platform, dept, date, approved, limit, reason, onChoose }: {platform: string;dept: string;date: string;approved: number;limit: number;reason: string;onChoose: () => void;}) {
  return (
    <div role="alert">
      <div className="flex items-center gap-2 text-danger-600">
        <CalendarXIcon className="h-5 w-5" />
        <p className="text-base font-semibold">DATE UNAVAILABLE</p>
      </div>
      <dl className="mt-3 divide-y divide-line rounded-xl border border-line text-sm">
        {[
        ['Platform', platform],
        ['Department', dept],
        ['Date', fmtDate(date, 'MMMM d')],
        ['Capacity', `${approved} / ${limit} OFF`]].
        map(([l, v]) =>
        <div key={l} className="flex justify-between px-3 py-2"><dt className="text-ink-muted">{l}</dt><dd className="font-semibold">{v}</dd></div>
        )}
      </dl>
      <p className="mt-3 text-sm text-ink-muted">“{reason}”</p>
      <p className="mt-1 text-xs text-ink-subtle">Your request was not moved to another date.</p>
      <Button size="sm" className="mt-4 w-full" onClick={onChoose}>Choose another date</Button>
    </div>);

}