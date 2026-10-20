import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { CapacityMeter } from '../../components/ui/CapacityMeter';
import { WorkspaceSummary } from '../../components/ui/WorkspaceSummary';
import { Employees } from './Employees';
import { PageHeader } from '../../components/ui/PageHeader';
import { QueryView } from '../../components/ui/States';
import { DeptTag } from '../../components/ui/Tags';
import { api } from '../../services/api';
import { deptNames } from '../../utils/format';
import { SupervisorHubLinks } from '../system/SupervisorHub';

export function WorkforceOverview() {
  const q = useQuery({ queryKey: ['workforce-overview'], queryFn: () => api.getWorkforceOverview() });
  return (
    <div>
      <PageHeader
        title="Workforce overview"
        description="Register employees or freelancers → start training → evaluate → assign a production platform and shift."
        actions={
          <div className="flex gap-2">
            <Link to="/register">
              <Button size="sm">Register staff</Button>
            </Link>
            <Link to="/workforce/assignments">
              <Button size="sm" variant="secondary">Platform vacancies</Button>
            </Link>
          </div>
        }
      />
      <SupervisorHubLinks />
      <QueryView query={q}>
        {(d) =>
        <div className="space-y-4">
            <WorkspaceSummary label="Workforce summary" items={[
              { label: 'Permanent employees', value: d.totals.permanent },
              { label: 'Freelancers', value: d.totals.freelancers, note: `${d.totals.activeFreelancers} active` },
              { label: 'On leave', value: d.totals.onLeave },
              { label: 'Accounts not active', value: d.totals.locked, note: 'Locked or invited' },
              { label: 'Required staff', value: d.totals.required, note: 'Across both shifts' },
            ]} />
            <details className="mb-5 rounded-lg border border-line p-3"><summary className="cursor-pointer text-sm font-medium">Coverage by category and department</summary>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader title="Staffing by platform category" description="Rostered permanent employees vs seats required across both shifts" />
                <ul className="divide-y divide-line p-5 pt-2">
                  {d.byCategory.map((c) =>
                <li key={c.code} className="py-3">
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <Link to={`/categories/${c.code}`} className="font-semibold hover:text-primary">{c.code}</Link>
                        <span className="text-xs text-ink-muted tabular">Morning {c.morning} · Night {c.night}</span>
                      </div>
                      <CapacityMeter used={c.employees} capacity={c.required} suffix="staffed" />
                    </li>
                )}
                </ul>
              </Card>
              <Card>
                <CardHeader title="Departments" description="Permanent headcount and freelancer bench" />
                <div className="scroll-thin overflow-x-auto p-5 pt-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                        <th className="py-2">Department</th>
                        <th className="py-2 text-right">Employees</th>
                        <th className="py-2 text-right">Active freelancers</th>
                        <th className="py-2 text-right">Free tonight</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {d.byDept.map((x) =>
                    <tr key={x.dept}>
                          <td className="py-2.5"><DeptTag dept={x.dept} /> <span className="ml-1 text-ink-muted">{deptNames[x.dept]}</span></td>
                          <td className="py-2.5 text-right tabular font-semibold">{x.employees}</td>
                          <td className="py-2.5 text-right tabular">{x.freelancers}</td>
                          <td className="py-2.5 text-right tabular">{x.availableTonight}</td>
                        </tr>
                    )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
            </details>
          </div>
        }
      </QueryView>
      <Employees embedded />
    </div>);

}
