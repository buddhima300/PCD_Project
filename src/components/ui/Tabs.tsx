import React from 'react';
import { cn } from '../../utils/cn';

interface TabsProps<T extends string> {
  tabs: {id: T;label: string;count?: number;}[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  variant?: 'underline' | 'pill';
}

export function Tabs<T extends string>({ tabs, value, onChange, className, variant = 'underline' }: TabsProps<T>) {
  const onKey = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = (idx + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };
  if (variant === 'pill') {
    return (
      <div role="tablist" className={cn('inline-flex rounded-xl border border-line bg-mist p-1', className)}>
        {tabs.map((t, i) =>
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          tabIndex={value === t.id ? 0 : -1}
          onKeyDown={(e) => onKey(e, i)}
          onClick={() => onChange(t.id)}
          className={cn(
            'whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150',
            value === t.id ? 'bg-surface text-ink shadow-card' : 'text-ink-muted hover:text-ink'
          )}>
          
            {t.label}
          </button>
        )}
      </div>);

  }
  return (
    <div role="tablist" className={cn('scroll-thin -mx-1 flex gap-1 overflow-x-auto border-b border-line px-1', className)}>
      {tabs.map((t, i) =>
      <button
        key={t.id}
        role="tab"
        aria-selected={value === t.id}
        tabIndex={value === t.id ? 0 : -1}
        onKeyDown={(e) => onKey(e, i)}
        onClick={() => onChange(t.id)}
        className={cn(
          '-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-150',
          value === t.id ? 'border-primary text-primary' : 'border-transparent text-ink-muted hover:text-ink'
        )}>
        
          {t.label}
          {t.count !== undefined &&
        <span className={cn('rounded-md px-1.5 text-[11px] tabular', value === t.id ? 'bg-primary-50 text-primary-700' : 'bg-mist text-ink-muted')}>{t.count}</span>
        }
        </button>
      )}
    </div>);

}