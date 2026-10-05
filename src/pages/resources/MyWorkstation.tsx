import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LaptopIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { IdText, ShiftTag } from '../../components/ui/Tags';
import { api } from '../../services/api';
import { fmtTime } from '../../utils/format';

export function MyWorkstation() {
  const q = useQuery({ queryKey: ['my-work'], queryFn: () => api.getMyWork() });
  return (
    <div>
      <PageHeader title="My workstation" description="Laptops are shared pool resources — this is the workstation allocated to you for your shift." />
      <QueryView query={q}>
        {(w) => {
          const l = w.workstation;
          if (!l) return <Card><EmptyState icon={LaptopIcon} title="No workstation allocated" description="A workstation is allocated from your pool at shift start or handover." /></Card>;
          return (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <div className="flex items-center justify-between"><p className="font-mono text-2xl font-semibold">{l.workstationId}</p><StatusBadge status={l.status} /></div>
                <p className="text-sm text-ink-muted">{l.assetId} · {l.model} · {l.platformCode} / {l.dept}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-ink-muted">Current user</dt><dd><IdText>{l.currentUserId ?? '—'}</IdText></dd></div>
                  <div><dt className="text-xs text-ink-muted">Current shift</dt><dd>{l.currentShift ? <ShiftTag shift={l.currentShift} /> : '—'}</dd></div>
                  <div><dt className="text-xs text-ink-muted">Next user</dt><dd><IdText>{l.nextUserId ?? '—'}</IdText></dd></div>
                  <div><dt className="text-xs text-ink-muted">Condition</dt><dd><StatusBadge status={l.condition} size="xs" /></dd></div>
                </dl>
                <div className="mt-4 flex gap-2"><Link to="/handover"><Button size="sm">Handover</Button></Link><Link to="/report-issue"><Button size="sm" variant="secondary">Report issue</Button></Link></div>
              </Card>
              <Card>
                <CardHeader title="Upcoming handovers" />
                {w.handovers.length === 0 ? <EmptyState title="No handovers scheduled" /> :
                <ul className="mt-2 divide-y divide-line">
                    {w.handovers.map(({ handover: h, direction }) =>
                  <li key={h.id} className="flex items-center justify-between px-5 py-3 text-sm">
                        <span>{direction === 'INCOMING' ? 'Receive from' : 'Hand to'} <IdText>{direction === 'INCOMING' ? h.outgoingId : h.incomingId}</IdText> · {fmtTime(h.scheduledAt)}</span>
                        <StatusBadge status={h.status} size="xs" />
                      </li>
                  )}
                  </ul>
                }
              </Card>
            </div>);

        }}
      </QueryView>
    </div>);

}