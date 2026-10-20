import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '../../services/api';
import type { Employee } from '../../types/domain';
import { cn } from '../../utils/cn';

export function EmployeeLoginToggle({employee:e}:{employee:Employee}) {
  const qc=useQueryClient();
  const access=e.loginAccess;
  const enabled=!!access?.hasAccount && e.accountStatus === 'ACTIVE';
  const save=useMutation({mutationFn:() => api.setEmployeeLoginAccess(e.id,{enabled:!enabled,expectedRevision:access?.revision ?? 0}),onSuccess:async () => {await qc.invalidateQueries();toast.success(enabled ? 'Login deactivated. Existing sessions ended.' : 'Login activated. The employee can sign in again.');},onError:async error => {await qc.invalidateQueries();toast.error(errorMessage(error));}});
  return <button type="button" role="switch" aria-label={`Login access for ${e.name}`} aria-checked={enabled} aria-busy={save.isPending} disabled={!access?.canManage || save.isPending} title={access?.disabledReason || (enabled ? 'Deactivate login access' : 'Activate login access')} onClick={event => {event.stopPropagation();save.mutate();}} onKeyDown={event => event.stopPropagation()} className={cn('inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',enabled ? 'bg-green-700' : 'bg-red-700')}>
    <span aria-hidden="true" className="relative inline-flex h-4 w-7 items-center rounded-full bg-black/20"><span className={cn('h-3 w-3 rounded-full bg-white',enabled ? 'translate-x-3.5' : 'translate-x-0.5')} /></span>
    {save.isPending ? 'Saving…' : !access?.hasAccount ? 'No login' : enabled ? 'Enabled' : 'Blocked'}
  </button>;
}
