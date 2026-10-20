import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { api, ApiError, errorMessage } from '../../services/api';
import type { Employee, ShiftCode } from '../../types/domain';
import { useSessionStore } from '../../hooks/useSessionStore';
import { Button } from '../ui/Button';
import { Field, Select, Textarea } from '../ui/Field';
import { ErrorState } from '../ui/States';
import { EmployeePromotionForm } from './EmployeeCareer';
import { EmployeeReleaseReview } from './EmployeeReleaseReview';

export function EmployeePlatformAction({employee:e}: {employee:Employee}) {
  const supervisor = useSessionStore(s => s.user?.role === 'SUPERVISOR');
  const [action,setAction] = useState<'assign'|'unassign'|'promote'|null>(null);
  const [promotionBusy,setPromotionBusy] = useState(false);
  const [releaseBusy,setReleaseBusy] = useState(false);
  const open=action === 'assign';
  const [platform,setPlatform] = useState('');
  const [shift,setShift] = useState<ShiftCode>(e.shift);
  const [reason,setReason] = useState('');
  const qc = useQueryClient();
  const options = useQuery({queryKey:['employee-platform-options',e.id,shift],queryFn:() => api.getEmployeePlatformOptions(e.id,shift),enabled:open && supervisor});
  const save = useMutation({mutationFn:() => api.setEmployeePlatform(e.id,{platformCode:platform,shift,expectedPlatform:e.platformCode ?? '',reason}),onSuccess:async () => {setAction(null);setReason('');setPlatform('');await qc.invalidateQueries();toast.success('Platform assignment saved');},onError:() => {void options.refetch();}});
  const unassign=useMutation({mutationFn:() => api.unassignEmployeePlatform(e.id,{expectedPlatform:e.platformCode,reason}),onSuccess:async () => {setAction(null);setReason('');await qc.invalidateQueries();toast.success('Employee unassigned. Platform capacity released.');}});
  const busy=save.isPending || unassign.isPending || promotionBusy || releaseBusy;
  const toggle=(next:typeof action) => {setAction(action === next ? null : next);setReason('');save.reset();unassign.reset();};
  if (!supervisor) return null;
  const label = e.platformCode ? 'Change' : 'Assign';
  const selected = options.data?.find(p => p.code === platform);
  return <div className="my-4 rounded-xl border border-line p-4">
    <div><h3 className="text-sm font-semibold">Employee actions</h3><p className="mt-1 text-xs text-ink-muted">{e.platformCode || 'Unassigned'} · shared device pool</p></div>
    <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={busy} aria-expanded={open} onClick={() => toggle('assign')}>{open ? 'Close' : label}</Button>{e.platformCode && <Button size="sm" variant={action === 'unassign' ? 'secondary' : 'danger'} disabled={busy} aria-expanded={action === 'unassign'} onClick={() => toggle('unassign')}>{action === 'unassign' ? 'Close unassign' : 'Unassign'}</Button>}<Button size="sm" variant="secondary" disabled={busy || e.careerLevel === 'SPV'} aria-expanded={action === 'promote'} onClick={() => toggle('promote')}>{action === 'promote' ? 'Close promotion' : 'Promote'}</Button></div>
    {e.careerLevel === 'SPV' && <p className="mt-2 text-xs text-ink-muted">Highest career level reached.</p>}
    {action === 'promote' && <EmployeePromotionForm employee={e} onBusy={setPromotionBusy} onDone={() => setAction(null)} />}
    {action === 'unassign' && <EmployeeReleaseReview employeeId={e.id} onBusy={setReleaseBusy} />}
    {action === 'unassign' && <form className="mt-4 space-y-3" onSubmit={event => {event.preventDefault();unassign.mutate();}}><fieldset disabled={unassign.isPending} className="space-y-3"><h4 className="text-sm font-semibold">Unassign from {e.platformCode}</h4><p className="text-xs text-ink-muted">Release this staffing position and close the current assignment. Employment, career level and historical records remain active.</p>{['PIC','TL'].includes(e.careerLevel ?? '') && <p className="text-xs text-warning-600">Platform responsibility will need reassignment.</p>}<Field label="Unassignment reason" htmlFor={`unassign-reason-${e.id}`}><Textarea id={`unassign-reason-${e.id}`} required minLength={5} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></Field><Button size="sm" type="submit" variant="danger" loading={unassign.isPending} disabled={reason.trim().length < 5 || releaseBusy}>Confirm unassign</Button></fieldset>{unassign.isError && <ActionError error={unassign.error} employee={e} />}</form>}
    {open && <form className="mt-4 space-y-3" onSubmit={event => {event.preventDefault();save.mutate();}}><fieldset disabled={save.isPending} className="space-y-3">
      {e.qualifiedForProduction === false && <p className="text-sm text-warning-600">{e.lifecycle === 'TRAINING_COMPLETED' ? <>Training passed. <Link to="/workforce/assignments" className="font-semibold underline">Assign a production platform</Link></> : <>Complete training before production assignment. <Link to="/training" className="font-semibold underline">Open training</Link></>}</p>}
      <p className="text-xs text-ink-muted">Department: {e.dept}. Choose a platform and shift; devices are shared by the platform’s staff.</p>
      <Field label="Shift" htmlFor={`employee-shift-${e.id}`}><Select id={`employee-shift-${e.id}`} value={shift} onChange={event => {setShift(event.target.value as ShiftCode);setPlatform('');}} options={[{value:'MORNING',label:'Morning'},{value:'NIGHT',label:'Night'}]} /></Field>
      <Field label="Platform" htmlFor={`employee-platform-${e.id}`}><Select id={`employee-platform-${e.id}`} value={platform} onChange={event => setPlatform(event.target.value)} placeholder={options.isPending ? 'Loading platforms…' : 'Choose a platform'} options={(options.data ?? []).map(p => ({value:p.code,label:`${p.code} · ${p.name} · ${p.available}/${p.capacity} places free`}))} /></Field>
      {options.isError && <ErrorState error={options.error} onRetry={() => options.refetch()} />}
      {options.data?.length === 0 && <p className="text-xs text-ink-muted">No other active platforms are configured for this department.</p>}
      {selected && <p className="text-xs text-ink-muted">{selected.used} staff / {selected.capacity} device capacity · {selected.usableDevices} registered usable devices{selected.usableDevices < selected.used+1 ? ' · Equipment provisioning needed before work begins.' : ''}</p>}
      <Field label="Reason" htmlFor={`employee-reason-${e.id}`}><Textarea id={`employee-reason-${e.id}`} required minLength={5} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></Field>
      <p className="text-xs text-ink-muted">Return any device currently held and resolve future off-days or replacement coverage before moving an assigned employee.</p>
      <Button type="submit" size="sm" loading={save.isPending} disabled={e.qualifiedForProduction === false || !selected?.available || reason.trim().length < 5 || options.isFetching}>{label} platform</Button>
    </fieldset>{save.isError && <ActionError error={save.error} employee={e} />}</form>}
  </div>;
}

function ActionError({error,employee}:{error:unknown;employee:Employee}) {
  const code=error instanceof ApiError ? error.code : '';
  const routes:Record<string,{to:string;label:string}>={DEVICE_RETURN_REQUIRED:{to:'/equipment',label:'Review device return'},TRAINING_REQUIRED:{to:'/training',label:'Review training'},REPLACEMENT_CONFLICT:{to:'/replacements',label:'Review replacements'},OFFDAY_CONFLICT:{to:'/off-days',label:'Review off-day requests'},ALLOCATION_CONFLICT:{to:`/pools/${employee.poolId}`,label:'Review equipment reservations'}};
  const link=routes[code];
  return <div role="alert" className="space-y-2 text-sm text-danger-600"><p>{errorMessage(error)}</p>{link && <Link to={link.to} className="text-xs text-primary underline">{link.label}</Link>}</div>;
}
