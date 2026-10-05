import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlatformCard } from '../../components/platform/PlatformCard';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { ScopeFilters, type Scope } from '../../components/ui/ScopeFilters';
import { QueryView, Skeleton } from '../../components/ui/States';
import { Tabs } from '../../components/ui/Tabs';
import { api } from '../../services/api';
import type { ShiftCode } from '../../types/domain';

type Mode = 'live' | ShiftCode;

export function PlatformOperations() {
  const [scope, setScope] = useState<Scope>({ category: '', platform: '', dept: '', shift: '' });
  const [opStatus, setOpStatus] = useState('');
  const [mode, setMode] = useState<Mode>('live');
  const q = useQuery({ queryKey: ['platforms', { ...scope, opStatus }], queryFn: () => api.listPlatforms({ category: scope.category, dept: scope.dept, opStatus }) });

  return (
    <div>
      <PageHeader
        title="Platform operations"
        description="Every platform with its own department mix and workstation count. Seat meters show live occupancy or rostered headcount per shift." />
      
      <Card className="mb-4 flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
        <ScopeFilters value={scope} onChange={setScope} show={['category', 'platform', 'dept']}>
          <Select
            compact
            aria-label="Operational status"
            className="w-40"
            value={opStatus}
            onChange={(e) => setOpStatus(e.target.value)}
            placeholder="Any status"
            options={['OPERATIONAL', 'FULL', 'WARNING', 'INCIDENT', 'INACTIVE'].map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))} />
          
        </ScopeFilters>
        <Tabs
          variant="pill"
          value={mode}
          onChange={setMode}
          tabs={[
          { id: 'live', label: 'Live occupancy' },
          { id: 'MORNING', label: 'Morning roster' },
          { id: 'NIGHT', label: 'Night roster' }]
          } />
        
      </Card>
      <QueryView
        query={q}
        loading={<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-56" />)}</div>}
        isEmpty={(d) => d.filter((p) => !scope.platform || p.code === scope.platform).length === 0}>
        
        {(data) => {
          const list = data.filter((p) => !scope.platform || p.code === scope.platform);
          const cats = [...new Set(list.map((p) => p.categoryCode))];
          return (
            <div className="space-y-6">
              {cats.map((c) => {
                const ps = list.filter((p) => p.categoryCode === c);
                const seats = ps.reduce((s, p) => s + p.totalWorkstations, 0);
                const used = ps.reduce((s, p) => s + p.currentWorkforce, 0);
                return (
                  <section key={c} aria-labelledby={`cat-${c}`}>
                    <div className="mb-2 flex items-baseline gap-3">
                      <h2 id={`cat-${c}`} className="text-sm font-semibold">
                        {c}
                      </h2>
                      <span className="text-xs text-ink-muted tabular">
                        {ps.length} platforms · {used} / {seats} seats occupied now
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                      {ps.map((p) =>
                      <PlatformCard key={p.code} platform={p} mode={mode} />
                      )}
                    </div>
                  </section>);

              })}
            </div>);

        }}
      </QueryView>
    </div>);

}