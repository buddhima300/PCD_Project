import React from 'react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardListIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DeptTag, IdText, ShiftTag } from '../../components/ui/Tags';
import { api, errorMessage } from '../../services/api';
import { SERVER_NOW } from '../../utils/clock';
import { fmtShiftWindow } from '../../utils/format';

export function MyAssignments() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['my-assignments'], queryFn: () => api.listMyAssignments() });
  const confirm = useMutation({
    mutationFn: (id: string) => api.confirmReplacement(id),
    onSuccess: () => {toast.success('Assignment confirmed');qc.invalidateQueries();},
    onError: (e) => toast.error(errorMessage(e))
  });
  const nowIso = format(SERVER_NOW, "yyyy-MM-dd'T'HH:mm:ss");
  return (
    <div>
      <PageHeader title="My replacement assignments" description="Each assignment names the platform, department, shift, employee you replace and the workstation you will use." />
      <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<Card><EmptyState icon={ClipboardListIcon} title="No assignments yet" description="You’ll be notified in-app and by email when the replacement engine assigns you." /></Card>}>
        {(rows) => {
          const upcoming = rows.filter((r) => r.shiftEnd >= nowIso && r.status !== 'CANCELLED');
          const past = rows.filter((r) => !upcoming.includes(r));
          return (
            <div className="space-y-5">
              <section>
                <h2 className="mb-2 text-sm font-semibold">Upcoming</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {upcoming.map((r) =>
                  <Card key={r.id} className="flex flex-col p-4">
                      <div className="flex items-center justify-between">
                        <StatusBadge status={r.type} size="xs" />
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="mt-2 flex items-center gap-2 text-lg font-semibold">{r.platformCode} <DeptTag dept={r.dept} /></p>
                      <p className="mt-1 flex items-center gap-2 text-sm"><ShiftTag shift={r.shift} /> {fmtShiftWindow(r.shiftStart, r.shiftEnd)}</p>
                      <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                        <div><dt className="text-xs text-ink-muted">Replacing</dt><dd><IdText>{r.absentEmployeeId}</IdText></dd></div>
                        <div><dt className="text-xs text-ink-muted">Workstation</dt><dd><IdText>{r.workstationId ?? '—'}</IdText></dd></div>
                        <div className="col-span-2"><dt className="text-xs text-ink-muted">Reason</dt><dd className="text-ink-muted">{r.reason}</dd></div>
                      </dl>
                      <div className="mt-auto flex gap-2 pt-4">
                        <Link to={`/replacements/${r.id}`} className="flex-1"><Button variant="secondary" size="sm" className="w-full">Details</Button></Link>
                        {r.status === 'ASSIGNED' && <Button size="sm" className="flex-1" loading={confirm.isPending && confirm.variables === r.id} onClick={() => confirm.mutate(r.id)}>Confirm</Button>}
                      </div>
                    </Card>
                  )}
                  {upcoming.length === 0 && <Card className="md:col-span-2"><EmptyState title="No upcoming assignments" /></Card>}
                </div>
              </section>
              {past.length > 0 &&
              <section>
                  <h2 className="mb-2 text-sm font-semibold">History</h2>
                  <Card>
                    <ul className="divide-y divide-line">
                      {past.map((r) =>
                    <li key={r.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
                          <span className="flex items-center gap-2">{r.platformCode} <DeptTag dept={r.dept} /> <ShiftTag shift={r.shift} /> <span className="text-ink-muted">{r.date}</span></span>
                          <StatusBadge status={r.status} size="xs" />
                        </li>
                    )}
                    </ul>
                  </Card>
                </section>
              }
            </div>);

        }}
      </QueryView>
    </div>);

}