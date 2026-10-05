import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MoonIcon, SunIcon } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { QueryView } from '../../components/ui/States';
import { api } from '../../services/api';
import { fmtShiftWindow } from '../../utils/format';

export function Shifts() {
  const q = useQuery({ queryKey: ['shifts'], queryFn: () => api.getShifts() });
  return (
    <div>
      <PageHeader title="Shift overview" description="Two 12-hour shifts. The night shift crosses midnight — its end datetime is the following day." />
      <QueryView query={q}>
        {(rows) =>
        <div className="grid gap-4 lg:grid-cols-2">
            {rows.map((s) => {
            const Icon = s.code === 'MORNING' ? SunIcon : MoonIcon;
            return (
              <Card key={s.code} className="p-5">
                  <div className="flex items-center gap-3">
                    <span className={s.code === 'MORNING' ? 'flex h-10 w-10 items-center justify-center rounded-xl bg-warning-50 text-warning-600' : 'flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary'}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-base font-semibold">{s.label} shift</h2>
                      <p className="text-sm text-ink-muted tabular">{s.start} → {s.end}{s.crossesMidnight ? ' (+1 day)' : ''} · 12 hours</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl bg-canvas p-3 text-sm">
                    <p className="text-xs text-ink-muted">Today’s instance</p>
                    <p className="font-semibold">{fmtShiftWindow(s.today.start, s.today.end)}</p>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
                    <div><dt className="text-xs text-ink-muted">Permanent</dt><dd className="text-lg font-semibold tabular">{s.employees}</dd></div>
                    <div><dt className="text-xs text-ink-muted">Freelancers free</dt><dd className="text-lg font-semibold tabular">{s.freelancersAvailableToday}</dd></div>
                    <div><dt className="text-xs text-ink-muted">Replacements</dt><dd className="text-lg font-semibold tabular">{s.replacementsToday}</dd></div>
                  </dl>
                </Card>);

          })}
            <Card className="p-5 lg:col-span-2">
              <p className="text-sm">
                Permanent employees rotate between Morning and Night every 3 months. See the{' '}
                <Link to="/rotation" className="font-medium text-primary hover:underline">rotation schedule</Link>. Attendance and biometric clock-in are handled outside Relay.
              </p>
            </Card>
          </div>
        }
      </QueryView>
    </div>);

}