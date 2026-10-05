import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOutIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { useSessionStore } from '../../hooks/useSessionStore';

export function Profile() {
  const user = useSessionStore((s) => s.user);
  const signOut = useSessionStore((s) => s.signOut);
  const navigate = useNavigate();
  if (!user) return null;
  const initials = user.name.split(' ').map((p) => p[0]).slice(0, 2).join('');
  return (
    <div>
      <PageHeader title="Profile" description="Your account details. Contact your manager to change operational assignments." />
      <Card className="max-w-xl p-5">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-lg font-semibold text-primary-700">{initials}</span>
          <div>
            <p className="text-lg font-semibold">{user.name}</p>
            <p className="text-sm text-ink-muted">{user.title}</p>
          </div>
        </div>
        <dl className="mt-5 divide-y divide-line border-t border-line text-sm">
          {[['ID', user.id], ['Email', user.email], ['Role', user.role.charAt(0) + user.role.slice(1).toLowerCase()]].map(([l, v]) =>
          <div key={l} className="flex justify-between py-2.5"><dt className="text-ink-muted">{l}</dt><dd className="font-medium">{v}</dd></div>
          )}
        </dl>
        <Button variant="secondary" size="sm" className="mt-4" icon={<LogOutIcon className="h-3.5 w-3.5" />} onClick={() => {signOut();navigate('/login');}}>Sign out</Button>
      </Card>
    </div>);

}