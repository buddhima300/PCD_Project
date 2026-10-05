import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRightIcon, ShieldAlertIcon } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingBlock } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DeptTag, IdText, ShiftTag } from '../../components/ui/Tags';
import { api } from '../../services/api';
import { fmtDate, fmtDateTime } from '../../utils/format';

export function LaptopDetail() {
  const { assetId = '' } = useParams();
  const q = useQuery({ queryKey: ['laptop', assetId], queryFn: () => api.getLaptop(assetId) });
  if (q.isPending) return <LoadingBlock rows={8} />;
  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const { laptop: l, history } = q.data;
  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Laptops', to: '/laptops' }, { label: l.assetId }]}
        title={l.workstationId ?? l.assetId}
        meta={<><StatusBadge status={l.status} /><StatusBadge status={l.condition} /></>}
        description={`${l.assetId} · ${l.model} · Serial ${l.serial} · purchased ${fmtDate(l.purchasedAt)}`} />
      
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Resource assignment</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-ink-muted">Pool</dt><dd><Link to={`/pools/${l.poolId}`} className="flex items-center gap-1.5 hover:text-primary">{l.platformCode} <DeptTag dept={l.dept} /></Link></dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Current user</dt><dd>{l.currentUserId ? <IdText>{l.currentUserId}</IdText> : '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Current shift</dt><dd>{l.currentShift ? <ShiftTag shift={l.currentShift} /> : '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Next scheduled user</dt><dd className="text-right">{l.nextUserId ? <IdText>{l.nextUserId}</IdText> : <span className="text-xs text-ink-subtle">{l.nextUserNote ?? '—'}</span>}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Handover</dt><dd>{l.handoverStatus ? <StatusBadge status={l.handoverStatus} size="xs" /> : '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Open incident</dt><dd>{l.openIncidentId ? <IdText className="text-danger-600">{l.openIncidentId}</IdText> : 'None'}</dd></div>
            </dl>
            <p className="mt-4 rounded-lg bg-canvas p-2.5 text-[11px] text-ink-muted">This laptop is an operational resource of the {l.platformCode} / {l.dept} pool. Users change at each shift handover.</p>
          </Card>
        </div>
        <Card>
          <CardHeader title="Chronological history" description="Handovers and incidents, newest first" />
          {history.length === 0 ? <EmptyState title="No history yet" /> :
          <ol className="p-5 pt-4">
              {history.map((h, i) =>
            <li key={`${h.at}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < history.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-px bg-line" aria-hidden />}
                  <span className={h.kind === 'INCIDENT' ? 'z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-danger-50 text-danger-600' : 'z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary'}>
                    {h.kind === 'INCIDENT' ? <ShieldAlertIcon className="h-3.5 w-3.5" /> : <ArrowLeftRightIcon className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[13px] font-medium">{h.kind === 'HANDOVER' ? <span className="font-mono">{h.title}</span> : h.title}</p>
                      <StatusBadge status={h.status} size="xs" />
                    </div>
                    <p className="text-xs text-ink-muted">{h.detail} · {fmtDateTime(h.at)}</p>
                  </div>
                </li>
            )}
            </ol>
          }
        </Card>
      </div>
    </div>);

}