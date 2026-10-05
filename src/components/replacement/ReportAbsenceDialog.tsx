import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '../../services/api';
import type { Employee } from '../../types/domain';
import { TODAY } from '../../utils/clock';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, Input, Textarea } from '../ui/Field';
import { SearchInput } from '../ui/SearchInput';
import { DeptTag, IdText, ShiftTag } from '../ui/Tags';

// Records an absence. The backend decides planned (≥7 days, search at T-7) vs emergency (search now).
export function ReportAbsenceDialog({ open, onClose }: {open: boolean;onClose: () => void;}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [emp, setEmp] = useState<Employee | null>(null);
  const [date, setDate] = useState(TODAY);
  const [reason, setReason] = useState('');
  const results = useQuery({ queryKey: ['employees', { search, pageSize: 8 }], queryFn: () => api.listEmployees({ search, pageSize: 8 }), enabled: open && search.length >= 2 });
  const submit = useMutation({
    mutationFn: () => api.reportAbsence({ employeeId: emp!.id, date, reason }),
    onSuccess: (r) => {
      qc.invalidateQueries();
      toast.success(`${r.id} created · ${r.type === 'EMERGENCY' ? 'emergency' : 'planned'}`, { description: r.status === 'ASSIGNED' ? `${r.freelancerId} assigned (priority ${r.freelancerPriority}).` : r.status === 'FAILED' ? 'No eligible freelancer — manual action required.' : `Search scheduled for ${r.initiatedAt.slice(0, 10)}.` });
      reset();
      navigate(`/replacements/${r.id}`);
    }
  });
  const reset = () => {
    setEmp(null);
    setSearch('');
    setReason('');
    setDate(TODAY);
    submit.reset();
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={reset}
      title="Record absence"
      description="The replacement engine searches immediately for emergencies, or 7 days before the shift for planned absences."
      footer={
      <>
          <Button variant="ghost" size="sm" onClick={reset}>Cancel</Button>
          <Button size="sm" disabled={!emp || !reason} loading={submit.isPending} onClick={() => submit.mutate()}>Record absence</Button>
        </>
      }>
      
      <div className="space-y-4">
        {!emp ?
        <Field label="Absent employee">
            <SearchInput value={search} onChange={setSearch} placeholder="Search employee ID or name" />
            {results.data &&
          <ul className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-line">
                {results.data.items.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">No employees found.</li>}
                {results.data.items.map((e) =>
            <li key={e.id}>
                    <button onClick={() => setEmp(e)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-mist">
                      <IdText>{e.id}</IdText>
                      <span className="flex-1 truncate">{e.name}</span>
                      <span className="text-xs text-ink-muted">{e.platformCode}</span>
                      <DeptTag dept={e.dept} />
                      <ShiftTag shift={e.shift} />
                    </button>
                  </li>
            )}
              </ul>
          }
          </Field> :

        <div className="flex items-center justify-between rounded-xl bg-canvas p-3">
            <div className="text-sm">
              <p className="font-medium"><IdText>{emp.id}</IdText> {emp.name}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">{emp.platformCode} <DeptTag dept={emp.dept} /> <ShiftTag shift={emp.shift} /></p>
            </div>
            <button onClick={() => setEmp(null)} className="text-xs font-medium text-primary hover:underline">Change</button>
          </div>
        }
        <Field label="Shift date" htmlFor="abs-date" hint="Shift and platform are taken from the employee’s current assignment.">
          <Input id="abs-date" type="date" min={TODAY} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Reason" htmlFor="abs-reason">
          <Textarea id="abs-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Called in sick at 16:10" />
        </Field>
        {submit.isError && <p role="alert" className={cn('rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger-600')}>{errorMessage(submit.error)}</p>}
      </div>
    </Dialog>);

}