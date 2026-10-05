import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LockIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { CapacityMeter } from '../../components/ui/CapacityMeter';
import { Dialog } from '../../components/ui/Dialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { ScopeFilters, type Scope } from '../../components/ui/ScopeFilters';
import { QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Tabs } from '../../components/ui/Tabs';
import { api } from '../../services/api';
import type { DeptCode, DeptOccupancy, PlatformSummary, ShiftCode } from '../../types/domain';
import { cn } from '../../utils/cn';
import { deptNames } from '../../utils/format';

const DEPTS: DeptCode[] = ['GS', 'DP', 'WD', 'SAFETY'];
type Mode = 'live' | ShiftCode;

export function PlatformCapacity() {
  const [scope, setScope] = useState<Scope>({ category: '' });
  const [mode, setMode] = useState<Mode>('live');
  const [sel, setSel] = useState<{p: PlatformSummary;o: DeptOccupancy;} | null>(null);
  const q = useQuery({ queryKey: ['platforms', { category: scope.category }], queryFn: () => api.listPlatforms({ category: scope.category }) });
  const used = (o: DeptOccupancy) => mode === 'live' ? o.occupiedNow : mode === 'MORNING' ? o.morning : o.night;

  return (
    <div>
      <PageHeader title="Platform capacity" description="Workstation capacity per department is configured per platform. Cells show occupied / capacity; a dash means the department does not operate there." />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-3 md:flex-row md:items-center md:justify-between">
          <ScopeFilters value={scope} onChange={setScope} show={['category']} />
          <Tabs variant="pill" value={mode} onChange={setMode} tabs={[{ id: 'live', label: 'Live' }, { id: 'MORNING', label: 'Morning roster' }, { id: 'NIGHT', label: 'Night roster' }]} />
        </div>
        <QueryView query={q}>
          {(rows) =>
          <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-[13px]">
                <caption className="sr-only">Platform capacity matrix</caption>
                <thead>
                  <tr className="border-b border-line bg-mist/70 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                    <th scope="col" className="px-4 py-2.5 text-left">Platform</th>
                    {DEPTS.map((d) =>
                  <th key={d} scope="col" className="px-3 py-2.5 text-left">
                        {d} <span className="font-normal normal-case text-ink-subtle">· {deptNames[d]}</span>
                      </th>
                  )}
                    <th scope="col" className="px-3 py-2.5 text-left">Overall</th>
                    <th scope="col" className="px-4 py-2.5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                  const total = p.occupancy.reduce((s, o) => s + used(o), 0);
                  return (
                    <tr key={p.code} className={cn('border-b border-line last:border-0', p.status !== 'ACTIVE' && 'text-ink-subtle')}>
                        <th scope="row" className="whitespace-nowrap px-4 py-2 text-left">
                          <Link to={`/platforms/${p.code}`} className="font-semibold hover:text-primary">{p.code}</Link>
                          <span className="ml-1.5 text-[11px] font-normal text-ink-subtle">{p.categoryCode}</span>
                        </th>
                        {DEPTS.map((d) => {
                        const o = p.occupancy.find((x) => x.dept === d);
                        if (!o) return <td key={d} className="px-3 py-2 text-ink-subtle" aria-label={`${d} not operating`}>—</td>;
                        return (
                          <td key={d} className="px-3 py-2">
                              <button onClick={() => setSel({ p, o })} className="w-32 rounded-lg p-1.5 text-left hover:bg-mist" aria-label={`${p.code} ${d}: ${used(o)} of ${o.capacity}`}>
                                <CapacityMeter used={used(o)} capacity={o.capacity} pending={mode === 'live' ? o.handoverPending : 0} />
                              </button>
                            </td>);

                      })}
                        <td className="px-3 py-2 tabular font-semibold">{total} / {p.totalWorkstations}</td>
                        <td className="px-4 py-2"><StatusBadge status={p.opStatus} size="xs" /></td>
                      </tr>);

                })}
                </tbody>
              </table>
            </div>
          }
        </QueryView>
      </Card>
      <Dialog
        open={!!sel}
        onClose={() => setSel(null)}
        size="sm"
        title={sel ? `${sel.p.code} / ${sel.o.dept} workstation pool` : ''}
        description={sel ? `${sel.o.capacity} configured workstations` : ''}
        footer={sel && <Link to={`/pools/${sel.o.poolId}`}><Button size="sm">Open pool</Button></Link>}>
        
        {sel &&
        <div className="space-y-3">
            {sel.o.occupiedNow >= sel.o.capacity &&
          <div role="alert" className="rounded-xl border border-primary-100 bg-primary-50 p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-primary-700"><LockIcon className="h-4 w-4" /> PLATFORM CAPACITY REACHED</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {sel.p.code} {sel.o.dept} · {sel.o.occupiedNow} / {sel.o.capacity} occupied. No additional operational assignment can be created unless an authorized backend operation changes capacity or assignment state.
                </p>
              </div>
          }
            <CapacityMeter label="Live occupancy" used={sel.o.occupiedNow} capacity={sel.o.capacity} size="md" pending={sel.o.handoverPending} />
            <CapacityMeter label="Morning roster" used={sel.o.morning} capacity={sel.o.capacity} />
            <CapacityMeter label="Night roster" used={sel.o.night} capacity={sel.o.capacity} />
            <dl className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded-lg bg-canvas p-2"><dt className="text-ink-muted">Available</dt><dd className="text-base font-semibold">{sel.o.available}</dd></div>
              <div className="rounded-lg bg-canvas p-2"><dt className="text-ink-muted">Handover pending</dt><dd className="text-base font-semibold">{sel.o.handoverPending}</dd></div>
            </dl>
          </div>
        }
      </Dialog>
    </div>);

}