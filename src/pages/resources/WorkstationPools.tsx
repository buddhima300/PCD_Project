import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRightIcon, ShieldAlertIcon, WrenchIcon } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { CapacityMeter } from '../../components/ui/CapacityMeter';
import { Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { ScopeFilters, type Scope } from '../../components/ui/ScopeFilters';
import { QueryView } from '../../components/ui/States';
import { Tabs } from '../../components/ui/Tabs';
import { api, type PoolQuery } from '../../services/api';
import { cn } from '../../utils/cn';

export function WorkstationPools() {
  const [scope, setScope] = useState<Scope>({ category: '', platform: '', dept: '' });
  const [state, setState] = useState<PoolQuery['state']>('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const query: PoolQuery = { ...scope, state };
  const q = useQuery({ queryKey: ['pools', query], queryFn: () => api.listPools(query) });

  return (
    <div>
      <PageHeader title="Workstation pools" description="Laptops belong to a platform + department pool and are shared between Morning and Night via recorded handovers — never owned by an employee." />
      <Card className="mb-4 flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
        <ScopeFilters value={scope} onChange={setScope} show={['category', 'platform', 'dept']}>
          <Select compact className="w-48" aria-label="Pool state" value={state} onChange={(e) => setState(e.target.value as PoolQuery['state'])} placeholder="Any pool state" options={[{ value: 'full', label: 'Full pools' }, { value: 'available', label: 'Has available seats' }, { value: 'handover', label: 'Handover pending' }, { value: 'incident', label: 'Has incidents' }]} />
        </ScopeFilters>
        <Tabs variant="pill" value={view} onChange={setView} tabs={[{ id: 'grid', label: 'Grid' }, { id: 'list', label: 'List' }]} />
      </Card>
      <QueryView query={q} isEmpty={(d) => d.length === 0}>
        {(pools) =>
        view === 'grid' ?
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              {pools.map((p) =>
          <Link key={p.id} to={`/pools/${p.id}`} className={cn('flex flex-col rounded-2xl border border-line bg-surface p-4 transition-[border-color,box-shadow] duration-150 hover:border-primary-200 hover:shadow-pop', p.platformStatus !== 'ACTIVE' && 'opacity-60')}>
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-semibold">{p.platformCode} / {p.dept}</p>
                    <span className="text-[11px] text-ink-subtle">{p.capacity} seats</span>
                  </div>
                  <div className="mt-3"><CapacityMeter used={p.occupied} capacity={p.capacity} pending={p.handoverPending} /></div>
                  <div className="mt-3 flex items-center gap-3 text-[11px] text-ink-muted">
                    <span className="font-semibold text-success-600">{p.available} available</span>
                    {p.handoverPending > 0 && <span className="inline-flex items-center gap-1 text-warning-600"><ArrowLeftRightIcon className="h-3 w-3" />{p.handoverPending}</span>}
                    {p.maintenance > 0 && <span className="inline-flex items-center gap-1"><WrenchIcon className="h-3 w-3" />{p.maintenance}</span>}
                    {p.incidents > 0 && <span className="inline-flex items-center gap-1 text-danger-600"><ShieldAlertIcon className="h-3 w-3" />{p.incidents}</span>}
                  </div>
                </Link>
          )}
            </div> :

        <Card>
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[720px] text-[13px]">
                  <thead>
                    <tr className="border-b border-line bg-mist/70 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                      <th className="px-4 py-2.5">Pool</th><th className="px-3 py-2.5">Occupancy</th><th className="px-3 py-2.5 text-right">Available</th><th className="px-3 py-2.5 text-right">Handover</th><th className="px-3 py-2.5 text-right">Maintenance</th><th className="px-4 py-2.5 text-right">Incidents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pools.map((p) =>
                <tr key={p.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-2"><Link to={`/pools/${p.id}`} className="font-semibold hover:text-primary">{p.platformCode} / {p.dept}</Link><span className="ml-2 font-mono text-[11px] text-ink-subtle">{p.id}</span></td>
                        <td className="w-48 px-3 py-2"><CapacityMeter used={p.occupied} capacity={p.capacity} pending={p.handoverPending} /></td>
                        <td className="px-3 py-2 text-right tabular">{p.available}</td>
                        <td className="px-3 py-2 text-right tabular">{p.handoverPending}</td>
                        <td className="px-3 py-2 text-right tabular">{p.maintenance}</td>
                        <td className="px-4 py-2 text-right tabular">{p.incidents}</td>
                      </tr>
                )}
                  </tbody>
                </table>
              </div>
            </Card>

        }
      </QueryView>
    </div>);

}