import React from 'react';
import { getDay, parseISO } from 'date-fns';
import { MoonIcon, SunIcon } from 'lucide-react';
import type { AvailabilityDay, AvailabilityState, ShiftCode } from '../../types/domain';
import { TODAY } from '../../utils/clock';
import { cn } from '../../utils/cn';
import { fmtDate } from '../../utils/format';
import { MonthNav } from '../ui/MonthNav';
import { AvailabilityLegend, availClass } from './AvailabilityBoard';

interface Props {
  month: string;
  onMonth: (m: string) => void;
  days: AvailabilityDay[];
  freelancerId: string;
  editable: boolean;
  onToggle?: (date: string, shift: ShiftCode, current: AvailabilityState) => void;
  pendingKey?: string | null;
}

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Month grid with a separate Morning and Night slot per date.
export function AvailabilityCalendar({ month, onMonth, days, editable, onToggle, pendingKey }: Props) {
  const lead = days.length ? (getDay(parseISO(days[0].date)) + 6) % 7 : 0;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={month} onChange={onMonth} min="2026-09" max="2026-11" />
        <AvailabilityLegend />
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {WEEK.map((d) =>
        <div key={d} className="pb-1 text-center text-[11px] font-medium text-ink-subtle">{d}</div>
        )}
        {Array.from({ length: lead }).map((_, i) => <div key={`l${i}`} />)}
        {days.map((d) => {
          const past = d.date < TODAY;
          return (
            <div key={d.date} className={cn('rounded-xl border p-1.5', d.date === TODAY ? 'border-primary' : 'border-line', past && 'opacity-50')}>
              <p className="mb-1 text-[11px] font-semibold tabular">{fmtDate(d.date, 'd')}</p>
              <div className="space-y-1">
                {(['MORNING', 'NIGHT'] as ShiftCode[]).map((s) => {
                  const st = d[s];
                  const can = editable && !past && st !== 'ASSIGNED' && st !== 'CONFLICT';
                  const Icon = s === 'MORNING' ? SunIcon : MoonIcon;
                  return (
                    <button
                      key={s}
                      disabled={!can || pendingKey === `${d.date}-${s}`}
                      onClick={() => onToggle?.(d.date, s, st)}
                      className={cn('flex h-6 w-full items-center justify-center gap-1 rounded-md text-[10px] font-semibold ring-1 ring-inset disabled:cursor-default', availClass[st], pendingKey === `${d.date}-${s}` && 'animate-pulse')}
                      aria-label={`${fmtDate(d.date, 'MMMM d')} ${s.toLowerCase()} ${st.toLowerCase()}${can ? ', activate to change' : ''}`}>
                      
                      <Icon className="h-3 w-3" aria-hidden />
                      <span className="hidden sm:inline">{st === 'UNAVAILABLE' ? 'Unavail.' : st.charAt(0) + st.slice(1).toLowerCase()}</span>
                    </button>);

                })}
              </div>
            </div>);

        })}
      </div>
    </div>);

}