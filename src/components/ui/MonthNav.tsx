import React from 'react';
import { addMonths, format, parseISO } from 'date-fns';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

interface MonthNavProps {
  month: string;
  onChange: (m: string) => void;
  min?: string;
  max?: string;
}

export function MonthNav({ month, onChange, min, max }: MonthNavProps) {
  const shift = (n: number) => format(addMonths(parseISO(`${month}-01`), n), 'yyyy-MM');
  const prev = shift(-1);
  const next = shift(1);
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface p-0.5">
      <button onClick={() => onChange(prev)} disabled={Boolean(min && prev < min)} className="rounded-lg p-1.5 hover:bg-mist disabled:opacity-30" aria-label="Previous month">
        <ChevronLeftIcon className="h-4 w-4" />
      </button>
      <span className="min-w-[120px] text-center text-sm font-semibold" aria-live="polite">
        {format(parseISO(`${month}-01`), 'MMMM yyyy')}
      </span>
      <button onClick={() => onChange(next)} disabled={Boolean(max && next > max)} className="rounded-lg p-1.5 hover:bg-mist disabled:opacity-30" aria-label="Next month">
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    </div>);

}