import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '../../services/api';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, Input } from '../ui/Field';

export function RegisterPlatformDevice({poolId,workstationId}:{poolId:string;workstationId?:string}) {
  const [open,setOpen] = useState(false);
  const [assetId,setAssetId] = useState('');
  const [serial,setSerial] = useState('');
  const [model,setModel] = useState('');
  const qc = useQueryClient();
  const save = useMutation({mutationFn:() => api.registerPlatformDevice({poolId,...(workstationId ? {workstationId} : {}),assetId,serial,model}),onSuccess:async () => {setOpen(false);setAssetId('');setSerial('');setModel('');await qc.invalidateQueries();toast.success('Shared device registered');}});
  return <><Button size="sm" onClick={() => {save.reset();setOpen(true);}}>Register device</Button><Dialog open={open} onClose={() => {if (!save.isPending) setOpen(false);}} title="Register shared platform device" description="Register shared platform equipment within this pool’s configured capacity.">
    <form className="space-y-4" onSubmit={e => {e.preventDefault();save.mutate();}}><fieldset disabled={save.isPending} className="space-y-4">
      <Field label="Asset ID" htmlFor="register-device-id"><Input id="register-device-id" required maxLength={80} pattern="[A-Za-z0-9_-]+" value={assetId} onChange={e => setAssetId(e.target.value)} /></Field>
      <Field label="Serial number" htmlFor="register-device-serial"><Input id="register-device-serial" required maxLength={100} value={serial} onChange={e => setSerial(e.target.value)} /></Field>
      <Field label="Model" htmlFor="register-device-model"><Input id="register-device-model" required maxLength={100} value={model} onChange={e => setModel(e.target.value)} /></Field>
      <Button type="submit" loading={save.isPending}>Register device</Button>
    </fieldset>{save.isError && <p role="alert" className="text-sm text-danger-600">{errorMessage(save.error)}</p>}</form>
  </Dialog></>;
}
