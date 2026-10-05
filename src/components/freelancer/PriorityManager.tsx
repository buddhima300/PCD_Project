import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon, SaveIcon } from 'lucide-react';
import { api, errorMessage } from '../../services/api';
import type { DeptCode, Freelancer } from '../../types/domain';
import { cn } from '../../utils/cn';
import { deptNames, fmtDateTime } from '../../utils/format';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Field, Input, Select } from '../ui/Field';
import { EmptyState, QueryView } from '../ui/States';
import { StatusBadge } from '../ui/StatusBadge';
import { IdText } from '../ui/Tags';

// Manager-controlled priority. Order never rotates automatically after an assignment.
export function PriorityManager() {
  const qc = useQueryClient();
  const [dept, setDept] = useState<DeptCode>('DP');
  const [order, setOrder] = useState<Freelancer[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: ['freelancers', { dept, pageSize: 100 }], queryFn: () => api.listFreelancers({ dept, pageSize: 100, sort: 'priority' }) });
  const history = useQuery({ queryKey: ['priority-history', dept], queryFn: () => api.getPriorityHistory(dept) });
  useEffect(() => {
    if (q.data) setOrder(q.data.items);
  }, [q.data]);
  const dirty = q.data && order.some((f, i) => f.id !== q.data.items[i]?.id);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setOrder(next);
  };
  const save = useMutation({
    mutationFn: () => api.updatePriority(dept, order.map((f) => f.id), reason),
    onSuccess: () => {
      toast.success(`${dept} priority saved`, { description: 'Recorded in the audit log.' });
      setReason('');
      qc.invalidateQueries({ queryKey: ['freelancers'] });
      qc.invalidateQueries({ queryKey: ['priority-history'] });
    }
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
          <Select compact className="w-52" aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value as DeptCode)} options={(Object.keys(deptNames) as DeptCode[]).map((d) => ({ value: d, label: `${d} · ${deptNames[d]}` }))} />
          <p className="text-xs text-ink-muted">Drag rows or use the arrows. Replacement selection uses the first eligible freelancer in this order.</p>
        </div>
        <QueryView query={q}>
          {() =>
          <ol className="divide-y divide-line">
              {order.map((f, i) =>
            <li
              key={f.id}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIdx !== null) move(dragIdx, i);
                setDragIdx(null);
              }}
              className={cn('flex items-center gap-3 px-4 py-2.5', dragIdx === i && 'bg-primary-50', f.status !== 'ACTIVE' && 'text-ink-subtle')}>
              
                  <GripVerticalIcon className="h-4 w-4 cursor-grab text-ink-subtle" aria-hidden />
                  <span className="w-8 text-center text-sm font-semibold tabular">{i + 1}</span>
                  <IdText>{f.id}</IdText>
                  <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                  <span className="hidden text-xs text-ink-muted md:inline">{f.compatibleCategories.join(' · ')}</span>
                  <StatusBadge status={f.status} size="xs" />
                  <div className="flex">
                    <button onClick={() => move(i, i - 1)} disabled={i === 0} className="rounded-md p-1.5 hover:bg-mist disabled:opacity-30" aria-label={`Move ${f.id} up`}>
                      <ArrowUpIcon className="h-4 w-4" />
                    </button>
                    <button onClick={() => move(i, i + 1)} disabled={i === order.length - 1} className="rounded-md p-1.5 hover:bg-mist disabled:opacity-30" aria-label={`Move ${f.id} down`}>
                      <ArrowDownIcon className="h-4 w-4" />
                    </button>
                  </div>
                </li>
            )}
            </ol>
          }
        </QueryView>
        <div className="flex flex-col gap-2 border-t border-line p-4 sm:flex-row sm:items-end">
          <Field label="Reason for change" htmlFor="prio-reason" className="flex-1">
            <Input id="prio-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. FL-00118 cleared for REX platforms" />
          </Field>
          <Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()} icon={<SaveIcon className="h-4 w-4" />}>
            Save priority
          </Button>
        </div>
        {save.isError && <p role="alert" className="mx-4 mb-4 rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger-600">{errorMessage(save.error)}</p>}
      </Card>
      <Card className="h-fit">
        <CardHeader title="Priority history" description={`${dept} department`} />
        <QueryView query={history} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No priority changes yet" className="py-8" />}>
          {(rows) =>
          <ul className="mt-2 divide-y divide-line">
              {rows.map((r) =>
            <li key={r.id} className="px-5 py-3 text-[13px]">
                  <p className="font-medium">{r.actorName}</p>
                  <p className="text-xs text-ink-muted">{fmtDateTime(r.at)}</p>
                  <p className="mt-1 text-xs"><span className="text-ink-subtle">{r.previous}</span> → <span className="font-medium">{r.next}</span></p>
                  <p className="mt-0.5 text-xs text-ink-muted">“{r.reason}”</p>
                </li>
            )}
            </ul>
          }
        </QueryView>
      </Card>
    </div>);

}