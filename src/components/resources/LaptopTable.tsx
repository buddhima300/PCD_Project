import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { Laptop } from '../../types/domain';
import { DataTable } from '../ui/DataTable';
import { StatusBadge } from '../ui/StatusBadge';
import { DeptTag, IdText, ShiftTag } from '../ui/Tags';

// Resource view: a laptop shows its CURRENT shift user and NEXT scheduled user — never a permanent owner.
export function LaptopTable({ rows, showPool = true }: {rows: Laptop[];showPool?: boolean;}) {
  const navigate = useNavigate();
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.assetId}
      caption="Laptops"
      onRowClick={(r) => navigate(`/laptops/${r.assetId}`)}
      columns={[
      { key: 'ws', header: 'Workstation', cell: (r) => <IdText className="font-semibold">{r.workstationId ?? '— unpooled'}</IdText> },
      { key: 'asset', header: 'Laptop', cell: (r) => <IdText className="text-ink-muted">{r.assetId}</IdText> },
      ...(showPool ?
      [{ key: 'pool', header: 'Pool', cell: (r: Laptop) => <span className="flex items-center gap-1.5">{r.platformCode} <DeptTag dept={r.dept} /></span> }] :
      []),
      { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
      {
        key: 'current',
        header: 'Current user',
        cell: (r) =>
        r.currentUserId ?
        <span className="flex items-center gap-1.5">
                <IdText>{r.currentUserId}</IdText>
                {r.currentShift && <ShiftTag shift={r.currentShift} />}
              </span> :

        <span className="text-ink-subtle">—</span>

      },
      { key: 'next', header: 'Next scheduled user', cell: (r) => r.nextUserId ? <IdText>{r.nextUserId}</IdText> : <span className="text-xs text-ink-subtle">{r.nextUserNote ?? '—'}</span> },
      { key: 'handover', header: 'Handover', cell: (r) => r.handoverStatus ? <StatusBadge status={r.handoverStatus} size="xs" /> : <span className="text-ink-subtle">—</span> },
      { key: 'condition', header: 'Condition', cell: (r) => <StatusBadge status={r.condition} size="xs" /> },
      { key: 'incident', header: 'Incident', cell: (r) => r.openIncidentId ? <IdText className="text-danger-600">{r.openIncidentId}</IdText> : <span className="text-ink-subtle">—</span> }]
      } />);


}