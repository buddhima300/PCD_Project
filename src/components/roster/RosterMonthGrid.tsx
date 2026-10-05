import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { RosterRow, RosterState } from '../../types/domain';
import { TODAY } from '../../utils/clock';
import { cn } from '../../utils/cn';
import { fmtDate } from '../../utils/format';
import { DeptTag } from '../ui/Tags';

export const rosterCell: Record<RosterState, {cls: string;short: string;}> = {
  WORKING: { cls: 'bg-success-50 text-success-600', short: 'W' },
  OFF: { cls: 'bg-violet-50 text-violet-600', short: 'O' },
  ABSENT: { cls: 'bg-danger text-white', short: 'A' },
  REPLACED: { cls: 'bg-primary text-white', short: 'R' },
  LEAVE: { cls: 'bg-warning-50 text-warning-600', short: 'L' }
};

export function RosterLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-ink-muted">
      {(Object.keys(rosterCell) as RosterState[]).map((s) =>
      <span key={s} className="inline-flex items-center gap-1.5">
          <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold', rosterCell[s].cls)}>{rosterCell[s].short}</span>
          {s.charAt(0) + s.slice(1).toLowerCase()}
        </span>
      )}
    </div>);

}

// Virtualised month roster — only visible rows are in the DOM, so hundreds of employees stay fast.
export function RosterMonthGrid({ days, rows, height = 620, linkRows = true }: {days: string[];rows: RosterRow[];height?: number;linkRows?: boolean;}) {
  const ref = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => ref.current, estimateSize: () => 34, overscan: 12 });
  const template = `260px repeat(${days.length}, 30px)`;
  return (
    <div ref={ref} className="scroll-thin overflow-auto" style={{ maxHeight: height }} role="table" aria-label="Monthly roster" aria-rowcount={rows.length}>
      <div style={{ width: 260 + days.length * 30 + 16 }}>
        <div role="row" className="sticky top-0 z-20 grid border-b border-line bg-mist" style={{ gridTemplateColumns: template }}>
          <div role="columnheader" className="sticky left-0 z-10 bg-mist px-3 py-2 text-[11px] font-semibold uppercase text-ink-subtle">Employee</div>
          {days.map((d) =>
          <div role="columnheader" key={d} className={cn('py-1 text-center text-[10px] leading-tight text-ink-subtle', d === TODAY && 'rounded-t bg-primary-100 font-semibold text-primary-700')}>
              <div>{fmtDate(d, 'EEEEE')}</div>
              <div className="font-semibold text-ink">{fmtDate(d, 'd')}</div>
            </div>
          )}
        </div>
        <div style={{ height: v.getTotalSize(), position: 'relative' }}>
          {v.getVirtualItems().map((it) => {
            const r = rows[it.index];
            return (
              <div key={r.employeeId} role="row" className="absolute left-0 grid items-center border-b border-line" style={{ gridTemplateColumns: template, height: it.size, transform: `translateY(${it.start}px)`, width: '100%' }}>
                <div role="rowheader" className="sticky left-0 z-10 flex h-full items-center gap-1.5 truncate bg-surface px-3 text-[12px]">
                  {linkRows ? <Link to={`/employees/${r.employeeId}`} className="font-mono font-medium hover:text-primary">{r.employeeId}</Link> : <span className="font-mono font-medium">{r.employeeId}</span>}
                  <span className="text-ink-subtle">{r.platformCode}</span>
                  <DeptTag dept={r.dept} />
                  <span className={cn('rounded px-1 text-[10px] font-semibold', r.shift === 'MORNING' ? 'bg-warning-50 text-warning-600' : 'bg-primary-50 text-primary-700')}>{r.shift === 'MORNING' ? 'M' : 'N'}</span>
                </div>
                {r.cells.map((c) =>
                <div key={c.date} role="cell" className="flex justify-center">
                    <span title={`${fmtDate(c.date, 'MMM d')}: ${c.state}${c.note ? ` · ${c.note}` : ''}`} className={cn('flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold', rosterCell[c.state].cls)}>
                      {rosterCell[c.state].short}
                      <span className="sr-only">{c.state}</span>
                    </span>
                  </div>
                )}
              </div>);

          })}
        </div>
      </div>
    </div>);

}