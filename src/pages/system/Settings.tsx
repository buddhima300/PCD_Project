import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { api } from '../../services/api';

export function Settings() {
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings() });
  return (
    <div>
      <PageHeader title="System settings" description="Operational rules are enforced by the backend. Values shown here are read from the server configuration." />
      <QueryView query={q}>
        {(s) =>
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <Card>
              <CardHeader title="Business rules" />
              <dl className="mt-2 divide-y divide-line">
                {s.rules.map((r) =>
              <div key={r.key} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <dt className="text-sm text-ink-muted">{r.label}</dt>
                    <dd className="text-sm font-semibold">{r.value}</dd>
                  </div>
              )}
              </dl>
            </Card>
            <Card className="h-fit">
              <CardHeader title="Integrations" />
              <ul className="mt-2 divide-y divide-line">
                {s.integrations.map((i) =>
              <li key={i.key} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span>{i.label}</span>
                    <StatusBadge status={i.status} size="xs" />
                  </li>
              )}
              </ul>
            </Card>
          </div>
        }
      </QueryView>
    </div>);

}