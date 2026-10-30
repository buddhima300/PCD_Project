import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { backend } from '../../services/backend';
import { announceSessionChange } from '../../services/http';
import { useSessionStore } from '../../hooks/useSessionStore';

export function ChangePasswordForm() {
  const [current, setCurrent] = useState(''); const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [error, setError] = useState('');
  const navigate = useNavigate(); const client = useQueryClient();
  const mutation = useMutation({ mutationFn: () => backend.password(current, password), onSuccess: () => {
    setCurrent(''); setPassword(''); setConfirmation('');
    useSessionStore.getState().clear(); announceSessionChange(); client.clear();
    toast.success('Password changed. Sign in with your new password.'); navigate('/login', { replace:true });
  } });
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (mutation.isPending) return; if (password !== confirmation) { setError('New passwords do not match.'); return; } setError(''); mutation.mutate(); };
  return <div id="password"><Card className="p-5"><h2 className="text-base font-semibold">Change password</h2><p className="mt-2 text-xs text-ink-muted">Use your current password to choose a new one. You will be signed out after saving.</p>
    <form onSubmit={submit} className="mt-4 grid gap-3">
      <label htmlFor="profile-current-password" className="text-xs font-medium">Current password<input id="profile-current-password" required type="password" autoComplete="current-password" maxLength={128} value={current} onChange={event => setCurrent(event.target.value)} className="app-input mt-1 block w-full rounded-lg border p-2" /></label>
      <label htmlFor="profile-new-password" className="text-xs font-medium">New password<input id="profile-new-password" required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} className="app-input mt-1 block w-full rounded-lg border p-2" /></label>
      <label htmlFor="profile-confirm-password" className="text-xs font-medium">Confirm new password<input id="profile-confirm-password" required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} className="app-input mt-1 block w-full rounded-lg border p-2" /></label>
      <div className="self-end"><Button type="submit" loading={mutation.isPending}>Change password</Button></div>
      <p className="text-xs text-ink-muted">Use 12–128 characters.</p>{(error || mutation.isError) && <p role="alert" className="text-sm text-danger">{error || mutation.error?.message}</p>}
    </form>
  </Card></div>;
}
