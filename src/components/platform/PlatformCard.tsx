import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRightIcon, RefreshCwIcon, ShieldAlertIcon } from 'lucide-react';
import type { PlatformSummary, ShiftCode } from '../../types/domain';
import { cn } from '../../utils/cn';
import { CapacityMeter } from '../ui/CapacityMeter';
import { StatusBadge } from '../ui/StatusBadge';

interface PlatformCardProps {
  platform: PlatformSummary;
  mode?: 'live' | ShiftCode;
}

// Operational tile: live seat occupancy per department (or rostered headcount for a chosen shift).
export function PlatformCard({ platform: p, mode = 'live' }: PlatformCardProps) {
  const used = (o: PlatformSummary['occupancy'][number]) => mode === 'live' ? o.occupiedNow : mode === 'MORNING' ? o.morning : o.night;
  const total = p.occupancy.reduce((s, o) => s + used(o), 0);
  return (
    <Link
      to={`/platforms/${p.code}`}
      className={cn(
        'flex h-full flex-col rounded-2xl border bg-surface p-4 transition-[box-shadow,border-color] duration-150 hover:border-primary-200 hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        p.opStatus === 'INCIDENT' ? 'border-danger-100' : p.opStatus === 'WARNING' ? 'border-warning-100' : 'border-line',
        p.status !== 'ACTIVE' && 'opacity-70'
      )}>
      
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[15px] font-semibold text-ink">{p.code}</p>
          <p className="text-[11px] text-ink-subtle">
            {p.categoryCode} · {p.occupancy.length} depts · {p.totalWorkstations} seats
          </p>
        </div>
        <StatusBadge status={p.opStatus} size="xs" />
      </div>
      <div className="mt-3 space-y-2">
        {p.occupancy.map((o) =>
        <CapacityMeter key={o.dept} label={o.dept} used={used(o)} capacity={o.capacity} pending={mode === 'live' ? o.handoverPending : 0} />
        )}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3 text-[11px] text-ink-muted">
        <span className="tabular font-semibold text-ink">
          {total} / {p.totalWorkstations}
        </span>
        <span className="flex items-center gap-2.5">
          <span className={cn('inline-flex items-center gap-1', p.pendingReplacements > 0 && 'font-semibold text-warning-600')} title="Pending replacements">
            <RefreshCwIcon className="h-3 w-3" aria-hidden />
            {p.pendingReplacements}
            <span className="sr-only">pending replacements</span>
          </span>
          <span className={cn('inline-flex items-center gap-1', p.activeIncidents > 0 && 'font-semibold text-danger-600')} title="Open incidents">
            <ShieldAlertIcon className="h-3 w-3" aria-hidden />
            {p.activeIncidents}
            <span className="sr-only">open incidents</span>
          </span>
          <span className="inline-flex items-center gap-1" title="Handovers pending">
            <ArrowLeftRightIcon className="h-3 w-3" aria-hidden />
            {p.pendingHandovers}
            <span className="sr-only">handovers pending</span>
          </span>
        </span>
      </div>
    </Link>);

}