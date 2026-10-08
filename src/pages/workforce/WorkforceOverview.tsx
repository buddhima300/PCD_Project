import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BriefcaseIcon, PlaneIcon, LockIcon, UserRoundCogIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { CapacityMeter } from '../../components/ui/CapacityMeter';
import { KpiTile } from '../../components/ui/KpiTile';
import { PageHeader } from '../../components/ui/PageHeader';
import { QueryView } from '../../components/ui/States';
import { DeptTag } from '../../components/ui/Tags';
import { api } from '../../services/api';
import { deptNames } from '../../utils/format';

export function WorkforceOverview() {
  const q = useQuery({ queryKey: ['workforce-overview'], queryFn: () => api.getWorkforceOverview() });
  return (
    <div>
      <PageHeader
        title="Workforce overview"
        description="Permanent employees are assigned to a platform, department and shift. Freelancers belong to one department and cover absences."
        actions={
          <div className="flex gap-2">
            <Link to="/candidates">
              <Button size="sm">Candidates</Button>
            </Link>
            <Link to="/placement-queue">
              <Button size="sm" variant="secondary">Placement Queue</Button>
            </Link>
          </div>
        }
      />
      <QueryView query={q}>
        {(d) =>
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiTile label="Permanent employees" value={d.totals.permanent} sub={`${d.totals.required} seats × 2 shifts required`} icon={BriefcaseIcon} tone="info" to="/employees" />
              <KpiTile label="Freelancers" value={d.totals.freelancers} sub={`${d.totals.activeFreelancers} active`} icon={UserRoundCogIcon} tone="violet" to="/freelancers" />
              <KpiTile label="On leave" value={d.totals.onLeave} icon={PlaneIcon} tone="warning" />
              <KpiTile label="Accounts not active" value={d.totals.locked} sub="locked or invited" icon={LockIcon} tone="danger" />
            </div>
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
          </div>
        }
      </QueryView>
    </div>);

}