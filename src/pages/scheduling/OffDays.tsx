import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldCheckIcon } from 'lucide-react';
import { OffDayCapacityGrid } from '../../components/offday/OffDayCapacityGrid';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Checkbox, Field, Input, Select, Textarea } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { ScopeFilters, type Scope } from '../../components/ui/ScopeFilters';
import { SearchInput } from '../../components/ui/SearchInput';
import { QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Tabs } from '../../components/ui/Tabs';
import { DeptTag, IdText, ShiftTag } from '../../components/ui/Tags';
import { api, errorMessage } from '../../services/api';
import type { OffDayRequest } from '../../types/domain';
import { TODAY } from '../../utils/clock';
import { fmtDate, fmtDateTime } from '../../utils/format';

type Tab = 'review' | 'capacity';

export function OffDays() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') as Tab ?? 'review';
  const qc = useQueryClient();
  const [scope, setScope] = useState<Scope>({ category: '', platform: '', dept: '' });
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [start, setStart] = useState(TODAY);
  const [onlyAlerts, setOnlyAlerts] = useState(true);
  const [target, setTarget] = useState<OffDayRequest | null>(null);
  const [reason, setReason] = useState('');
  const query = { ...scope, status, search, page, pageSize: 25 };
  const q = useQuery({ queryKey: ['offday-requests', query], queryFn: () => api.listOffDayRequests(query), placeholderData: keepPreviousData, enabled: tab === 'review' });
  const override = useMutation({
    mutationFn: () => api.overrideOffDay(target!.id, reason),
    onSuccess: (o) => {
      toast.success(`Override applied to ${o.employeeId}`, { description: 'Audited and employee notified.' });
      setTarget(null);
      setReason('');
      qc.invalidateQueries();
    }
  });

  return (
    <div>
      <PageHeader title="Off-days" description="Requests are auto-processed first-come-first-served against a limit of 2 approved per platform + department + date. Overrides are exceptions and always audited." />
      <Tabs className="mb-4" value={tab} onChange={(t) => setParams({ tab: t })} tabs={[{ id: 'review', label: 'Request review' }, { id: 'capacity', label: 'Platform off-day capacity' }]} />
      {tab === 'review' ?
      <Card>
          <div className="flex flex-wrap gap-2 border-b border-line p-3">
            <SearchInput value={search} onChange={(v) => {setSearch(v);setPage(1);}} placeholder="Employee or platform" className="w-56" />
            <ScopeFilters value={scope} onChange={(v) => {setScope(v);setPage(1);}} show={['category', 'platform', 'dept']} />
            <Select compact className="w-44" aria-label="Status" value={status} onChange={(e) => {setStatus(e.target.value);setPage(1);}} placeholder="Any status" options={['APPROVED', 'REJECTED', 'OVERRIDE_APPROVED', 'CANCELLED'].map((s) => ({ value: s, label: s === 'OVERRIDE_APPROVED' ? 'Override approved' : s.charAt(0) + s.slice(1).toLowerCase() }))} />
          </div>
          <QueryView query={q} isEmpty={(d) => d.items.length === 0}>
            {(d) =>
          <>
                <DataTable
              rows={d.items}
              rowKey={(r) => r.id}
              rowClassName={(r) => r.status === 'OVERRIDE_APPROVED' ? 'bg-violet-50/40' : ''}
              columns={[
              { key: 'id', header: 'Request', cell: (r) => <IdText className="text-ink-muted">{r.id}</IdText> },
              { key: 'emp', header: 'Employee', cell: (r) => <span><IdText>{r.employeeId}</IdText> <span className="text-ink-muted">{r.employeeName}</span></span> },
              { key: 'p', header: 'Group', cell: (r) => <span className="flex items-center gap-1.5">{r.platformCode} <DeptTag dept={r.dept} /></span> },
              { key: 's', header: 'Shift', cell: (r) => <ShiftTag shift={r.shift} /> },
              { key: 'date', header: 'Date', cell: (r) => fmtDate(r.date, 'EEE, MMM d') },
              { key: 'status', header: 'Result', cell: (r) => <StatusBadge status={r.status} size="xs" /> },
              { key: 'at', header: 'Submitted', cell: (r) => <span className="text-xs text-ink-muted">{fmtDateTime(r.createdAt)}</span> },
              { key: 'detail', header: 'Detail', cell: (r) => <span className="block max-w-xs truncate text-xs text-ink-muted">{r.override ? `Override by ${r.override.managerName} · ${r.override.reason}` : r.reason ?? 'Auto-approved'}</span> },
              {
                key: 'act',
                header: '',
                cell: (r) => r.status === 'REJECTED' && r.date > TODAY ? <Button size="sm" variant="secondary" icon={<ShieldCheckIcon className="h-3.5 w-3.5" />} onClick={() => setTarget(r)}>Override</Button> : null
              }]
              } />
            
                <Pagination page={page} pageSize={25} total={d.total} onPage={setPage} />
              </>
          }
          </QueryView>
        </Card> :

      <Card>
          <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
            <ScopeFilters value={scope} onChange={setScope} show={['category', 'platform', 'dept']} />
            <Input type="date" aria-label="Start date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 w-44" />
            <Checkbox id="alerts" label="Only groups with full days" checked={onlyAlerts} onChange={setOnlyAlerts} />
          </div>
          <OffDayCapacityGrid start={start} days={14} category={scope.category} platform={scope.platform} dept={scope.dept} onlyAlerts={onlyAlerts} />
        </Card>
      }

      <Dialog
        open={!!target}
        onClose={() => setTarget(null)}
        title="Manager override"
        description="Approve beyond the 2-per-group limit as an exception."
        footer={
        <>
            <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>Cancel</Button>
            <Button size="sm" loading={override.isPending} onClick={() => override.mutate()} icon={<ShieldCheckIcon className="h-3.5 w-3.5" />}>Approve with override</Button>
          </>
        }>
        
        {target &&
        <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-canvas p-3 text-sm">
              <div><dt className="text-xs text-ink-muted">Employee</dt><dd className="font-medium">{target.employeeId} · {target.employeeName}</dd></div>
              <div><dt className="text-xs text-ink-muted">Group</dt><dd className="font-medium">{target.platformCode} / {target.dept}</dd></div>
              <div><dt className="text-xs text-ink-muted">Date</dt><dd className="font-medium">{fmtDate(target.date, 'EEEE, MMM d')}</dd></div>
              <div><dt className="text-xs text-ink-muted">Current capacity</dt><dd className="font-medium">2 / 2 OFF → 3 / 2</dd></div>
            </dl>
            <p className="rounded-xl border border-violet-100 bg-violet-50 p-3 text-xs text-violet-600">This will be recorded as a manager override with your name, timestamp, previous capacity and reason. The employee is notified.</p>
            <Field label="Override reason (min 10 characters)" htmlFor="ovr">
              <Textarea id="ovr" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Bereavement — compassionate exception" />
            </Field>
            {override.isError && <p role="alert" className="rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger-600">{errorMessage(override.error)}</p>}
          </div>
        }
      </Dialog>
    </div>);

}