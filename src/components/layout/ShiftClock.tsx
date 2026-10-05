import React from 'react';
import { SunIcon } from 'lucide-react';
import { SERVER_NOW } from '../../utils/clock';

// Live shift indicator. Morning 07:30 → 19:30; handover window opens 19:15.
export function ShiftClock() {
  const start = new Date(SERVER_NOW);
  start.setHours(7, 30, 0, 0);
  const end = new Date(SERVER_NOW);
  end.setHours(19, 30, 0, 0);
  const progress = Math.min(1, (SERVER_NOW.getTime() - start.getTime()) / (end.getTime() - start.getTime()));
  const minsLeft = Math.round((end.getTime() - SERVER_NOW.getTime()) / 60000);
  return (
    <div className="rounded-xl border border-line bg-canvas p-3">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
          <SunIcon className="h-3.5 w-3.5 text-warning-600" aria-hidden /> Morning shift live
        </span>
        <span className="tabular text-xs text-ink-muted">18:52</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-warning" style={{ width: `${progress * 100}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-ink-muted">
        Ends 19:30 · <span className="font-semibold text-ink">{minsLeft} min</span> to night handover
      </p>
    </div>);

}