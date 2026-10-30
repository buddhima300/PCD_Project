import { useRef,useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData,useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { CalendarDays,GraduationCap,ShieldCheck } from 'lucide-react';
import { api,errorMessage } from '../../services/api';
import type { IncrementEmployee,IncrementProgress,IncrementScope } from '../../types/incrementExams';
import { useSessionStore } from '../../hooks/useSessionStore';
import { businessDate,businessDateTime,addCalendarDays } from '../../utils/shiftTime';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field,Input,Select,Textarea } from '../ui/Field';
import { Pagination } from '../ui/Pagination';

function ProgressSummary({progress:p}:{progress:IncrementProgress}) {
  return <div className="space-y-3">
    <div className="flex items-end justify-between gap-3"><p className="text-3xl font-semibold tabular-nums">{p.creditedDays}<span className="text-sm font-normal text-ink-muted"> / 90 qualifying days</span></p><span className="text-xs font-medium text-primary">{p.eligible?'Eligible for exam':`${p.remainingDays} days remaining`}</span></div>
    <div role="progressbar" aria-label="Increment exam qualifying days" aria-valuemin={0} aria-valuemax={90} aria-valuenow={Math.min(90,p.creditedDays)} aria-valuetext={`${p.creditedDays} of 90 qualifying days`} className="h-2 overflow-hidden rounded-full bg-mist"><div className="h-full rounded-full bg-primary" style={{width:`${p.percent}%`}}/></div>
    <p className="text-xs text-ink-muted">From joining date {p.joinedAt??'not recorded'} · Approved off-days included · Absences and full-day leave excluded</p>
    <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">{[['Verified history',p.breakdown.opening],['Confirmed work',p.breakdown.working],['Approved off-days',p.breakdown.offDays],['Half-day credit',p.breakdown.halfDays],['Excluded dates',p.breakdown.excluded],['Unverified dates',p.breakdown.unverified]].map(([label,value])=><div key={label} className="rounded-lg border border-line p-2.5"><dt className="text-ink-muted">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd></div>)}</dl>
    {p.verificationRequired&&<p role="alert" className="text-xs text-amber-700">Employment dates or the historical balance need supervisor verification.</p>}
    {!p.active&&<p className="text-xs text-ink-muted">An active employee login and employment status are required to appoint an exam.</p>}
    {p.breakdown.unverified>0&&<p className="text-xs text-ink-muted">Unverified dates are not assumed to be absence. A supervisor can reconcile historical attendance.</p>}
    {p.baseline&&<p className="rounded-lg bg-mist p-3 text-xs leading-5">Verified through {p.baseline.throughDate}: {p.baseline.creditedDays} days. {p.baseline.reason}{!p.baseline.valid?' · Balance requires review.':''}</p>}
  </div>;
}
function AppointmentSummary({employee}:{employee:IncrementEmployee}) {
  const appointment=employee.appointment;
  if(!appointment)return <p className="text-sm text-ink-muted">{employee.progress.eligible?'You are eligible. Your supervisor can appoint the physical exam.':'Your exam appointment will appear here when scheduled.'}</p>;
  return <div className="space-y-2 rounded-xl border border-line p-4 text-sm"><p className="flex items-center gap-2 font-semibold"><CalendarDays className="h-4 w-4"/>{appointment.status==='CANCELLED'?'Appointment cancelled':'Physical increment exam'}</p><p>{businessDateTime(appointment.startsAt)} <span className="text-xs text-ink-muted">Asia/Colombo</span></p><p className="break-words">{appointment.location}</p>{appointment.instructions&&<p className="whitespace-pre-wrap break-words text-ink-muted">{appointment.instructions}</p>}<p className="text-xs text-ink-muted">Appointed by {appointment.appointedBy}</p>{employee.appointmentNeedsReview&&<p role="alert" className="text-xs text-amber-700">Eligibility changed after scheduling. The appointment needs supervisor review.</p>}</div>;
}
export function IncrementProgressCard() {
  const q=useQuery({queryKey:['increment','my-progress'],queryFn:()=>api.getIncrementProgress(),refetchInterval:15000});
  return <section id="increment-exam" className="scroll-mt-20"><Card className="space-y-4 p-5"><h2 className="flex items-center gap-2 font-semibold"><GraduationCap className="h-5 w-5 text-primary"/>Your increment exam journey</h2><p className="text-xs text-ink-muted">Lifetime qualifying progress, independent of the attendance date filter below.</p>
    {q.isPending&&<p role="status">Loading qualifying days…</p>}
    {q.isError&&<p role="alert" className="text-sm text-danger-600">{q.data?'Showing the last successful update. ':''}{errorMessage(q.error)} <button className="underline" onClick={()=>q.refetch()}>Retry</button></p>}
    {q.data&&<><ProgressSummary progress={q.data.progress}/><AppointmentSummary employee={q.data}/><p className="text-xs text-ink-muted">A half-day earns 0.5 day with confirmed work. A completed eight-hour shift earns one day. Only completed roster dates count.</p>{!!q.data.history?.length&&<details><summary className="cursor-pointer text-xs font-medium">Appointment and verification history</summary><ol className="mt-3 space-y-3">{q.data.history.map(e=><li key={e.id} className="border-l-2 border-line pl-3 text-xs leading-5"><strong>{e.kind.replace(/_/g,' ')}</strong> · {businessDateTime(e.recordedAt)}<br/>{e.reason}<br/><span className="text-ink-muted">{e.actorName}</span></li>)}</ol></details>}</>}
  </Card></section>;
}

