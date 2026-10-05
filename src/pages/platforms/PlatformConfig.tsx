import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MinusIcon, PlusIcon, SaveIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Field, Textarea } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { EmptyState, QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useReferenceData } from '../../hooks/useReferenceData';
import { api, errorMessage } from '../../services/api';
import type { DeptCapacity, DeptCode, EntityStatus } from '../../types/domain';
import { cn } from '../../utils/cn';
import { deptNames, fmtDateTime } from '../../utils/format';

const DEPTS: DeptCode[] = ['GS', 'DP', 'WD', 'SAFETY'];

export function PlatformConfig() {
  const { code } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { platforms } = useReferenceData();
  const [search, setSearch] = useState('');
  const selected = code ?? platforms[0]?.code;
  const detail = useQuery({ queryKey: ['platform', selected], queryFn: () => api.getPlatform(selected!), enabled: Boolean(selected) });
  const history = useQuery({ queryKey: ['config-history', selected], queryFn: () => api.getConfigHistory(selected!), enabled: Boolean(selected) });
  const [draft, setDraft] = useState<DeptCapacity>({});
  const [status, setStatus] = useState<EntityStatus>('ACTIVE');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (detail.data) {
      setDraft({ ...detail.data.platform.departments });
      setStatus(detail.data.platform.status);
      setReason('');
    }
  }, [detail.data]);

  const save = useMutation({
    mutationFn: () => api.updatePlatformConfig(selected!, { departments: draft, status, reason }),
    onSuccess: (p) => {
      toast.success(`${p.code} configuration saved`, { description: 'Change recorded in the audit log and managers notified.' });
      qc.invalidateQueries();
    }
  });

  const original = detail.data?.platform;
  const total = DEPTS.reduce((s, d) => s + (draft[d] ?? 0), 0);
  const dirty = original && (status !== original.status || DEPTS.some((d) => (draft[d] ?? 0) !== (original.departments[d] ?? 0)));

  return (
    <div>
      <PageHeader title="Platform configuration" description="Department workstation capacity per platform. Changes are validated by the backend against current assignments and fully audited." />
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <div className="border-b border-line p-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Find platform" />
          </div>
          <ul className="scroll-thin max-h-[560px] overflow-y-auto p-1.5">
            {platforms.
            filter((p) => !search || p.code.toLowerCase().includes(search.toLowerCase())).
            map((p) =>
            <li key={p.code}>
                  <button
                onClick={() => navigate(`/platform-config/${p.code}`)}
                className={cn('flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px]', p.code === selected ? 'bg-primary-50 font-semibold text-primary-700' : 'hover:bg-mist')}>
                
                    <span>{p.code}</span>
                    <span className="text-[11px] text-ink-subtle tabular">{p.totalWorkstations} seats{p.status !== 'ACTIVE' ? ' · inactive' : ''}</span>
                  </button>
                </li>
            )}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card>
            <QueryView query={detail}>
              {({ platform: p }) =>
              <div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                    <div>
                      <h2 className="text-lg font-semibold">
                        <Link to={`/platforms/${p.code}`} className="hover:text-primary">{p.code}</Link>
                      </h2>
                      <p className="text-xs text-ink-muted">{p.id} · Category {p.categoryCode}</p>
                    </div>
                    <div role="radiogroup" aria-label="Platform status" className="inline-flex rounded-xl border border-line bg-mist p-1">
                      {(['ACTIVE', 'INACTIVE'] as EntityStatus[]).map((s) =>
                    <button key={s} role="radio" aria-checked={status === s} onClick={() => setStatus(s)} className={cn('rounded-lg px-3 py-1.5 text-xs font-medium', status === s ? 'bg-surface text-ink shadow-card' : 'text-ink-muted')}>
                          {s === 'ACTIVE' ? 'Active' : 'Inactive'}
                        </button>
                    )}
                    </div>
                  </div>
                  <div className="divide-y divide-line">
                    {DEPTS.map((d) => {
                    const val = draft[d] ?? 0;
                    const occ = p.occupancy.find((o) => o.dept === d);
                    const changed = val !== (p.departments[d] ?? 0);
                    return (
                      <div key={d} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <input
                            type="checkbox"
                            id={`op-${d}`}
                            checked={val > 0}
                            onChange={(e) => setDraft({ ...draft, [d]: e.target.checked ? Math.max(1, p.departments[d] ?? 1) : 0 })}
                            className="h-4 w-4 rounded border-line-strong text-primary" />
                          
                            <label htmlFor={`op-${d}`}>
                              <span className="block text-sm font-semibold">{d} · {deptNames[d]}</span>
                              <span className="block text-xs text-ink-muted">{occ ? `Assigned per shift: morning ${occ.morning}, night ${occ.night}` : 'Not operating on this platform'}</span>
                            </label>
                          </div>
                          <div className="flex items-center gap-2">
                            {changed && <span className="text-[11px] font-medium text-warning-600">was {p.departments[d] ?? 'off'}</span>}
                            <button aria-label={`Decrease ${d} capacity`} disabled={val === 0} onClick={() => setDraft({ ...draft, [d]: Math.max(0, val - 1) })} className="flex h-8 w-8 items-center justify-center rounded-lg border border-line hover:bg-mist disabled:opacity-40">
                              <MinusIcon className="h-4 w-4" />
                            </button>
                            <span className="w-10 text-center text-base font-semibold tabular" aria-live="polite">{val}</span>
                            <button aria-label={`Increase ${d} capacity`} onClick={() => setDraft({ ...draft, [d]: val + 1 })} className="flex h-8 w-8 items-center justify-center rounded-lg border border-line hover:bg-mist">
                              <PlusIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>);

                  })}
                  </div>
                  <div className="border-t border-line px-5 py-4">
                    <div className="mb-3 flex items-center justify-between text-sm">
                      <span className="text-ink-muted">Total capacity</span>
                      <span className="text-lg font-semibold tabular">{total} workstations <span className="text-sm font-normal text-ink-muted">(was {p.totalWorkstations})</span></span>
                    </div>
                    <Field label="Change reason (recorded in audit log)" htmlFor="reason">
                      <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Withdrawal volume growth — Q4 forecast" />
                    </Field>
                    {save.isError && <p role="alert" className="mt-3 rounded-xl border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-600">{errorMessage(save.error)}</p>}
                    <div className="mt-3 flex justify-end gap-2">
                      <Button variant="ghost" size="sm" disabled={!dirty} onClick={() => {setDraft({ ...p.departments });setStatus(p.status);}}>Discard</Button>
                      <Button size="sm" disabled={!dirty} loading={save.isPending} icon={<SaveIcon className="h-3.5 w-3.5" />} onClick={() => save.mutate()}>Save configuration</Button>
                    </div>
                  </div>
                </div>
              }
            </QueryView>
          </Card>

          <Card>
            <CardHeader title="Configuration history" />
            <QueryView query={history} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No configuration changes recorded" />}>
              {(rows) =>
              <div className="mt-3">
                  <DataTable
                  rows={rows}
                  rowKey={(r) => r.id}
                  columns={[
                  { key: 'at', header: 'Timestamp', cell: (r) => fmtDateTime(r.at) },
                  { key: 'actor', header: 'Actor', cell: (r) => r.actorName },
                  { key: 'dept', header: 'Dept', cell: (r) => r.dept ?? '—' },
                  { key: 'prev', header: 'Previous', cell: (r) => <span className="text-ink-muted">{r.previous}</span> },
                  { key: 'next', header: 'New', cell: (r) => <span className="font-medium">{r.next}</span> },
                  { key: 'reason', header: 'Reason', cell: (r) => r.reason },
                  { key: 'status', header: '', cell: (r) => r.isOverride ? <StatusBadge status="OVERRIDE_APPROVED" label="Override" size="xs" /> : null }]
                  } />
                
                </div>
              }
            </QueryView>
          </Card>
        </div>
      </div>
    </div>);

}