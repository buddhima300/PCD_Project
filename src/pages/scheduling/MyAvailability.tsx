import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AvailabilityCalendar } from '../../components/freelancer/AvailabilityCalendar';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { QueryView } from '../../components/ui/States';
import { useSessionStore } from '../../hooks/useSessionStore';
import { api, errorMessage } from '../../services/api';
import type { AvailabilityState, ShiftCode } from '../../types/domain';
import { TODAY } from '../../utils/clock';

const next: Record<string, AvailabilityState> = { AVAILABLE: 'UNAVAILABLE', UNAVAILABLE: 'OFF', OFF: 'AVAILABLE' };

export function MyAvailability() {
  const user = useSessionStore((s) => s.user)!;
  const qc = useQueryClient();
  const [month, setMonth] = useState(TODAY.slice(0, 7));
  const q = useQuery({ queryKey: ['freelancer', user.id, month], queryFn: () => api.getFreelancer(user.id, month) });
  const set = useMutation({
    mutationFn: (v: {date: string;shift: ShiftCode;state: AvailabilityState;}) => api.setAvailability(user.id, v.date, v.shift, v.state),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['freelancer', user.id] }),
    onError: (e) => toast.error('Availability not updated', { description: errorMessage(e) })
  });
  return (
    <div>
      <PageHeader title="My availability" description="Set when you can work, per date and shift. Tap a slot to cycle Available → Unavailable → Off. Assigned shifts are locked." />
      <Card className="p-4 md:p-5">
        <QueryView query={q}>
          {(d) =>
          <AvailabilityCalendar
            month={month}
            onMonth={setMonth}
            days={d.availability}
            freelancerId={user.id}
            editable
            pendingKey={set.isPending && set.variables ? `${set.variables.date}-${set.variables.shift}` : null}
            onToggle={(date, shift, cur) => set.mutate({ date, shift, state: next[cur] ?? 'AVAILABLE' })} />

          }
        </QueryView>
      </Card>
    </div>);

}