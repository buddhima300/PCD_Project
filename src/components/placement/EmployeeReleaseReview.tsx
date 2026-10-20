import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '../../services/api';
import { Button } from '../ui/Button';
import { Checkbox, Field, Textarea } from '../ui/Field';
import { ErrorState } from '../ui/States';

export function EmployeeReleaseReview({employeeId,onBusy}:{employeeId:string;onBusy:(busy:boolean)=>void}) {
  const [asset,setAsset]=useState('');
  const [reason,setReason]=useState('');
  const [returned,setReturned]=useState(false);
  const qc=useQueryClient();
  const info=useQuery({queryKey:['employee-release',employeeId],queryFn:() => api.getEmployeeReleaseInfo(employeeId),refetchInterval:15000});
  const save=useMutation({mutationFn:() => api.verifyEmployeeDeviceReturn(employeeId,{assetId:asset,reason,physicallyReturned:true}),onSuccess:async () => {setAsset('');setReason('');setReturned(false);await qc.invalidateQueries();toast.success('Physical return verified. Historical attendance was preserved.');},onError:() => {void info.refetch();}});
  useEffect(() => {onBusy(save.isPending);return () => onBusy(false);},[save.isPending,onBusy]);
  if (info.isPending) return <p role="status" className="mt-4 text-xs text-ink-muted">Checking device custody…</p>;
  if (info.isError) return <ErrorState error={info.error} onRetry={() => info.refetch()} />;
  const data=info.data;
  return <section className="mt-4 space-y-3 rounded-lg border border-line p-3" aria-label="Device return review"><h4 className="text-sm font-semibold">Device return</h4>
    {!data.devices.length ? <p className="text-xs text-success-600">No device is currently held by this employee.</p> : <p className="text-xs text-ink-muted">{data.instructions}</p>}
    {data.devices.map(device => <div key={device.assetId} className="space-y-2 text-xs"><p className="font-semibold">Currently held: {device.assetId} · {device.workstationId}</p><Link to={`/pools/${device.poolId}`} className="inline-block text-primary underline">View device pool</Link>{device.reviewBlocker && <p className="text-ink-muted">{device.reviewBlocker}</p>}{device.canVerifyReturn && <Button size="xs" variant="secondary" disabled={save.isPending} onClick={() => {setAsset(asset === device.assetId ? '' : device.assetId);setReason('');setReturned(false);save.reset();}}>Review physical return</Button>}</div>)}
    {asset && <form className="space-y-3 border-t border-line pt-3" onSubmit={event => {event.preventDefault();save.mutate();}}><fieldset disabled={save.isPending} className="space-y-3"><h5 className="text-sm font-semibold">Verify return of {asset}</h5><p className="text-xs text-ink-muted">Physically check the returned device before recording this review.</p><Checkbox id={`returned-${employeeId}`} checked={returned} onChange={setReturned} label="I verified that this device was physically returned" /><Field label="Return review reason" htmlFor={`return-reason-${employeeId}`}><Textarea id={`return-reason-${employeeId}`} required minLength={5} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></Field><Button size="sm" type="submit" disabled={!returned || reason.trim().length < 5} loading={save.isPending}>Record verified return</Button></fieldset>{save.isError && <p role="alert" className="text-sm text-danger-600">{errorMessage(save.error)}</p>}</form>}
  </section>;
}
