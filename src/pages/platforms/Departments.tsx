import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LockIcon } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/PageHeader';
import { QueryView } from '../../components/ui/States';
import { Tabs } from '../../components/ui/Tabs';
import { DeptTag } from '../../components/ui/Tags';
import { api } from '../../services/api';

export function Departments() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') as 'departments' | 'positions' ?? 'departments';
  const depts = useQuery({ queryKey: ['departments'], queryFn: () => api.listDepartments() });
  const positions = useQuery({ queryKey: ['positions'], queryFn: () => api.listPositions(), enabled: tab === 'positions' });

  return (
    <div>
      <PageHeader title="Departments & positions" description="Departments are operational areas. Which departments run on a platform is set in platform configuration." />
      <Tabs className="mb-4" value={tab} onChange={(t) => setParams({ tab: t })} tabs={[{ id: 'departments', label: 'Departments' }, { id: 'positions', label: 'Positions' }]} />
      {tab === 'departments' ?
      <QueryView query={depts}>
          {(rows) =>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {rows.map((d) =>
          <Card key={d.code} className="flex flex-col p-5">
                  <div className="flex items-center gap-2">
                    <DeptTag dept={d.code} />
                    <h2 className="text-base font-semibold">{d.name}</h2>
                  </div>
                  <p className="mt-2 text-sm text-ink-muted">{d.description}</p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
                    {[
              ['Platforms', d.platforms],
              ['Workstations', d.workstations],
              ['Employees', d.employees],
              ['Freelancers', d.freelancers]].
              map(([l, v]) =>
              <div key={l}>
                        <dt className="text-xs text-ink-muted">{l}</dt>
                        <dd className="text-lg font-semibold tabular">{v}</dd>
                      </div>
              )}
                  </dl>
                  <p className="mt-auto flex items-center gap-1.5 pt-4 text-[11px] text-ink-subtle">
                    <LockIcon className="h-3 w-3" /> Permanent membership — department transfers are not supported.
                  </p>
                </Card>
          )}
            </div>
        }
        </QueryView> :

      <Card>
          <QueryView query={positions}>
            {(rows) =>
          <DataTable
            rows={rows}
            rowKey={(r) => r.title}
            columns={[
            { key: 'title', header: 'Position', cell: (r) => <span className="font-medium">{r.title}</span> },
            { key: 'dept', header: 'Department', cell: (r) => <DeptTag dept={r.dept} full /> },
            { key: 'level', header: 'Level', cell: (r) => r.level },
            { key: 'emp', header: 'Employees', align: 'right', cell: (r) => r.employees }]
            } />

          }
          </QueryView>
        </Card>
      }
    </div>);

}