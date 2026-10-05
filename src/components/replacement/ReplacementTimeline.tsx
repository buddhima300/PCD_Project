import React from 'react';
import { CheckIcon, CircleIcon, XIcon } from 'lucide-react';
import type { TimelineStep } from '../../types/domain';
import { cn } from '../../utils/cn';
import { fmtDateTime } from '../../utils/format';

export function ReplacementTimeline({ steps }: {steps: TimelineStep[];}) {
  return (
    <ol className="relative space-y-0">
      {steps.map((s, i) =>
      <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
          {i < steps.length - 1 && <span className={cn('absolute left-[11px] top-6 h-[calc(100%-16px)] w-px', s.state === 'done' ? 'bg-primary-200' : 'bg-line')} aria-hidden />}
          <span
          className={cn(
            'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 ring-inset',
            s.state === 'done' && 'bg-primary text-white ring-primary',
            s.state === 'current' && 'bg-warning-50 text-warning-600 ring-warning-100',
            s.state === 'failed' && 'bg-danger text-white ring-danger',
            s.state === 'upcoming' && 'bg-surface text-ink-subtle ring-line'
          )}>
          
            {s.state === 'done' ? <CheckIcon className="h-3.5 w-3.5" /> : s.state === 'failed' ? <XIcon className="h-3.5 w-3.5" /> : <CircleIcon className="h-2 w-2 fill-current" />}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className={cn('text-[13px] font-medium', s.state === 'upcoming' ? 'text-ink-subtle' : 'text-ink')}>
              {s.label}
              <span className="sr-only"> — {s.state}</span>
            </p>
            {(s.detail || s.at) &&
          <p className="text-xs text-ink-muted">
                {s.detail}
                {s.detail && s.at ? ' · ' : ''}
                {s.at && fmtDateTime(s.at)}
              </p>
          }
          </div>
        </li>
      )}
    </ol>);

}