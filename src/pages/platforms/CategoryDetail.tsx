import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PlatformCard } from '../../components/platform/PlatformCard';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorState, LoadingBlock } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { api } from '../../services/api';
import { fmtDate } from '../../utils/format';

export function CategoryDetail() {
  const { code = '' } = useParams();
  const q = useQuery({ queryKey: ['category', code], queryFn: () => api.getCategory(code) });
  if (q.isPending) return <LoadingBlock rows={8} />;
  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const { category: c, platforms } = q.data;
  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Platform categories', to: '/categories' }, { label: c.code }]}
        title={c.code}
        meta={<StatusBadge status={c.status} />}
        description={c.description} />
      
      <Card className="mb-4">
        <dl className="grid grid-cols-2 divide-line md:grid-cols-5 md:divide-x">
          {[
          ['Platforms', `${c.activePlatforms} active / ${c.platformCount}`],
          ['Workstations', c.totalWorkstations],
          ['Assigned workforce', c.assignedWorkforce],
          ['Open incidents', c.activeIncidents],
          ['Updated', fmtDate(c.updatedAt)]].
          map(([l, v]) =>
          <div key={l} className="px-5 py-3.5">
              <dt className="text-xs text-ink-muted">{l}</dt>
              <dd className="mt-1 text-lg font-semibold tabular">{v}</dd>
            </div>
          )}
        </dl>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {platforms.map((p) =>
        <PlatformCard key={p.code} platform={p} />
        )}
      </div>
    </div>);

}