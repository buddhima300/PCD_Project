import React from 'react';
import { cn } from '../../utils/cn';

export function Card({ className, children, as: As = 'section' }: {className?: string;children: React.ReactNode;as?: 'section' | 'div' | 'article';}) {
  return <As className={cn('rounded-2xl border border-line bg-surface shadow-card', className)}>{children}</As>;
}

interface CardHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}

export function CardHeader({ title, description, action, className, icon }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-4', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>);

}