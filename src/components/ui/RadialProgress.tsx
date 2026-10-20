import { useId } from 'react';
import { cn } from '../../utils/cn';

interface RadialProgressProps {
  value: number;
  max: number;
  label: string;
  tone?: 'lime' | 'orange' | 'violet' | 'danger';
  valueText?: string;
  display?: string;
  caption?: string;
  className?: string;
}

/** A shared, accessible ring. The visual arc is clamped; the text keeps the actual value. */
export function RadialProgress({ value, max, label, tone = 'lime', valueText, display, caption, className }: RadialProgressProps) {
  const id = useId();
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const fraction = safeMax ? Math.min(1, safeValue / safeMax) : 0;
  const circumference = 2 * Math.PI * 42;
  return <div
    className={cn('radial-progress relative h-28 w-28 shrink-0', className)} data-ring-tone={tone}
    role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={Math.max(1, safeMax, safeValue)}
    aria-valuenow={safeValue} aria-valuetext={valueText ?? `${safeValue} of ${safeMax}`}>
    <svg viewBox="0 0 104 104" className="h-full w-full -rotate-90" aria-hidden="true">
      <defs><linearGradient id={id} x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" className="ring-gradient-start" /><stop offset="100%" className="ring-gradient-end" />
      </linearGradient></defs>
      <circle cx="52" cy="52" r="42" fill="none" className="ring-track" strokeWidth="7" />
      <circle cx="52" cy="52" r="42" fill="none" stroke={`url(#${id})`} className="ring-arc" strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${circumference * fraction} ${circumference}`} opacity={fraction ? 1 : 0} />
    </svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <span className="ring-value tabular">{display ?? (safeMax ? `${safeValue}/${safeMax}` : '—')}</span>
      {caption && <span className="ring-caption">{caption}</span>}
    </div>
  </div>;
}
