import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRightIcon } from 'lucide-react';

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: {label: string;to?: string;}[];
  meta?: React.ReactNode;
}

export function PageHeader({ title, description, actions, breadcrumbs, meta }: PageHeaderProps) {
  return (
    <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {breadcrumbs &&
        <nav aria-label="Breadcrumb" className="mb-1.5 flex flex-wrap items-center gap-1 text-xs text-ink-subtle">
            {breadcrumbs.map((b, i) =>
          <React.Fragment key={b.label}>
                {i > 0 && <ChevronRightIcon className="h-3 w-3" aria-hidden />}
                {b.to ?
            <Link to={b.to} className="hover:text-primary">
                    {b.label}
                  </Link> :

            <span className="text-ink-muted">{b.label}</span>
            }
              </React.Fragment>
          )}
          </nav>
        }
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl font-semibold tracking-tight text-ink md:text-[22px]">{title}</h1>
          {meta}
        </div>
        {description && <p className="mt-1 max-w-3xl text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>);

}