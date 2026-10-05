import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import type { CapacityCell, DeptCode } from '../../types/domain';
import { cn } from '../../utils/cn';
import { fmtDate } from '../../utils/format';
import { Dialog } from '../ui/Dialog';
import { QueryView } from '../ui/States';
import { StatusBadge } from '../ui/StatusBadge';
import { DeptTag } from '../ui/Tags';

interface Props {
  start: string;
  days?: number;
  category?: string;
  platform?: string;
  dept?: DeptCode | '';
  onlyAlerts?: boolean;
}

const cellClass: Record<CapacityCell['state'], string> = {
  AVAILABLE: 'bg-surface text-ink-subtle',
  PARTIAL: 'bg-warning-50 text-warning-600',
  FULL: 'bg-primary text-white',
  CONFLICT: 'bg-danger text-white'
};

// Platform → Department → Date capacity matrix. Each cell is one capacity group (max 2 approved off).
export function OffDayCapacityGrid(props: Props) {
  const [sel, setSel] = useState<{platform: string;dept: DeptCode;cell: CapacityCell;} | null>(null);
  const q = useQuery({ queryKey: ['offday-capacity', props], queryFn: () => api.getOffDayCapacity({ ...props }) });
  return (
    <>
      <QueryView query={q} isEmpty={(d) => d.rows.length === 0}>
        {(d) =>
        <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-[12px]">
              <caption className="sr-only">Off-day capacity per platform, department and date</caption>
              <thead>
                <tr className="border-b border-line bg-mist/70">
                  <th scope="col" className="sticky left-0 z-10 bg-mist px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                    Platform / Dept
                  </th>
                  {d.dates.map((date) =>
                <th key={date} scope="col" className="px-1 py-2 text-center text-[11px] font-medium text-ink-subtle">
                      <span className="block">{fmtDate(date, 'EEE')}</span>
                      <span className="block font-semibold text-ink">{fmtDate(date, 'd')}</span>
                    </th>
                )}
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) =>
              <tr key={`${r.platformCode}-${r.dept}`} className="border-b border-line last:border-0">
                    <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-surface px-4 py-1.5 text-left font-medium">
                      <span className="mr-1.5">{r.platformCode}</span>
                      <DeptTag dept={r.dept} />
                    </th>
                    {r.cells.map((c) =>
                <td key={c.date} className="p-0.5 text-center">
                        <button
                    onClick={() => setSel({ platform: r.platformCode, dept: r.dept, cell: c })}
                    className={cn('h-8 w-11 rounded-md text-[11px] font-semibold tabular ring-1 ring-inset ring-line transition-transform duration-100 active:scale-95', cellClass[c.state])}
                    aria-label={`${r.platformCode} ${r.dept} ${fmtDate(c.date, 'MMMM d')}: ${c.approved} of ${c.limit} off, ${c.state.toLowerCase()}`}>
                    
                          {c.approved}/{c.limit}
                        </button>
                      </td>
                )}
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        }
      </QueryView>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2.5 text-[11px] text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm ring-1 ring-line" /> 0 / 2 available</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-warning-50 ring-1 ring-warning-100" /> 1 / 2 partial</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-primary" /> 2 / 2 full</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-danger" /> Over limit (manager override)</span>
      </div>
      <Dialog open={!!sel} onClose={() => setSel(null)} title={sel ? `${sel.platform} / ${sel.dept} · ${fmtDate(sel.cell.date, 'MMMM d')}` : ''} description="Capacity group: Platform + Department + Date" size="sm">
        {sel &&
        <div>
            <div className="flex items-center justify-between rounded-xl bg-canvas p-3">
              <span className="text-sm font-semibold tabular">
                {sel.cell.approved} / {sel.cell.limit} OFF
              </span>
              <StatusBadge status={sel.cell.state} />
            </div>
            {sel.cell.employees.length === 0 ?
          <p className="mt-3 text-sm text-ink-muted">No approved off-days in this group.</p> :

          <ul className="mt-3 divide-y divide-line">
                {sel.cell.employees.map((e) =>
            <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      <span className="font-mono text-xs">{e.id}</span> <span className="text-ink-muted">{e.name}</span>
                    </span>
                    <StatusBadge status={e.status} size="xs" />
                  </li>
            )}
              </ul>
          }
          </div>
        }
      </Dialog>
    </>);

}