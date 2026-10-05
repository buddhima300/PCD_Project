import React, { useState } from 'react';
import { getDay, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { MoonIcon, SunIcon } from 'lucide-react';
import { rosterCell, RosterLegend } from '../../components/roster/RosterMonthGrid';
import { Card, CardHeader } from '../../components/ui/Card';
import { MonthNav } from '../../components/ui/MonthNav';
import { PageHeader } from '../../components/ui/PageHeader';
import { QueryView } from '../../components/ui/States';
import { ShiftTag } from '../../components/ui/Tags';
import { api } from '../../services/api';
import { TODAY } from '../../utils/clock';
import { cn } from '../../utils/cn';
import { fmtDate, fmtShiftWindow } from '../../utils/format';

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function MySchedule() {
  const [month, setMonth] = useState(TODAY.slice(0, 7));
  const roster = useQuery({ queryKey: ['roster', 'me', month], queryFn: () => api.getRoster({ month }) });
  const work = useQuery({ queryKey: ['my-work'], queryFn: () => api.getMyWork() });
  return (
    <div>
      <PageHeader title="My schedule" description="Your shifts, off-days and covered absences. Shift times come from the roster service." />
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3">
            <MonthNav month={month} onChange={setMonth} min="2026-09" max="2026-10" />
            <RosterLegend />
          </div>
          <QueryView query={roster} isEmpty={(d) => d.rows.length === 0}>
            {(d) => {
              const row = d.rows[0];
              const lead = (getDay(parseISO(d.days[0])) + 6) % 7;
              return (
                <div className="grid grid-cols-7 gap-1.5 p-3">
                  {WEEK.map((w) => <div key={w} className="text-center text-[11px] font-medium text-ink-subtle">{w}</div>)}
                  {Array.from({ length: lead }).map((_, i) => <div key={i} />)}
                  {row.cells.map((c) => {
                    const shift = c.date >= '2026-10-01' ? row.shift === 'NIGHT' ? 'MORNING' : 'NIGHT' : row.shift;
                    return (
                      <div key={c.date} className={cn('flex min-h-[74px] flex-col rounded-xl border border-line p-2', c.date === TODAY && 'ring-2 ring-primary/40', c.date < TODAY && 'opacity-60')}>
                        <span className="text-xs font-semibold">{fmtDate(c.date, 'd')}</span>
                        <span className={cn('mt-auto inline-flex items-center gap-1 self-start rounded px-1.5 py-0.5 text-[10px] font-semibold', rosterCell[c.state].cls)}>
                          {c.state === 'WORKING' && (shift === 'MORNING' ? <SunIcon className="h-3 w-3" /> : <MoonIcon className="h-3 w-3" />)}
                          {c.state === 'WORKING' ? shift === 'MORNING' ? '07:30' : '19:30' : c.state.charAt(0) + c.state.slice(1).toLowerCase()}
                        </span>
                        {c.note && c.state === 'REPLACED' && <span className="mt-0.5 truncate font-mono text-[9px] text-ink-subtle">{c.note}</span>}
                      </div>);

                  })}
                </div>);

            }}
          </QueryView>
        </Card>
        <Card className="h-fit">
          <CardHeader title="Shift details" />
          <QueryView query={work}>
            {(w) =>
            <dl className="space-y-3 p-5 pt-3 text-sm">
                <div><dt className="text-xs text-ink-muted">Current shift</dt><dd className="mt-1 flex items-center gap-2">{w.shift && <ShiftTag shift={w.shift} />}{w.currentWindow && fmtShiftWindow(w.currentWindow.start, w.currentWindow.end)}</dd></div>
                <div><dt className="text-xs text-ink-muted">Next shift</dt><dd className="mt-1 flex items-center gap-2">{w.nextShift && <ShiftTag shift={w.nextShift} />}{w.nextWindow && fmtShiftWindow(w.nextWindow.start, w.nextWindow.end)}</dd></div>
                <div className="rounded-xl bg-primary-50 p-3">
                  <dt className="text-xs font-medium text-primary-700">Upcoming rotation</dt>
                  <dd className="mt-1 text-[13px]">From {fmtDate(w.rotation.next.start, 'MMM d')} you move to <b>{w.shift === 'NIGHT' ? 'Morning (07:30 → 19:30)' : 'Night (19:30 → 07:30)'}</b>.</dd>
                </div>
              </dl>
            }
          </QueryView>
        </Card>
      </div>
    </div>);

}