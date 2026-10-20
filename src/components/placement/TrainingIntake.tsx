import { useState } from 'react';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api,errorMessage } from '../../services/api';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field,Input,Select,Textarea } from '../ui/Field';
import type { RecruitCandidate,ShiftCode } from '../../types/domain';
import type { VacancySelection } from './WorkforceVacancies';

export function TrainingIntake({candidate,placement,onClose}:{candidate?:RecruitCandidate;placement?:VacancySelection;onClose:()=>void}) {
  const [worker,setWorker]=useState(candidate?.id??'');
  const [platform,setPlatform]=useState(placement?.platformCode??'');
  const [shift,setShift]=useState<ShiftCode>(placement?.shift??'MORNING');
  const [days,setDays]=useState(5);const [notes,setNotes]=useState('');
  const qc=useQueryClient();
  const candidates=useQuery({queryKey:['candidates'],queryFn:()=>api.listCandidates({})});
  const vacancies=useQuery({queryKey:['workforce-vacancies'],queryFn:()=>api.getWorkforceVacancies()});
  const person=candidate??candidates.data?.find(c=>c.id===worker);
  const choices=(candidates.data??[]).filter(c=>!placement||c.dept===placement.dept);
  const capacity=vacancies.data?.find(p=>p.code===platform)?.departments.find(d=>d.dept===person?.dept)?.shifts[shift];
  const save=useMutation({mutationFn:()=>api.assignPlatformWorker(platform,{workerId:person!.registeredWorkerId??person!.id,kind:'TRAINING',dept:person!.dept,shift,trainingDays:days,trainingNotes:notes}),onSuccess:async()=>{onClose();await qc.invalidateQueries();toast.success('Candidate moved to Training');}});
  return <Dialog open onClose={()=>{if(!save.isPending)onClose();}} title="Assign candidate to training" description="Training shares platform devices with production staff. This reserves capacity only for the selected shift." footer={<><Button variant="secondary" disabled={save.isPending} onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!person||!capacity?.available||!Number.isInteger(days)||days<1||days>90||vacancies.isFetching} onClick={()=>save.mutate()}>Start training</Button></>}>
    <fieldset disabled={save.isPending} className="space-y-4">
      {candidate?<p className="text-sm font-semibold">{candidate.name} · {candidate.candidateReference??candidate.id} · {candidate.dept}</p>:<Field label="Candidate" htmlFor="training-candidate"><Select id="training-candidate" value={worker} onChange={e=>setWorker(e.target.value)} placeholder="Choose candidate" options={choices.map(c=>({value:c.id,label:`${c.name} · ${c.candidateReference??c.id}`}))}/></Field>}
      <Field label="Training platform" htmlFor="training-platform"><Select id="training-platform" value={platform} onChange={e=>{setPlatform(e.target.value);save.reset();}} placeholder="Choose platform" options={(vacancies.data??[]).filter(p=>!person||p.departments.some(d=>d.dept===person.dept)).map(p=>({value:p.code,label:`${p.code} · ${p.name}`}))}/></Field>
      <Field label="Shift" htmlFor="training-shift"><Select id="training-shift" value={shift} onChange={e=>setShift(e.target.value as ShiftCode)} options={[{value:'MORNING',label:'Morning'},{value:'NIGHT',label:'Night'}]}/></Field>
      {capacity&&<p className="text-xs text-ink-muted">{capacity.production} production + {capacity.training} training / {capacity.capacity} seats · {capacity.available} free</p>}
      {capacity&&!capacity.available&&<p className="text-sm text-danger-600">This shift is full. Choose another platform or shift.</p>}
      <Field label="Training days" htmlFor="training-duration"><Input id="training-duration" type="number" min={1} max={90} value={days} onChange={e=>setDays(Number(e.target.value))}/></Field>
      <Field label="Training notes" htmlFor="training-notes"><Textarea id="training-notes" maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/></Field>
      {[candidates.error,vacancies.error,save.error].filter(Boolean).map((e,i)=><p key={i} role="alert" className="text-sm text-danger-600">{errorMessage(e)}</p>)}
    </fieldset>
  </Dialog>;
}
