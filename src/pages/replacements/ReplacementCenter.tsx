import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarClockIcon, CheckCheckIcon, ClipboardListIcon, PlusIcon, SirenIcon, UserXIcon, XOctagonIcon } from 'lucide-react';
import { ReportAbsenceDialog } from '../../components/replacement/ReportAbsenceDialog';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Input, Select } from '../../components/ui/Field';
import { KpiTile } from '../../components/ui/KpiTile';
import { PageHeader } from '../../components/ui/PageHeader';
import { ScopeFilters, type Scope } from '../../components/ui/ScopeFilters';
import { SearchInput } from '../../components/ui/SearchInput';
import { QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DeptTag, IdText, ShiftTag } from '../../components/ui/Tags';
import { api, type ReplacementQuery } from '../../services/api';
import type { ReplacementStatus } from '../../types/domain';
import { fmtDate, fmtShiftWindow } from '../../utils/format';

const STATUSES: ReplacementStatus[] = ['PENDING', 'SEARCHING', 'ASSIGNED', 'CONFIRMED', 'CANCELLED', 'FAILED'];

export function ReplacementCenter() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>({ category: '', platform: '', dept: '', shift: '' });
  const [status, setStatus] = useState<ReplacementStatus | ''>('');
  const [type, setType] = useState<'PLANNED' | 'EMERGENCY' | ''>('');
  const [date, setDate] = useState('');
  const [employee, setEmployee] = useState('');
  const [freelancer, setFreelancer] = useState('');
  const query: ReplacementQuery = { ...scope, status, type, date, employee, freelancer };
  const q = useQuery({ queryKey: ['replacements', query], queryFn: () => api.listReplacements(query) });
  const c = q.data?.counts;

  return (
    <div>
      <PageHeader
        title="Replacement Center"
        description="Absences resolved by department-restricted, platform-aware freelancer selection in manager-defined priority order."
        actions={<Button icon={<PlusIcon className="h-4 w-4" />} onClick={() => setOpen(true)}>Record absence</Button>} />
      
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Replacements required" value={c?.required ?? '—'} icon={ClipboardListIcon} tone="info" />
        <KpiTile label="Planned" value={c?.planned ?? '—'} icon={CalendarClockIcon} tone="info" />
        <KpiTile label="Emergency" value={c?.emergency ?? '—'} icon={SirenIcon} tone="danger" emphasis />
        <KpiTile label="Unassigned absences" value={c?.unassigned ?? '—'} icon={UserXIcon} tone="warning" emphasis />
        <KpiTile label="Assigned / confirmed" value={c?.assigned ?? '—'} icon={CheckCheckIcon} tone="success" />
        <KpiTile label="Failed" value={c?.failed ?? '—'} icon={XOctagonIcon} tone="danger" emphasis />
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={employee} onChange={setEmployee} placeholder="Absent employee" className="w-44" />
          <SearchInput value={freelancer} onChange={setFreelancer} placeholder="Freelancer" className="w-40" />
          <ScopeFilters value={scope} onChange={setScope} />
          <Input type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-40" />
          <Select compact className="w-36" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as ReplacementStatus)} placeholder="Any status" options={STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))} />
          <Select compact className="w-36" aria-label="Type" value={type} onChange={(e) => setType(e.target.value as 'PLANNED')} placeholder="Any type" options={[{ value: 'PLANNED', label: 'Planned' }, { value: 'EMERGENCY', label: 'Emergency' }]} />
        </div>
        <QueryView query={q} isEmpty={(d) => d.items.length === 0}>
          {(d) =>
          <>
              <div className="hidden md:block">
                <DataTable
                rows={d.items}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/replacements/${r.id}`)}
                rowClassName={(r) => r.status === 'FAILED' ? 'bg-danger-50/40' : ''}
                columns={[
                { key: 'id', header: 'Replacement', cell: (r) => <IdText>{r.id}</IdText> },
                { key: 'type', header: 'Type', cell: (r) => <StatusBadge status={r.type} size="xs" /> },
                { key: 'abs', header: 'Absent employee', cell: (r) => <span><IdText>{r.absentEmployeeId}</IdText> <span className="text-ink-muted">{r.absentEmployeeName}</span></span> },
                { key: 'p', header: 'Platform', cell: (r) => <span className="flex items-center gap-1.5 font-medium">{r.platformCode} <DeptTag dept={r.dept} /></span> },
                { key: 's', header: 'Shift', cell: (r) => <ShiftTag shift={r.shift} /> },
                { key: 'w', header: 'Shift window', cell: (r) => <span className="text-xs text-ink-muted">{fmtShiftWindow(r.shiftStart, r.shiftEnd)}</span> },
                { key: 'fl', header: 'Freelancer', cell: (r) => r.freelancerId ? <span><IdText>{r.freelancerId}</IdText> <span className="text-xs text-ink-subtle">#{r.freelancerPriority}</span></span> : <span className="text-ink-subtle">—</span> },
                { key: 'st', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> }]
                } />
              
              </div>
              <ul className="divide-y divide-line md:hidden">
                {d.items.map((r) =>
              <li key={r.id}>
                    <Link to={`/replacements/${r.id}`} className="block px-4 py-3 active:bg-mist">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-sm font-semibold">{r.platformCode} <DeptTag dept={r.dept} /></span>
                        <StatusBadge status={r.status} size="xs" />
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted"><ShiftTag shift={r.shift} /> {fmtDate(r.date, 'EEE, MMM d')} · <StatusBadge status={r.type} size="xs" /></p>
                      <p className="mt-1 text-xs"><IdText>{r.absentEmployeeId}</IdText> → <IdText>{r.freelancerId ?? 'unassigned'}</IdText></p>
                    </Link>
                  </li>
              )}
              </ul>
            </>
          }
        </QueryView>
      </Card>
      <ReportAbsenceDialog open={open} onClose={() => setOpen(false)} />
    </div>);

}