import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightIcon, MoonIcon, SunIcon } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Tabs } from '../../components/ui/Tabs';
import { DeptTag } from '../../components/ui/Tags';
import { useReferenceData } from '../../hooks/useReferenceData';
import { api } from '../../services/api';
import type { RotationCycle } from '../../types/domain';
import { fmtDate, fmtDateTime } from '../../utils/format';

type Tab = 'platforms' | 'departments' | 'history';

function CycleCard({ c, title }: {c: RotationCycle;title: string;}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink-muted">{title}</p>
        <StatusBadge status={c.status} size="xs" />
      </div>
      <p className="mt-1 text-lg font-semibold">{c.label}</p>
      <p className="text-sm text-ink-muted">{fmtDate(c.start, 'MMM d')} → {fmtDate(c.end, 'MMM d, yyyy')}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-warning-50 p-3"><p className="flex items-center gap-1 text-xs text-warning-600"><SunIcon className="h-3.5 w-3.5" /> Morning</p><p className="text-xl font-semibold tabular">{c.morning}</p></div>
        <div className="rounded-xl bg-primary-50 p-3"><p className="flex items-center gap-1 text-xs text-primary-700"><MoonIcon className="h-3.5 w-3.5" /> Night</p><p className="text-xl font-semibold tabular">{c.night}</p></div>
      </div>
    </Card>);

}

export function Rotation() {
  const [tab, setTab] = useState<Tab>('platforms');
  const [cat, setCat] = useState('');
  const { categories } = useReferenceData();
  const q = useQuery({ queryKey: ['rotation'], queryFn: () => api.getRotation() });
  return (
    <div>
      <PageHeader title="Shift rotation" description="Permanent employees swap Morning ↔ Night every 3 months. Rotation results are computed by the backend scheduler." />
      <QueryView query={q}>
        {(r) =>
        <div className="space-y-4">
            <div className="grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
              <CycleCard c={r.current} title="Current cycle" />
              <ArrowRightIcon className="mx-auto hidden h-6 w-6 text-ink-subtle lg:block" aria-hidden />
              <CycleCard c={r.next} title={`Next cycle · swap ${fmtDate(r.next.start, 'MMM d')} 07:30`} />
            </div>
            <Card>
              <Tabs className="px-4" value={tab} onChange={setTab} tabs={[{ id: 'platforms', label: 'Platform rotation overview' }, { id: 'departments', label: 'Department rotation' }, { id: 'history', label: 'Rotation history' }]} />
              {tab === 'platforms' &&
            <>
                  <div className="border-b border-line p-3">
                    <Select compact className="w-40" aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)} placeholder="All categories" options={categories.map((c) => ({ value: c.code, label: c.code }))} />
                  </div>
                  <DataTable
                rows={r.platforms.filter((p) => !cat || p.categoryCode === cat)}
                rowKey={(p) => p.platformCode}
                columns={[
                { key: 'p', header: 'Platform', cell: (p) => <span className="font-semibold">{p.platformCode}</span> },
                { key: 'mn', header: 'Morning now', align: 'right', cell: (p) => p.morningNow },
                { key: 'nn', header: 'Night now', align: 'right', cell: (p) => p.nightNow },
                { key: 'arrow', header: '', cell: () => <ArrowRightIcon className="h-3.5 w-3.5 text-ink-subtle" /> },
                { key: 'mx', header: 'Morning from Oct 01', align: 'right', cell: (p) => p.morningNext },
                { key: 'nx', header: 'Night from Oct 01', align: 'right', cell: (p) => p.nightNext }]
                } />
              
                </>
            }
              {tab === 'departments' &&
            <DataTable
              rows={r.departments}
              rowKey={(d) => d.dept}
              columns={[
              { key: 'd', header: 'Department', cell: (d) => <DeptTag dept={d.dept} full /> },
              { key: 'mn', header: 'Morning now', align: 'right', cell: (d) => d.morningNow },
              { key: 'nn', header: 'Night now', align: 'right', cell: (d) => d.nightNow },
              { key: 'mx', header: 'Morning next', align: 'right', cell: (d) => d.morningNext },
              { key: 'nx', header: 'Night next', align: 'right', cell: (d) => d.nightNext }]
              } />

            }
              {tab === 'history' &&
            <DataTable
              rows={r.history}
              rowKey={(c) => c.id}
              columns={[
              { key: 'l', header: 'Cycle', cell: (c) => <span className="font-medium">{c.label}</span> },
              { key: 'range', header: 'Period', cell: (c) => `${fmtDate(c.start, 'MMM d, yyyy')} → ${fmtDate(c.end, 'MMM d, yyyy')}` },
              { key: 'm', header: 'Morning', align: 'right', cell: (c) => c.morning },
              { key: 'n', header: 'Night', align: 'right', cell: (c) => c.night },
              { key: 'ex', header: 'Executed', cell: (c) => c.executedAt ? fmtDateTime(c.executedAt) : '—' },
              { key: 'by', header: 'By', cell: (c) => c.executedBy },
              { key: 's', header: 'Status', cell: (c) => <StatusBadge status={c.status} size="xs" /> }]
              } />

            }
            </Card>
          </div>
        }
      </QueryView>
    </div>);

}