import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { ScopeFilters, type Scope } from '../../components/ui/ScopeFilters';
import { EmptyState, QueryView } from '../../components/ui/States';
import { reportDefinitions, type ReportKey } from '../../data/reports';
import { api } from '../../services/api';
import { cn } from '../../utils/cn';
import { fmtDateTime } from '../../utils/format';
import { ReportDownload } from '../../components/reports/ReportDownload';

export function Reports({ embedded = false }: { embedded?: boolean }) {
  const [params, setParams] = useSearchParams();
  const requestedKey = params.get('report') as ReportKey ?? 'workforce-summary';
  const [scope, setScope] = useState<Scope>({ category: '', platform: params.get('platform') ?? '', dept: '', shift: '' });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [employeeId,setEmployeeId]=useState(params.get('employeeId')??'');
  const [month,setMonth]=useState('');
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('');
  const def = reportDefinitions.find((r) => r.key === requestedKey) ?? reportDefinitions[0];
  const key = def.key;
  const selectReport = (value: string) => setParams(previous => { const next = new URLSearchParams(previous); next.set('report', value); return next; });
  const filters={...scope,from,to,employeeId,month,search,status};
  const q = useQuery({ queryKey: ['report', key, filters], queryFn: () => api.getReport(key, filters),enabled:key!=='employee-detail'||!!employeeId });
  const groups = [...new Set(reportDefinitions.map((r) => r.group))];

  return (
    <div>
      {embedded ? <div className="mb-3"><h2 className="text-base font-semibold">Report workspace</h2><p className="mt-1 text-xs text-ink-muted">Choose a report, refine its scope and download PDF, Excel or CSV.</p></div> : <PageHeader title="Reports" description="Database reports with styled PDF, Excel and CSV downloads." />}
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Select className="lg:hidden" aria-label="Report" value={key} onChange={event => selectReport(event.target.value)} options={reportDefinitions.map(report => ({ value: report.key, label: `${report.group} · ${report.title}` }))} />
        <Card className="hidden h-fit p-2 lg:block">
          {groups.map((g) =>
          <div key={g} className="mb-2">
              <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{g}</p>
              {reportDefinitions.filter((r) => r.group === g).map((r) =>
            <button key={r.key} aria-pressed={r.key === key} onClick={() => selectReport(r.key)} className={cn('block w-full rounded-lg px-3 py-1.5 text-left text-[13px]', r.key === key ? 'bg-primary-50 font-semibold text-primary-700' : 'hover:bg-mist')}>{r.title}</button>
            )}
            </div>
          )}
        </Card>
        <Card className="h-fit">
          <div className="border-b border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h2 className="text-base font-semibold">{def.title}</h2><p className="text-xs text-ink-muted">{def.description}</p></div>
              <ReportDownload report={key} filters={filters}/>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ScopeFilters value={scope} onChange={setScope} />
              <Input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
              <Input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
              {['employee-detail','employee-directory','break-history','break-summary','break-exceeded'].includes(key)&&<Input aria-label="Employee staff number" placeholder="Employee staff number" value={employeeId} onChange={e=>setEmployeeId(e.target.value)} className="h-9 w-48"/>}
              {key.startsWith('break-')&&<Input type="month" aria-label="Report month" value={month} onChange={e=>setMonth(e.target.value)} className="h-9 w-40"/>}
              <Input aria-label="Report search" placeholder="Search records" value={search} onChange={e=>setSearch(e.target.value)} className="h-9 w-44"/>
              {['attendance-confirmations','employee-directory','platform-categories','equipment-inventory'].includes(key)&&<Input aria-label="Report status" placeholder="Status, e.g. ACTIVE" value={status} onChange={e=>setStatus(e.target.value.toUpperCase())} className="h-9 w-44"/>}
            </div>
            {key==='employee-detail'&&!employeeId&&<p role="status" className="mt-3 text-sm text-ink-muted">Enter an employee staff number to preview or download the report.</p>}
          </div>
          {q.data?.summary&&<div className="flex flex-wrap gap-6 border-b border-line p-4">{q.data.summary.map(m=><div key={m.label}><p className="text-xs text-ink-muted">{m.label}</p><p className="font-semibold">{m.value}</p></div>)}</div>}
          {(key!=='employee-detail'||employeeId)&&
          <QueryView query={q} isEmpty={(d) => d.rows.length === 0} empty={<EmptyState title="No data for these filters" />}>
            {(d) =>
            <>
                <div className="scroll-thin max-h-[600px] overflow-auto">
                  <table className="w-full text-[13px]">
                    <thead className="sticky top-0 bg-mist">
                      <tr>{d.columns.map((c) => <th key={c} scope="col" className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {d.rows.map((r, i) =>
                    <tr key={i} className="border-b border-line last:border-0">{r.map((v, j) => <td key={j} className={cn('px-4 py-2', typeof v === 'number' && 'tabular')}>{v}</td>)}</tr>
                    )}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-line px-4 py-2 text-[11px] text-ink-subtle">{d.rows.length} rows · generated {fmtDateTime(d.generatedAt)}</p>
              </>
            }
          </QueryView>}
        </Card>
      </div>
    </div>);

}
