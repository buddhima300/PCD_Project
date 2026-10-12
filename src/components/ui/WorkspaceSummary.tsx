import type { ReactNode } from 'react';

export function WorkspaceSummary({ items, label }: { items: { label: string; value: ReactNode; note?: string }[]; label: string }) {
  return <dl aria-label={label} className={`workspace-summary mb-6 grid grid-cols-2 gap-y-4 border-b border-line pb-5 sm:grid-cols-3 ${items.length === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-5'}`}>
    {items.map(item => <div key={item.label} className="border-l border-line px-4 first:border-l-0"><dt className="text-xs text-ink-muted">{item.label}</dt><dd className="mt-1 text-2xl font-semibold tabular">{item.value ?? '—'}</dd>{item.note && <p className="mt-1 text-xs text-ink-subtle">{item.note}</p>}</div>)}
  </dl>;
}
