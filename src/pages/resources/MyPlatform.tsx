import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { MonitorIcon } from 'lucide-react';
import { PlatformRosterView } from '../../components/roster/PlatformRosterView';
import { Card } from '../../components/ui/Card';
import { CapacityMeter } from '../../components/ui/CapacityMeter';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { api } from '../../services/api';
import { TODAY } from '../../utils/clock';
import { deptNames } from '../../utils/format';

export function MyPlatform() {
  const q = useQuery({ queryKey: ['my-work'], queryFn: () => api.getMyWork() });
  return (
    <QueryView query={q}>
      {(w) => {
        const p = w.platform;
        if (!p) return <div><PageHeader title="My platform" /><Card><EmptyState icon={MonitorIcon} title="No platform assignment" description="You’ll see your platform here once you are assigned to a replacement." /></Card></div>;
        return (
          <div>
            <PageHeader title={`My platform · ${p.code}`} meta={<StatusBadge status={p.opStatus} />} description={`Category ${p.categoryCode} · You work in ${w.person.dept} (${deptNames[w.person.dept]})`} />
            <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {p.occupancy.map((o) =>
              <Card key={o.dept} className={o.dept === w.person.dept ? 'p-4 ring-2 ring-primary/30' : 'p-4'}>
                  <p className="mb-2 text-sm font-semibold">{o.dept} · {deptNames[o.dept]}</p>
                  <CapacityMeter used={o.occupiedNow} capacity={o.capacity} />
                </Card>
              )}
            </div>
            <PlatformRosterView code={p.code} date={TODAY} linkPeople={false} />
          </div>);

      }}
    </QueryView>);

}