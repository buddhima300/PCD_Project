import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../services/api';
import type { Laptop } from '../../types/domain';
import { Dialog } from '../ui/Dialog';
import { Field, Input, Select } from '../ui/Field';
import { Button } from '../ui/Button';

export function LaptopModelEditor({ laptop }: { laptop: Laptop }) {
  const cache = useQueryClient();
  const models = useQuery({ queryKey: ['laptop-models'], queryFn: () => api.listLaptopModels() });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const save = useMutation({
    mutationFn: async ({model, create = false}: {model:string;create?:boolean}) => {
      const selected = create ? await api.addLaptopModel(model) : model;
      return api.updateLaptopModel(laptop.assetId, {model:selected, expectedModel:laptop.model});
    },
    onSuccess: async () => {setAdding(false);setName('');await cache.invalidateQueries();},
    onError: () => {void cache.invalidateQueries({queryKey:['workstations']});},
  });
  return <div onClick={e => e.stopPropagation()} onKeyDown={e => {if(e.key==='Enter')e.stopPropagation();}} className="min-w-56">
    <Select compact aria-label={`Laptop model for ${laptop.assetId}`} value={laptop.model} disabled={save.isPending || models.isPending || models.isError}
      options={[...new Set([laptop.model,...(models.data??[])])].map(model=>({value:model,label:model})).concat([{value:'__ADD_MODEL__',label:'+ Add new laptop model…'}])}
      onChange={e=>{save.reset();if(e.target.value==='__ADD_MODEL__'){setName('');setAdding(true);}else save.mutate({model:e.target.value});}} />
    {save.isPending && <p role="status" className="mt-1 text-xs text-ink-muted">Saving model…</p>}
    {models.isError && <button className="mt-1 text-xs text-primary underline" onClick={()=>models.refetch()}>Retry loading models</button>}
    {save.isError && !adding && <p role="alert" className="mt-1 whitespace-normal text-xs text-danger-600">{errorMessage(save.error)}</p>}
    <Dialog open={adding} onClose={()=>{if(!save.isPending)setAdding(false);}} title="Add laptop model" description={`Save a model and apply it to ${laptop.assetId}.`}>
      <form className="space-y-4" onSubmit={e=>{e.preventDefault();save.mutate({model:name.trim(),create:true});}}>
        <Field label="Laptop model name" htmlFor={`new-model-${laptop.assetId}`}><Input id={`new-model-${laptop.assetId}`} required maxLength={100} value={name} disabled={save.isPending} onChange={e=>setName(e.target.value)} /></Field>
        {save.isError && <p role="alert" className="text-sm text-danger-600">{errorMessage(save.error)}</p>}
        <Button type="submit" loading={save.isPending} disabled={!name.trim()}>Add and apply model</Button>
      </form>
    </Dialog>
  </div>;
}
