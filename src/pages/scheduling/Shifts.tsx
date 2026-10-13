import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MoonIcon, SunIcon, DownloadIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Field, Input, Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { ScopeFilters, type Scope } from '../../components/ui/ScopeFilters';
import { SearchInput } from '../../components/ui/SearchInput';
import { EmptyState, QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { HandoverCorrectionDialog } from '../../components/resources/HandoverCorrectionDialog';
import { api } from '../../services/api';
import { businessDate, businessDateTime } from '../../utils/shiftTime';
import { downloadAttendance } from '../../utils/attendanceExport';

export function Shifts() {
  const [date, setDate] = useState(() => businessDate()); const [scope, setScope] = useState<Scope>({ platform: '', dept: '' });
  const [status, setStatus] = useState(''); const [search, setSearch] = useState(''); const [reviewIds, setReviewIds] = useState<string[] | null>(null);
  const filter = { platform: scope.platform, dept: scope.dept, status, search };
  const q = useQuery({ queryKey: ['handover-attendance', date, filter], queryFn: () => api.getDailyHandoverAttendance(date, filter), refetchInterval: 30000 });
  const canExport = !!q.data?.length && !q.isFetching;
  return <div className="space-y-4"><PageHeader title="Shift overview & attendance" description="Handover confirmations submitted on the selected calendar day. Morning 07:30–19:30 · Night 19:30–07:30. Asia/Colombo." actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" icon={<DownloadIcon className="h-4 w-4" />} disabled={!canExport} onClick={() => downloadAttendance(q.data ?? [], date, 'csv')}>Download CSV</Button><Button variant="secondary" icon={<DownloadIcon className="h-4 w-4" />} disabled={!canExport} onClick={() => downloadAttendance(q.data ?? [], date, 'xlsx')}>Download Excel</Button></div>} />
    <Card><div className="flex flex-wrap items-end gap-3 p-4"><Field label="Event calendar date" htmlFor="attendance-date"><Input id="attendance-date" type="date" value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }} /></Field><ScopeFilters value={scope} onChange={setScope} show={['platform', 'dept']} /><Select aria-label="Attendance status" className="w-48" placeholder="All statuses" value={status} onChange={e => setStatus(e.target.value)} options={[{ value: 'ON_TIME', label: 'On time' }, { value: 'LATE', label: 'Late' }, { value: 'PENDING_COUNTERPART', label: 'Pending counterpart' }, { value: 'AWAITING_RECEIPT', label: 'Awaiting receipt' }]} /><SearchInput className="w-64" value={search} onChange={setSearch} placeholder="Search worker or laptop" /><Button variant="secondary" size="sm" disabled={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button></div><p className="border-t border-line px-4 py-3 text-xs text-ink-muted">Only workers with a submitted confirmation appear. Night-shift events can appear on different days. Downloads include the current filters. Data refreshes every 30 seconds.</p></Card>
    <QueryView query={q}>{rows => <div className="grid items-start gap-4 xl:grid-cols-2">{(['MORNING', 'NIGHT'] as const).map(shift => {
      const records = rows.filter(r => r.shift === shift); const Icon = shift === 'MORNING' ? SunIcon : MoonIcon;
      const confirmed = records.filter(r => r.status === 'ON_TIME' || r.status === 'LATE').length;
      return <Card key={shift}><div className="border-b border-line p-4"><h2 className="flex items-center gap-2 text-base font-semibold"><Icon className="h-5 w-5 text-primary" />{shift === 'MORNING' ? 'Morning shift' : 'Night shift'}</h2><p className="mt-2 text-xs text-ink-muted">{records.length} submitted workers · {confirmed} confirmed · {records.filter(r => r.status === 'LATE').length} late · {records.filter(r => r.exceptionReason).length} self-confirmed</p></div>
        {!records.length ? <EmptyState title="No submitted records" description="No handover confirmations match this shift, calendar date and filters." /> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-line bg-mist"><tr>{['Worker / shift date', 'Laptop', 'Receipt / outgoing', 'Attendance', 'Details'].map(label => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{records.map(r => <tr key={r.id}><td className="px-3 py-3"><p className="font-semibold">{r.workerName}</p><p className="mt-1 text-ink-muted">{r.workerId} · {r.workerType === 'FREELANCER' ? 'Freelancer' : 'Employee'}</p><p className="mt-1 text-ink-muted">{r.platformCode} / {r.dept} · Shift start {r.shiftDate}</p></td><td className="px-3 py-3 font-mono">{r.assetId}</td><td className="whitespace-nowrap px-3 py-3 tabular"><p>In: {businessDateTime(r.receivedAt)}</p><p className="mt-1">Out: {businessDateTime(r.outgoingAt)}</p></td><td className="px-3 py-3"><StatusBadge size="xs" status={r.status === 'ON_TIME' ? 'COMPLETED' : r.status === 'LATE' ? 'WARNING' : 'PENDING'} label={r.status === 'ON_TIME' ? 'On time' : r.status === 'LATE' ? 'Late' : r.status === 'AWAITING_RECEIPT' ? 'Awaiting receipt' : 'Pending counterpart'} />{r.exceptionReason && <p className="mt-2 text-warning-600">Self-confirmed</p>}{r.equipmentIssue && <p className="mt-2 text-danger-600">Equipment issue</p>}{r.corrected && <p className="mt-2 text-primary">Corrected</p>}</td><td className="px-3 py-3"><details><summary className="cursor-pointer text-primary">Notes & partners</summary><div className="mt-2 min-w-40 space-y-1"><p>From: {r.receivedFrom}</p><p>To: {r.handedTo}</p><p>{r.notes || 'No notes'}</p>{r.exceptionReason && <p>Exception: {r.exceptionReason}</p>}{r.equipmentIssue && <p>Equipment: {r.equipmentIssue}</p>}</div></details><Button variant="secondary" size="xs" className="mt-2" onClick={() => setReviewIds(r.handoverIds)}>Review / correct</Button></td></tr>)}</tbody></table></div>}
      </Card>;
    })}</div>}</QueryView>
    {reviewIds && <HandoverCorrectionDialog ids={reviewIds} onClose={() => setReviewIds(null)} />}
  </div>;
}
