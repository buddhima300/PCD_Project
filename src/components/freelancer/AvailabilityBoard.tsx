import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '../../services/api';
import type { AvailabilityState, DeptCode, ShiftCode } from '../../types/domain';
import { TODAY } from '../../utils/clock';
import { cn } from '../../utils/cn';
import { deptNames, fmtDate } from '../../utils/format';
import { Card } from '../ui/Card';
import { Select } from '../ui/Field';
import { QueryView } from '../ui/States';

export const availClass: Record<AvailabilityState, string> = {
  AVAILABLE: 'bg-success-50 text-success-600 ring-success-100',
  ASSIGNED: 'bg-primary text-white ring-primary',
  UNAVAILABLE: 'bg-mist text-ink-subtle ring-line',
  OFF: 'bg-violet-50 text-violet-600 ring-violet-100',
  CONFLICT: 'bg-danger text-white ring-danger'
};
export const availShort: Record<AvailabilityState, string> = { AVAILABLE: 'AV', ASSIGNED: 'AS', UNAVAILABLE: '—', OFF: 'OFF', CONFLICT: '!' };
const cycle: Record<string, AvailabilityState> = { AVAILABLE: 'UNAVAILABLE', UNAVAILABLE: 'OFF', OFF: 'AVAILABLE' };

export function AvailabilityLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-ink-muted">
      {(Object.keys(availClass) as AvailabilityState[]).map((s) =>
      <span key={s} className="inline-flex items-center gap-1.5">
          <span className={cn('inline-flex h-4 min-w-6 items-center justify-center rounded px-1 text-[9px] font-bold ring-1 ring-inset', availClass[s])}>{availShort[s]}</span>
          {s.charAt(0) + s.slice(1).toLowerCase()}
        </span>
      )}
    </div>);

}

// Date × shift availability for every freelancer in a department. Managers can toggle non-assigned cells.
export function AvailabilityBoard() {
  const qc = useQueryClient();
  const [dept, setDept] = useState<DeptCode>('DP');
  const q = useQuery({ queryKey: ['availability-board', dept], queryFn: () => api.getAvailabilityBoard(dept, TODAY, 14) });
  const set = useMutation({
    mutationFn: (v: {id: string;date: string;shift: ShiftCode;state: AvailabilityState;}) => api.setAvailability(v.id, v.date, v.shift, v.state),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['availability-board'] }),
    onError: (e) => toast.error('Availability not changed', { description: errorMessage(e) })
  });
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3">
        <Select compact className="w-52" aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value as DeptCode)} options={(Object.keys(deptNames) as DeptCode[]).map((d) => ({ value: d, label: `${d} · ${deptNames[d]}` }))} />
        <AvailabilityLegend />
      </div>
      <QueryView query={q}>
        {(d) =>
        <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-[12px]">
              <caption className="sr-only">Freelancer availability by date and shift</caption>
              <thead>
                <tr className="border-b border-line bg-mist/70">
                  <th scope="col" className="sticky left-0 z-10 bg-mist px-4 py-2 text-left text-[11px] font-semibold uppercase text-ink-subtle">Freelancer</th>
                  {d.dates.map((date) =>
                <th key={date} scope="col" className="px-1 py-2 text-center text-[11px] font-medium text-ink-subtle">
                      {fmtDate(date, 'EEE d')}
                      <span className="mt-0.5 flex justify-center gap-1 text-[9px] font-normal"><span className="w-7">M</span><span className="w-7">N</span></span>
                    </th>
                )}
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) =>
              <tr key={r.freelancer.id} className="border-b border-line last:border-0">
                    <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-surface px-4 py-1.5 text-left font-normal">
                      <span className="mr-1 inline-block w-5 text-right text-ink-subtle tabular">{r.freelancer.priority}</span>
                      <Link to={`/freelancers/${r.freelancer.id}`} className="font-mono font-medium hover:text-primary">{r.freelancer.id}</Link>
                      {r.freelancer.status !== 'ACTIVE' && <span className="ml-1.5 text-[10px] text-danger-600">inactive</span>}
                    </th>
                    {r.days.map((day) =>
                <td key={day.date} className="px-1 py-1">
                        <div className="flex justify-center gap-1">
                          {(['MORNING', 'NIGHT'] as ShiftCode[]).map((s) => {
                      const st = day[s];
                      const editable = st !== 'ASSIGNED' && st !== 'CONFLICT';
                      return (
                        <button
                          key={s}
                          disabled={!editable || set.isPending}
                          onClick={() => set.mutate({ id: r.freelancer.id, date: day.date, shift: s, state: cycle[st] })}
                          className={cn('h-7 w-7 rounded text-[9px] font-bold ring-1 ring-inset disabled:cursor-default', availClass[st])}
                          aria-label={`${r.freelancer.id} ${fmtDate(day.date, 'MMM d')} ${s.toLowerCase()}: ${st.toLowerCase()}${editable ? ', activate to change' : ''}`}>
                          
                                {availShort[st]}
                              </button>);

                    })}
                        </div>
                      </td>
                )}
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        }
      </QueryView>
    </Card>);

}