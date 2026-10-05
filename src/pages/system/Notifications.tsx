import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellIcon, MailIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Checkbox, Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, QueryView } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { api } from '../../services/api';
import type { NotificationItem } from '../../types/domain';
import { cn } from '../../utils/cn';
import { fmtDateTime, relative } from '../../utils/format';

const TYPES = ['OFFDAY_APPROVED', 'OFFDAY_REJECTED', 'OFFDAY_OVERRIDE', 'SHIFT_CHANGED', 'ROTATION', 'REPLACEMENT_ASSIGNED', 'EMERGENCY_REPLACEMENT', 'PLATFORM_ASSIGNMENT', 'WORKSTATION_ASSIGNED', 'HANDOVER_REQUIRED', 'LAPTOP_INCIDENT', 'ROSTER_UPDATED', 'PLATFORM_CONFIG_CHANGED'];

export function Notifications() {
  const qc = useQueryClient();
  const [type, setType] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [sel, setSel] = useState<NotificationItem | null>(null);
  const q = useQuery({ queryKey: ['notifications', type, unreadOnly], queryFn: () => api.listNotifications({ type, unreadOnly }) });
  const inv = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const mark = useMutation({ mutationFn: (v: {id: string;read: boolean;}) => api.markNotificationRead(v.id, v.read), onSuccess: inv });
  const all = useMutation({ mutationFn: () => api.markAllNotificationsRead(), onSuccess: inv });
  const label = (t: string) => t.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

  return (
    <div>
      <PageHeader title="Notifications" description="In-app notifications with email delivery status." actions={<Button size="sm" variant="secondary" loading={all.isPending} onClick={() => all.mutate()}>Mark all read</Button>} />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card>
          <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
            <Select compact className="w-56" aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} placeholder="All types" options={TYPES.map((t) => ({ value: t, label: label(t) }))} />
            <Checkbox id="unread" label="Unread only" checked={unreadOnly} onChange={setUnreadOnly} />
            {q.data && <span className="ml-auto text-xs text-ink-muted">{q.data.unread} unread</span>}
          </div>
          <QueryView query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState icon={BellIcon} title="No notifications" />}>
            {(d) =>
            <ul className="divide-y divide-line">
                {d.items.map((n) =>
              <li key={n.id}>
                    <button onClick={() => {setSel(n);if (!n.read) mark.mutate({ id: n.id, read: true });}} className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-mist/60', sel?.id === n.id && 'bg-primary-50/60')}>
                      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-line-strong' : 'bg-primary')} aria-label={n.read ? 'Read' : 'Unread'} />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-sm', !n.read && 'font-semibold')}>{n.title}</span>
                        <span className="block truncate text-xs text-ink-muted">{n.body}</span>
                      </span>
                      <span className="shrink-0 text-[11px] text-ink-subtle">{relative(n.createdAt)}</span>
                    </button>
                  </li>
              )}
              </ul>
            }
          </QueryView>
        </Card>
        <Card className="h-fit p-5">
          {sel ?
          <div className="space-y-3">
              <p className="text-xs font-medium text-ink-muted">{label(sel.type)}</p>
              <h2 className="text-base font-semibold">{sel.title}</h2>
              <p className="text-sm text-ink-muted">{sel.body}</p>
              <p className="text-xs text-ink-subtle">{fmtDateTime(sel.createdAt)}</p>
              <p className="flex items-center gap-2 text-xs"><MailIcon className="h-3.5 w-3.5" /> Email <StatusBadge status={sel.emailStatus} size="xs" /></p>
              <div className="flex gap-2">
                {sel.link && <Link to={sel.link}><Button size="sm">Open</Button></Link>}
                <Button size="sm" variant="ghost" onClick={() => {mark.mutate({ id: sel.id, read: false });setSel({ ...sel, read: false });}}>Mark unread</Button>
              </div>
            </div> :
          <EmptyState title="Select a notification" className="py-8" />}
        </Card>
      </div>
    </div>);

}