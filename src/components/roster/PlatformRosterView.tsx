import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MoonIcon, SunIcon } from 'lucide-react';
import { api } from '../../services/api';
import { cn } from '../../utils/cn';
import { deptNames, fmtShiftWindow } from '../../utils/format';
import { CapacityMeter } from '../ui/CapacityMeter';
import { QueryView } from '../ui/States';
import { StatusBadge } from '../ui/StatusBadge';

// Platform staffing by department and shift: who fills each seat, who is off/absent and which freelancer covers.
export function PlatformRosterView({ code, date, linkPeople = true }: {code: string;date: string;linkPeople?: boolean;}) {
  const q = useQuery({ queryKey: ['platform-roster', code, date], queryFn: () => api.getPlatformRoster(code, date) });
  return (
    <QueryView query={q}>
      {(r) =>
      <div className="grid gap-4 lg:grid-cols-2">
          {r.depts.map((d) =>
        <div key={d.dept} className="rounded-2xl border border-line bg-surface">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <p className="text-sm font-semibold">
                  {d.dept} <span className="font-normal text-ink-muted">· {deptNames[d.dept]}</span>
                </p>
                <span className="text-xs text-ink-muted">{d.capacity} workstation{d.capacity > 1 ? 's' : ''}</span>
              </div>
              <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                {d.shifts.map((s) =>
            <div key={s.shift} className="p-4">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                      {s.shift === 'MORNING' ? <SunIcon className="h-3.5 w-3.5 text-warning-600" /> : <MoonIcon className="h-3.5 w-3.5 text-primary" />}
                      {s.shift === 'MORNING' ? 'Morning' : 'Night'}
                      <span className="font-normal text-ink-subtle">· {fmtShiftWindow(s.shiftStart, s.shiftEnd).split('·').pop()}</span>
                    </div>
                    <CapacityMeter used={s.working} capacity={d.capacity} suffix="working" />
                    <ul className="mt-3 space-y-1">
                      {s.entries.length === 0 && <li className="text-xs text-ink-muted">No one rostered.</li>}
                      {s.entries.map((e) =>
                <li key={`${e.id}-${e.replacing ?? ''}`} className={cn('flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[12px]', e.isFreelancer && 'ml-3 bg-primary-50/60')}>
                          <span className="min-w-0 truncate">
                            {linkPeople ?
                    <Link to={e.isFreelancer ? `/freelancers/${e.id}` : `/employees/${e.id}`} className="font-mono font-medium hover:text-primary">
                                {e.id}
                              </Link> :

                    <span className="font-mono font-medium">{e.id}</span>
                    }
                            <span className="ml-1.5 text-ink-muted">{e.isFreelancer ? `covers ${e.replacing}` : e.name}</span>
                          </span>
                          <StatusBadge status={e.state} size="xs" />
                        </li>
                )}
                    </ul>
                  </div>
            )}
              </div>
            </div>
        )}
        </div>
      }
    </QueryView>);

}