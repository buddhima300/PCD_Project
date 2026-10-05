import React from 'react';
import { cn } from '../../utils/cn';

interface CapacityMeterProps {
  used: number;
  capacity: number;
  label?: string;
  size?: 'sm' | 'md';
  showText?: boolean;
  suffix?: string;
  pending?: number;
}

// Discrete seats make small capacities (1, 3, 5) legible; larger pools fall back to a continuous bar.
export function CapacityMeter({ used, capacity, label, size = 'sm', showText = true, suffix = 'occupied', pending = 0 }: CapacityMeterProps) {
  const over = used > capacity;
  const full = used === capacity && capacity > 0;
  const discrete = capacity > 0 && capacity <= 14;
  const h = size === 'sm' ? 'h-1.5' : 'h-2.5';
  const tone = over ? 'bg-danger' : full ? 'bg-primary' : 'bg-primary-500';
  return (
    <div className="min-w-0" role="meter" aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={used} aria-label={`${label ?? 'Capacity'} ${used} of ${capacity} ${suffix}`}>
      {(label || showText) &&
      <div className="mb-1 flex items-baseline justify-between gap-2">
          {label && <span className="text-xs font-semibold text-ink">{label}</span>}
          {showText &&
        <span className={cn('tabular text-xs', over ? 'font-semibold text-danger-600' : full ? 'font-semibold text-primary-700' : 'text-ink-muted')}>
              {used} / {capacity}
              {over ? ' · OVER' : full ? ' · FULL' : ''}
            </span>
        }
        </div>
      }
      {discrete ?
      <div className="flex gap-0.5">
          {Array.from({ length: Math.max(capacity, used) }).map((_, i) =>
        <span
          key={i}
          className={cn(
            'flex-1 rounded-sm',
            h,
            i >= capacity ? 'bg-danger' : i < used - pending ? tone : i < used ? 'bg-warning' : 'bg-line'
          )} />

        )}
        </div> :

      <div className={cn('w-full overflow-hidden rounded-full bg-line', h)}>
          <div className={cn('h-full rounded-full', tone)} style={{ width: `${Math.min(100, capacity ? used / capacity * 100 : 0)}%` }} />
        </div>
      }
    </div>);

}