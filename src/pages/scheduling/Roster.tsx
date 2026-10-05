import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PlatformRosterView } from '../../components/roster/PlatformRosterView';
import { RosterLegend, RosterMonthGrid } from '../../components/roster/RosterMonthGrid';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Input, Select } from '../../components/ui/Field';
import { MonthNav } from '../../components/ui/MonthNav';
import { PageHeader } from '../../components/ui/PageHeader';
import { ScopeFilters, type Scope } from '../../components/ui/ScopeFilters';
import { SearchInput } from '../../components/ui/SearchInput';
import { EmptyState, QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Tabs } from '../../components/ui/Tabs';
import { DeptTag, IdText, ShiftTag } from '../../components/ui/Tags';
import { useReferenceData } from '../../hooks/useReferenceData';
import { api } from '../../services/api';
import type { DeptCode, RosterState } from '../../types/domain';
import { TODAY } from '../../utils/clock';
import { deptNames, fmtShiftWindow } from '../../utils/format';

type View = 'monthly' | 'daily' | 'platform' | 'department';
const STATES: RosterState[] = ['WORKING', 'OFF', 'ABSENT', 'REPLACED', 'LEAVE'];

export function Roster() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') as View ?? 'monthly';
  const { platforms } = useReferenceData();
  const [scope, setScope] = useState<Scope>({ category: '', platform: '', dept: '', shift: '' });
  const [state, setState] = useState<RosterState | ''>('');
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState(TODAY.slice(0, 7));
  const [date, setDate] = useState(TODAY);
  const [platform, setPlatform] = useState('KANE-13');
  const [dept, setDept] = useState<DeptCode>('DP');

  const monthly = useQuery({ queryKey: ['roster', month, scope, state, search], queryFn: () => api.getRoster({ month, ...scope, state, search }), enabled: view === 'monthly', placeholderData: keepPreviousData });
  const daily = useQuery({ queryKey: ['daily-roster', date, scope, state, search], queryFn: () => api.getDailyRoster(date, { ...scope, state, search }), enabled: view === 'daily' });
  const deptDaily = useQuery({ queryKey: ['daily-roster', date, { dept }], queryFn: () => api.getDailyRoster(date, { dept }), enabled: view === 'department' });

  const filters =
  <div className="flex flex-wrap items-center gap-2">
      <SearchInput value={search} onChange={setSearch} placeholder="Employee ID or name" className="w-52" />
      <ScopeFilters value={scope} onChange={setScope} />
      <Select compact className="w-36" aria-label="Roster state" value={state} onChange={(e) => setState(e.target.value as RosterState)} placeholder="Any state" options={STATES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))} />
    </div>;


  return (
    <div>
      <PageHeader title="Roster" description="Permanent employee schedules by platform, department and shift. Absences show the replacing freelancer." />
      <Tabs className="mb-4" value={view} onChange={(v) => setParams({ view: v })} tabs={[{ id: 'monthly', label: 'Monthly' }, { id: 'daily', label: 'Daily' }, { id: 'platform', label: 'Platform' }, { id: 'department', label: 'Department' }]} />

      {view === 'monthly' &&
      <Card>
          <div className="flex flex-col gap-3 border-b border-line p-3 xl:flex-row xl:items-center xl:justify-between">
            {filters}
            <MonthNav month={month} onChange={setMonth} min="2026-09" max="2026-10" />
          </div>
          <QueryView query={monthly} isEmpty={(d) => d.rows.length === 0}>
            {(d) =>
          <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2 text-xs text-ink-muted">
                  <span className="tabular">{d.rows.length} employees · {d.totals.OFF} off-days · {d.totals.ABSENT} unfilled absences · {d.totals.REPLACED} replaced shifts</span>
                  <RosterLegend />
                </div>
                <RosterMonthGrid days={d.days} rows={d.rows} />
              </>
          }
          </QueryView>
        </Card>
      }

      {view === 'daily' &&
      <Card>
          <div className="flex flex-col gap-3 border-b border-line p-3 xl:flex-row xl:items-center xl:justify-between">
            {filters}
            <Input type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-44" />
          </div>
          <QueryView query={daily} isEmpty={(d) => d.length === 0}>
            {(rows) =>
          <DataTable
            rows={rows.slice(0, 300)}
            rowKey={(r) => r.employeeId}
            columns={[
            { key: 'id', header: 'Employee', cell: (r) => <Link to={`/employees/${r.employeeId}`} className="font-mono text-xs hover:text-primary">{r.employeeId}</Link> },
            { key: 'name', header: 'Name', cell: (r) => r.name },
            { key: 'p', header: 'Platform', cell: (r) => r.platformCode },
            { key: 'd', header: 'Dept', cell: (r) => <DeptTag dept={r.dept} /> },
            { key: 's', header: 'Shift', cell: (r) => <ShiftTag shift={r.shift} /> },
            { key: 'w', header: 'Shift window', cell: (r) => <span className="text-xs text-ink-muted">{fmtShiftWindow(r.shiftStart, r.shiftEnd)}</span> },
            { key: 'st', header: 'State', cell: (r) => <StatusBadge status={r.state} size="xs" /> },
            { key: 'rep', header: 'Replacement', cell: (r) => r.replacement ? <Link to={`/replacements/${r.replacement.id}`} className="flex items-center gap-1.5 hover:text-primary"><IdText>{r.replacement.freelancerId ?? 'Unassigned'}</IdText><StatusBadge status={r.replacement.status} size="xs" /></Link> : <span className="text-ink-subtle">—</span> }]
            } />

          }
          </QueryView>
          {daily.data && daily.data.length > 300 && <p className="border-t border-line px-4 py-2 text-xs text-ink-muted">Showing first 300 of {daily.data.length}. Narrow by platform or department.</p>}
        </Card>
      }

      {view === 'platform' &&
      <div>
          <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
            <Select compact className="w-40" aria-label="Platform" value={platform} onChange={(e) => setPlatform(e.target.value)} options={platforms.filter((p) => p.status === 'ACTIVE').map((p) => ({ value: p.code, label: p.code }))} />
            <Input type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-44" />
          </Card>
          <PlatformRosterView code={platform} date={date} />
        </div>
      }

      {view === 'department' &&
      <div>
          <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
            <Select compact className="w-48" aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value as DeptCode)} options={(Object.keys(deptNames) as DeptCode[]).map((d) => ({ value: d, label: `${d} · ${deptNames[d]}` }))} />
            <Input type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-44" />
          </Card>
          <QueryView query={deptDaily} isEmpty={(d) => d.length === 0} empty={<EmptyState title={`No ${dept} employees rostered`} />}>
            {(rows) => {
            const byPlatform = [...new Set(rows.map((r) => r.platformCode))];
            return (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {byPlatform.map((p) => {
                  const list = rows.filter((r) => r.platformCode === p);
                  return (
                    <Card key={p} className="p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <Link to={`/platforms/${p}`} className="text-sm font-semibold hover:text-primary">{p} / {dept}</Link>
                          <span className="text-xs text-ink-muted tabular">{list.filter((r) => r.state === 'WORKING' || r.state === 'REPLACED').length} / {list.length} covered</span>
                        </div>
                        <ul className="space-y-1">
                          {list.map((r) =>
                        <li key={r.employeeId} className="flex items-center justify-between gap-2 text-[12px]">
                              <span className="flex items-center gap-1.5"><ShiftTag shift={r.shift} /><IdText>{r.employeeId}</IdText></span>
                              <span className="flex items-center gap-1">
                                {r.replacement?.freelancerId && <IdText className="text-primary-700">{r.replacement.freelancerId}</IdText>}
                                <StatusBadge status={r.state} size="xs" />
                              </span>
                            </li>
                        )}
                        </ul>
                      </Card>);

                })}
                </div>);

          }}
          </QueryView>
        </div>
      }
    </div>);

}