export function IncrementEligibilityPanel() {
  const [scope,setScope]=useState<IncrementScope>({status:'ELIGIBLE',search:'',page:1,pageSize:8});
  const [selected,setSelected]=useState<string|null>(null);
  const [editing,setEditing]=useState<{kind:'SCHEDULE'|'BALANCE'|'CANCEL';employee:IncrementEmployee}|null>(null);
  const canVerify=useSessionStore(s=>s.permissions.includes('attendance.correct'));
  const q=useQuery({queryKey:['increment','eligible',scope],queryFn:()=>api.listIncrementEligibility(scope),placeholderData:keepPreviousData,refetchInterval:15000});
  const selectedId=selected??q.data?.items[0]?.employeeId;
  const detail=useQuery({queryKey:['increment','employee',selectedId],queryFn:()=>api.getIncrementProgress(selectedId),enabled:!!selectedId,refetchInterval:15000});
  const row=selectedId?detail.data:undefined;
  return <section aria-label="Increment exam eligibility" className="app-panel overflow-hidden rounded-2xl border border-line">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5"><div><h2 className="flex items-center gap-2 font-semibold"><GraduationCap className="h-5 w-5 text-primary"/>Ready for the next step</h2><p className="mt-1 text-sm text-ink-muted">Increment exams · 90 qualifying days from joining</p></div><span className="rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary">{q.data?.eligible??'…'} eligible · {q.data?.scheduled??'…'} appointed</span></div>
    <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"><div className="min-w-0 lg:border-r lg:border-line"><div className="flex flex-wrap gap-2 border-b border-line p-4"><Input aria-label="Search increment employees" className="min-w-0 flex-1" placeholder="Name, staff ID, platform or department" value={scope.search} onChange={e=>{setSelected(null);setScope(s=>({...s,search:e.target.value,page:1}));}}/><Select className="w-44" aria-label="Increment eligibility filter" value={scope.status} onChange={e=>{setSelected(null);setScope(s=>({...s,status:e.target.value as IncrementScope['status'],page:1}));}} options={[{value:'ELIGIBLE',label:'Eligible employees'},{value:'SCHEDULED',label:'Exam appointments'},{value:'VERIFY',label:'Needs verification'},{value:'ALL',label:'All employees'}]}/></div>
      {q.isPending&&<p className="p-5" role="status">Checking qualifying days…</p>}
      {q.isError&&<p className="p-4 text-sm text-danger-600" role="alert">{q.data?'Showing the last successful update. ':''}{errorMessage(q.error)} <button className="underline" onClick={()=>q.refetch()}>Retry</button></p>}
      {q.data&&!q.data.items.length&&<div className="space-y-3 p-6"><p className="text-sm text-ink-muted">No employees match this view. Missing historical attendance is not automatically credited.</p><Button variant="secondary" size="sm" onClick={()=>{setSelected(null);setScope({status:'VERIFY',page:1,pageSize:8});}}>Review unverified history</Button></div>}
      <div className="max-h-[520px] overflow-y-auto">{q.data?.items.map(e=><button key={e.employeeId} aria-pressed={selectedId===e.employeeId} onClick={()=>setSelected(e.employeeId)} className={`flex w-full items-center justify-between gap-3 border-b border-line p-4 text-left hover:bg-mist ${selectedId===e.employeeId?'bg-primary-50/50':''}`}><span className="min-w-0"><strong className="block text-sm">{e.name}</strong><span className="mt-1 block text-xs text-ink-muted">{e.staffNumber} · {e.department} · {e.platformCode??'Unassigned'}</span><span className="mt-1 block text-xs">{e.appointment?.status==='SCHEDULED'?`Exam: ${businessDateTime(e.appointment.startsAt)}`:e.progress.eligible?`Eligible since ${e.progress.eligibleSince}`:'Attendance verification needed'}</span></span><span className="shrink-0 rounded-lg bg-mist px-2.5 py-2 text-xs font-semibold tabular-nums">{e.progress.creditedDays} / 90</span></button>)}</div>
      {q.data&&<Pagination page={scope.page??1} pageSize={8} total={q.data.total} onPage={page=>{setSelected(null);setScope(s=>({...s,page}));}}/>}
    </div><aside className="min-w-0 space-y-4 border-t border-line p-5 lg:border-t-0">
      {detail.isFetching&&!row&&selectedId&&<p role="status">Loading employee details…</p>}
      {detail.isError&&<p role="alert" className="text-sm text-danger-600">{errorMessage(detail.error)}</p>}
      {row?<><div><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Employee details</p><h3 className="mt-1 text-lg font-semibold">{row.name}</h3><Link className="mt-1 block text-xs text-primary underline" to={`/employees/${row.employeeId}`}>{row.staffNumber} · {row.department} · {row.platformCode??'Unassigned'}</Link></div><ProgressSummary progress={row.progress}/><AppointmentSummary employee={row}/><div className="flex flex-wrap gap-2"><Button size="sm" disabled={!row.progress.eligible||detail.isError} onClick={()=>setEditing({kind:'SCHEDULE',employee:row})}>{row.appointment?.status==='SCHEDULED'?'Reschedule exam':'Appoint physical exam'}</Button>{row.appointment?.status==='SCHEDULED'&&<Button size="sm" variant="secondary" onClick={()=>setEditing({kind:'CANCEL',employee:row})}>Cancel appointment</Button>}{canVerify&&<Button size="sm" variant="ghost" icon={<ShieldCheck className="h-4 w-4"/>} onClick={()=>setEditing({kind:'BALANCE',employee:row})}>Verify historical days</Button>}</div></>:!selectedId&&<p className="text-sm text-ink-muted">Choose an employee to review progress and appoint an exam.</p>}
    </aside></div>
    {editing&&<IncrementForm key={`${editing.kind}:${editing.employee.employeeId}`} kind={editing.kind} employee={editing.employee} onClose={()=>setEditing(null)}/>}
  </section>;
}

