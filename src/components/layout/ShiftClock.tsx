import { MoonIcon, SunIcon } from 'lucide-react';
import { useDeviceClock } from '../../hooks/useDeviceClock';
import { businessTime, liveShift } from '../../utils/shiftTime';

// Live shift indicator. Morning 07:30 → 19:30; handover window opens 19:15.
export function ShiftClock() {
  const now = useDeviceClock();
  const current = liveShift(now);
  const Icon = current.shift === 'MORNING' ? SunIcon : MoonIcon;
  const hours = Math.floor(current.remainingSeconds / 3600);
  const minutes = Math.floor(current.remainingSeconds % 3600 / 60);
  const seconds = current.remainingSeconds % 60;
  return (
    <div className="rounded-xl border border-line bg-canvas p-3">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Icon className="h-3.5 w-3.5 text-primary" aria-hidden /> {current.shift === 'MORNING' ? 'Morning' : 'Night'} shift
        </span>
        <time className="tabular text-xs text-ink-muted" dateTime={now.toISOString()}>{businessTime(now)}</time>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-primary" style={{ width: `${current.progress * 100}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-ink-muted">
        Next shift {current.shift === 'MORNING' ? '19:30' : '07:30'} · <span className="font-semibold tabular text-ink">{[hours, minutes, seconds].map(n => String(n).padStart(2, '0')).join(':')}</span>
      </p>
      <p className="mt-1 text-[10px] text-ink-subtle">Asia/Colombo · device clock</p>
    </div>);

}
