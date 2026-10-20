import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '../../services/api';
import type { Employee } from '../../types/domain';
import { careerLabels } from '../../types/career';
import { fmtDateTime } from '../../utils/format';
import { Button } from '../ui/Button';
import { Checkbox, Field, Textarea } from '../ui/Field';
import { ErrorState, LoadingBlock } from '../ui/States';

export function EmployeeCareerSummary({employee:e}:{employee:Employee}) {
  return <div className="my-3 rounded-lg bg-mist p-3"><p className="text-xs text-ink-muted">Career level</p><p className="mt-1 text-sm font-semibold">{careerLabels[e.careerLevel ?? 'STAFF']}</p>{!e.platformCode && ['PIC','TL'].includes(e.careerLevel ?? '') && <p className="mt-2 text-xs text-warning-600">Platform responsibility needs reassignment.</p>}</div>;
}

export function EmployeeCareerHistory({employee:e}:{employee:Employee}) {
  return <section aria-label="Career history" className="p-5">{e.careerHistory?.length ? <ol className="space-y-4 border-l border-line pl-4">{e.careerHistory.map(event => <li key={event.id}><p className="text-sm font-semibold">{careerLabels[event.from]} → {careerLabels[event.to]}</p><p className="mt-1 text-xs text-ink-muted">{fmtDateTime(event.at)} · {event.actorName}</p><p className="mt-1 text-sm">{event.reason}</p><p className="mt-1 text-xs text-ink-muted">{event.dept} · {event.platformCode || 'Unassigned'}{event.supervisorAccessGranted ? ' · Supervisor access granted' : ''}</p></li>)}</ol> : <p className="text-sm text-ink-muted">No recorded career promotions.</p>}</section>;
}

export function EmployeePromotionForm({employee:e,onDone,onBusy}:{employee:Employee;onDone:()=>void;onBusy:(busy:boolean)=>void}) {
  const [reason,setReason]=useState('');
  const [grant,setGrant]=useState(false);
  const qc=useQueryClient();
  const options=useQuery({queryKey:['employee-career-options',e.id],queryFn:() => api.getEmployeeCareerOptions(e.id)});
  const save=useMutation({mutationFn:() => {
    const current=options.data;
    if (!current?.nextLevel) throw new Error('No next career level is available.');
    return api.promoteEmployee(e.id,{expectedLevel:current.currentLevel,expectedRevision:current.revision,nextLevel:current.nextLevel,reason,grantSupervisorAccess:grant});
  },onSuccess:async result => {await qc.invalidateQueries();toast.success(result.supervisorAccessGranted ? 'Promotion saved. Employee must sign in again for supervisor access.' : 'Career promotion saved');onDone();},onError:() => {void options.refetch();}});
  useEffect(() => {onBusy(save.isPending);return () => onBusy(false);},[save.isPending,onBusy]);
  if (options.isPending) return <LoadingBlock rows={3} />;
  if (options.isError) return <ErrorState error={options.error} onRetry={() => options.refetch()} />;
  const current=options.data;
  return <form className="mt-4 space-y-3" onSubmit={event => {event.preventDefault();save.mutate();}}><fieldset disabled={save.isPending} className="space-y-3">
    <h4 className="text-sm font-semibold">Career promotion</h4>
    <p className="text-sm">{careerLabels[current.currentLevel]} → {current.nextLevel ? careerLabels[current.nextLevel] : 'Highest career level'}</p>
    <p className="text-xs text-ink-muted">Department, job position and platform membership stay as recorded. Career history records this promotion.</p>
    {current.blockedReason && <p className="text-sm text-warning-600">{current.blockedReason}</p>}
    {current.nextLevel === 'SPV' && (current.hasSupervisorAccess ? <p className="text-xs text-ink-muted">This employee already has supervisor dashboard access.</p> : <>
      {current.canGrantSupervisorAccess ? <Checkbox id={`promotion-access-${e.id}`} label="Grant supervisor dashboard access" checked={grant} onChange={setGrant} /> : <p className="text-xs text-ink-muted">Supervisor access will remain unchanged. Granting access with SPV promotion requires an active linked account and account-management permission.</p>}
      {grant && <p className="text-xs text-ink-muted">The existing login becomes a supervisor login. Active sessions end; the employee must sign in again. Administrative permissions are managed separately.</p>}
      {grant && current.supervisorAccessBlocker && <p className="text-sm text-warning-600">{current.supervisorAccessBlocker} Close this form and use Unassign first.</p>}
    </>)}
    <Field label="Promotion reason" htmlFor={`promotion-reason-${e.id}`}><Textarea id={`promotion-reason-${e.id}`} value={reason} onChange={event => setReason(event.target.value)} required minLength={5} maxLength={1000} /></Field>
    <Button type="submit" size="sm" loading={save.isPending} disabled={!!current.blockedReason || !current.nextLevel || reason.trim().length < 5 || options.isFetching || (grant && !!current.supervisorAccessBlocker)}>Confirm promotion</Button>
  </fieldset>{save.isError && <p role="alert" className="text-sm text-danger-600">{errorMessage(save.error)}</p>}{e.qualifiedForProduction === false && <Link to="/training" className="text-xs text-primary underline">Open training management</Link>}</form>;
}