function IncrementForm({kind,employee,onClose}:{kind:'SCHEDULE'|'BALANCE'|'CANCEL';employee:IncrementEmployee;onClose:()=>void}) {
  const appointment=employee.appointment,baseline=employee.progress.baseline;
  const [dateTime,setDateTime]=useState(appointment?businessDateTime(appointment.startsAt).replace(' ','T').slice(0,16):'');
  const [location,setLocation]=useState(appointment?.location??''),[instructions,setInstructions]=useState(appointment?.instructions??'');
  const [through,setThrough]=useState(baseline?.throughDate??addCalendarDays(businessDate(employee.progress.asOf),-1));
  const [days,setDays]=useState(String(baseline?.creditedDays??'')),[reason,setReason]=useState('');
  const cache=useQueryClient(),retry=useRef<{signature:string;key:string}|null>(null);
  const mutation=useMutation({mutationFn:()=>{
    const signature=JSON.stringify({kind,dateTime,location,instructions,through,days,reason});
    if(retry.current?.signature!==signature)retry.current={signature,key:crypto.randomUUID()};
    if(kind==='BALANCE')return api.setIncrementOpeningBalance(employee.employeeId,{throughDate:through,creditedDays:Number(days),reason,expectedRevision:baseline?.revision??0});
    if(kind==='CANCEL')return api.cancelIncrementExam(employee.employeeId,{expectedRevision:appointment?.revision??0,reason,idempotencyKey:retry.current.key});
    return api.scheduleIncrementExam(employee.employeeId,{startsAt:new Date(`${dateTime}:00+05:30`).toISOString(),location,instructions,expectedRevision:appointment?.revision??0,expectedEligibilityVersion:employee.progress.eligibilityVersion,idempotencyKey:retry.current.key});
  },onSuccess:async()=>{await Promise.all(['increment','notifications'].map(key=>cache.invalidateQueries({queryKey:[key]})));onClose();}});
  const valid=kind==='SCHEDULE'?!!dateTime&&!!location.trim():kind==='BALANCE'?!!through&&days!==''&&Number.isFinite(Number(days))&&Number(days)>=0&&Number(days)*2%1===0&&reason.trim().length>=5:reason.trim().length>=5;
  return <Dialog open backdropBlur size="lg" title={kind==='BALANCE'?'Verify historical qualifying days':kind==='CANCEL'?'Cancel increment exam':'Appoint physical increment exam'} description={`${employee.name} · ${employee.staffNumber}`} onClose={()=>{if(!mutation.isPending)onClose();}} footer={<><Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>Close</Button><Button loading={mutation.isPending} disabled={!valid} onClick={()=>mutation.mutate()}>{kind==='BALANCE'?'Save verified balance':kind==='CANCEL'?'Confirm cancellation':'Save exam appointment'}</Button></>}>
    <div className="space-y-4"><p className="rounded-xl bg-mist p-3 text-sm">Joined {employee.progress.joinedAt} · {employee.progress.creditedDays} / 90 qualifying days</p>
      {kind==='SCHEDULE'&&<><Field label="Physical exam date and time" htmlFor="increment-exam-time" hint="Asia/Colombo. The employee receives the appointed time, location and instructions."><Input id="increment-exam-time" type="datetime-local" value={dateTime} onChange={e=>setDateTime(e.target.value)}/></Field><Field label="Exam location" htmlFor="increment-location"><Input id="increment-location" maxLength={200} value={location} onChange={e=>setLocation(e.target.value)} placeholder="Office, room or physical venue"/></Field><Field label="Exam details and instructions" htmlFor="increment-instructions"><Textarea id="increment-instructions" maxLength={2000} value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="What to bring, reporting instructions and contact person"/></Field><p className="text-xs text-ink-muted">Saving sends a private in-app notification. Changing an existing appointment preserves its history and sends updated details.</p></>}
      {kind==='BALANCE'&&<><p className="text-sm text-ink-muted">Verify attendance records from the joining date through the selected completed roster date. This replaces credit for that period; later evidence is counted separately. Include approved off-days, exclude absences/full leave, and count qualifying half-days as 0.5. Training advancement alone is not attendance evidence.</p><Field label="Verified through roster date" htmlFor="increment-through"><Input id="increment-through" type="date" value={through} min={employee.progress.joinedAt??undefined} max={addCalendarDays(businessDate(employee.progress.asOf),-1)} onChange={e=>setThrough(e.target.value)}/></Field><Field label="Verified qualifying days" htmlFor="increment-days"><Input id="increment-days" type="number" min={0} step={.5} value={days} onChange={e=>setDays(e.target.value)}/></Field></>}
      {kind!=='SCHEDULE'&&<Field label={kind==='BALANCE'?'Verification evidence and reason':'Cancellation reason'} htmlFor="increment-reason" hint="At least five characters. Your name and the before/after values are retained in the audit history."><Textarea id="increment-reason" maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></Field>}
      {mutation.isError&&<p role="alert" className="text-sm text-danger-600">{errorMessage(mutation.error)} Your form is preserved. If eligibility or the appointment changed, close this form and review the refreshed employee details.</p>}
    </div>
  </Dialog>;
}
