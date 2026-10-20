import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api,errorMessage } from '../../services/api';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Checkbox,Field,Select,Textarea } from '../ui/Field';
import type { PlatformTrainingAssignment,ShiftCode } from '../../types/domain';
import type { VacancySelection } from './WorkforceVacancies';

export function ProductionAssignment({training,placement,onClose}:{training?:PlatformTrainingAssignment;placement?:VacancySelection;onClose:()=>void}) {
  const [trainingId,setTrainingId]=useState(training?.id??'');
  const [platform,setPlatform]=useState(placement?.platformCode??training?.platformCode??'');
  const [shift,setShift]=useState<ShiftCode>(placement?.shift??training?.shift??'MORNING');
  const qc=useQueryClient();
  const people=useQuery({queryKey:['trainings'],queryFn:()=>api.listTrainings()});
  const vacancies=useQuery({queryKey:['workforce-vacancies'],queryFn:()=>api.getWorkforceVacancies()});
  const ready=(people.data??[]).filter(t=>!t.promotedAt&&t.trainingStatus==='TRAINING_COMPLETED'&&t.evaluation?.result==='PASSED'&&(!placement||t.dept===placement.dept));
  const person=training??ready.find(t=>t.id===trainingId);
  const context=useQuery({queryKey:['training-staff-context',person?.id],queryFn:()=>api.getTrainingStaffContext(person!.id),enabled:!!person});
  const [recoveryId,setRecoveryId]=useState(''),[samePerson,setSamePerson]=useState(false),[recoveryReason,setRecoveryReason]=useState('');
  useEffect(()=>{setRecoveryId('');setSamePerson(false);setRecoveryReason('');},[person?.id]);
  const recover=useMutation({mutationFn:()=>api.linkTrainingStaff(person!.id,{workerId:recoveryId,samePerson:true,reason:recoveryReason,expectedWorkerId:person!.workerId}),onSuccess:async()=>{save.reset();setRecoveryId('');setSamePerson(false);setRecoveryReason('');await qc.invalidateQueries();toast.success('Training linked to the registered staff record. You can now assign the platform.');}});
  const capacity=vacancies.data?.find(p=>p.code===platform)?.departments.find(d=>d.dept===person?.dept)?.shifts[shift];
  const sameSeat=person?.platformCode===platform&&person?.shift===shift;
  const allowed=!!capacity&&(capacity.available>0||sameSeat);
  const save=useMutation({mutationFn:()=>api.assignQualifiedWorker(person!.id,{platformCode:platform,shift}),onSuccess:async result=>{onClose();await qc.invalidateQueries();toast.success(`Assigned as ${result.staffNumber??'production staff'}`,{description:'The staff directory now contains this person. Their login and training history are preserved.'});}});
  return <Dialog open onClose={()=>{if(!save.isPending&&!recover.isPending)onClose();}} title="Assign qualified staff" description="Choose a current or new production platform and shift within the trainee’s department." footer={<><Button variant="secondary" disabled={save.isPending||recover.isPending} onClick={onClose}>Cancel</Button><Button disabled={!person||!allowed||vacancies.isFetching||context.isPending||context.isError||context.data?.missing||recover.isPending} loading={save.isPending} onClick={()=>save.mutate()}>Confirm assignment</Button></>}>
    <fieldset disabled={save.isPending||recover.isPending} className="space-y-4">
      {training?<p className="text-sm font-semibold">{training.workerName} · {training.candidateReference??training.workerId} · {training.dept}</p>:<Field label="Qualified staff member" htmlFor="production-person"><Select id="production-person" value={trainingId} onChange={e=>{setTrainingId(e.target.value);save.reset();}} placeholder="Choose qualified trainee" options={ready.map(t=>({value:t.id,label:`${t.workerName} · ${t.candidateReference??t.workerId}`}))}/></Field>}
      {context.data?.missing&&person&&<section className="space-y-3 rounded-xl border border-warning/40 p-4" aria-label="Recover training staff record"><p className="text-sm font-medium">This training is missing its staff record</p><p className="text-xs leading-relaxed text-ink-muted">Link the same person’s active registered staff record to retain their completed training. If they are not registered, complete their registration first; then return here. Training days and evaluation are preserved.</p><Link className="inline-block text-sm font-medium text-primary-700 underline" to={`/register?training=${encodeURIComponent(person.id)}`}>Register this staff member</Link><Field label="Registered staff record" htmlFor="training-recovery-worker"><Select id="training-recovery-worker" value={recoveryId} onChange={e=>setRecoveryId(e.target.value)} placeholder="Choose the same registered person" options={context.data.options.map(w=>({value:w.id,label:`${w.name} · ${w.reference}`}))}/></Field>{!context.data.options.length&&<p className="text-xs text-ink-muted">No eligible registered staff in this department and employment type.</p>}<Checkbox id="training-recovery-same-person" label="I confirm this is the same person who completed this training" checked={samePerson} onChange={setSamePerson}/><Field label="Link correction reason" htmlFor="training-recovery-reason"><Textarea id="training-recovery-reason" value={recoveryReason} onChange={e=>setRecoveryReason(e.target.value)}/></Field><Button variant="secondary" loading={recover.isPending} disabled={!recoveryId||!samePerson||recoveryReason.trim().length<5} onClick={()=>recover.mutate()}>Link registered staff</Button></section>}
      {!training&&people.isSuccess&&!ready.length&&<p className="text-sm text-ink-muted">No qualified trainees in this department are awaiting assignment.</p>}
      <Field label="Platform" htmlFor="production-platform"><Select id="production-platform" value={platform} onChange={e=>setPlatform(e.target.value)} placeholder="Choose platform" options={(vacancies.data??[]).filter(p=>!person||p.departments.some(d=>d.dept===person.dept)).map(p=>({value:p.code,label:`${p.code} · ${p.name}`}))}/></Field>
      <Field label="Shift" htmlFor="production-shift"><Select id="production-shift" value={shift} onChange={e=>setShift(e.target.value as ShiftCode)} options={[{value:'MORNING',label:'Morning'},{value:'NIGHT',label:'Night'}]}/></Field>
      {capacity&&<p className="text-xs text-ink-muted">{capacity.used}/{capacity.capacity} seats occupied · {capacity.available} free{sameSeat?' · This trainee’s current seat is already reserved.':''}</p>}
      {person&&capacity&&!allowed&&<p className="text-sm text-danger-600">This shift is full. Choose another platform or shift.</p>}
      {[people.error,vacancies.error,context.error,recover.error,save.error].filter(Boolean).map((e,i)=><p key={i} role="alert" className="text-sm text-danger-600">{errorMessage(e)}</p>)}
    </fieldset>
  </Dialog>;
}
