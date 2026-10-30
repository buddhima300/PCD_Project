import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AvailabilityCalendar } from '../../components/freelancer/AvailabilityCalendar';
import { UpcomingSeats } from '../../components/freelancer/UpcomingSeats';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { QueryView } from '../../components/ui/States';
import { useSessionStore } from '../../hooks/useSessionStore';
import { api, errorMessage } from '../../services/api';
import type { AvailabilityState, ShiftCode } from '../../types/domain';
import { businessDate } from '../../utils/shiftTime';
import '../../components/roster/roster.css';

const next: Record<string, AvailabilityState> = { AVAILABLE: 'UNAVAILABLE', UNAVAILABLE: 'OFF', OFF: 'AVAILABLE' };

export function MyAvailability() {
  const [params, setParams] = useSearchParams();
  const user = useSessionStore((s) => s.user)!;
  const qc = useQueryClient();
  const [month, updateMonth] = useState(() => /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month') ?? '') ? params.get('month')! : businessDate().slice(0, 7));
  const setMonth = (value: string) => { updateMonth(value); setParams(previous => { const next = new URLSearchParams(previous); next.set('month', value); return next; }); };
  const q = useQuery({ queryKey: ['freelancer', user.id, month], queryFn: () => api.getFreelancer(user.id, month), refetchInterval: 15000 });
  const set = useMutation({
    mutationFn: (v: {date: string;shift: ShiftCode;state: AvailabilityState;}) => api.setAvailability(user.id, v.date, v.shift, v.state),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['freelancer', user.id] }); qc.invalidateQueries({ queryKey: ['roster-workspace'] }); qc.invalidateQueries({queryKey:['my-seat-vacancies']}); },
    onError: (e) => toast.error('Availability not updated', { description: errorMessage(e) })
  });
  return (
    <div className="roster-workspace">
      <p className="roster-eyebrow mb-2">YOUR TIME / YOUR AVAILABILITY</p>
      <PageHeader title="My availability" description="Choose when you can support your team, up to 60 days ahead. Tap a slot to cycle Available → Unavailable → Off. Assigned shifts stay locked until a supervisor releases them." />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="min-w-0 p-4 md:p-5">
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
      <aside aria-label="Upcoming seats and vacancy requests"><UpcomingSeats month={month}/></aside>
      </div>
    </div>);

}
