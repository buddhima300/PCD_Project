import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, ShieldCheck } from 'lucide-react';
import { api, errorMessage } from '../../services/api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, Input, Select, Textarea, Checkbox } from '../ui/Field';
import { businessDateTime, captureDeviceTime } from '../../utils/shiftTime';
import type { AttendanceRecord, AttendanceSubmission, WorkOccurrence } from '../../types/shiftAttendance';
import { AttendanceDetails } from './AttendanceRegister';

function useAttendanceRefresh() {
  const cache=useQueryClient();
  return ()=>Promise.all(['attendance','employees','freelancers','employee','freelancer','profile','my-work','laptops','laptop','pools','platforms','platform','notifications'].map(key=>cache.invalidateQueries({queryKey:[key]})));
}
export function AttendanceDashboardCard() {
  const q=useQuery({queryKey:['attendance','mine'],queryFn:()=>api.getMyAttendanceContext(),refetchInterval:15000});
  const [selected,setSelected]=useState<WorkOccurrence|null>(null);
  const [detail,setDetail]=useState<string|null>(null);
  const [returnRecord,setReturnRecord]=useState<AttendanceRecord|null>(null);
  if(q.isPending)return <Card className="mb-4 p-5" aria-busy="true">Loading your shift confirmation…</Card>;
  return <Card className="mb-4 overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line bg-primary-50/50 p-5"><div className="flex gap-3"><ShieldCheck className="mt-1 h-6 w-6 text-primary"/><div><h2 className="font-semibold">Your shift, confirmed</h2><p className="mt-1 text-sm text-ink-muted">Confirm attendance and receipt of your department laptop.</p></div></div><span className="text-xs text-ink-muted">Asia/Colombo · Device-time attendance</span></div>
    <div className="space-y-3 p-5">
      {q.isError&&<p role="alert" className="text-sm text-danger-600">{q.data?'Showing the last update. ':''}{errorMessage(q.error)} <button className="underline" onClick={()=>q.refetch()}>Retry</button></p>}
      {q.data?.reason&&<p className="text-sm text-ink-muted">{q.data.reason}</p>}
      {q.data?.occurrences.map(work=><div key={work.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4"><div><p className="font-medium">{work.platformCode} · {work.department} · {work.shift.toLowerCase()}</p><p className="mt-1 text-xs text-ink-muted">Roster {work.rosterDate} · {businessDateTime(work.effectiveStart)} → {businessDateTime(work.effectiveEnd)}</p>{work.confirmation&&<p className="mt-2 text-xs font-medium text-primary">{work.confirmation.status.replace(/_/g,' ')} · Device {businessDateTime(work.confirmation.deviceTimestamp)}</p>}</div>
        <Button size="sm" disabled={!work.confirmation&&!work.canSubmit} onClick={()=>work.confirmation?setDetail(work.confirmation.id):setSelected(work)}>{work.confirmation?'View confirmation':'Confirm handover & attendance'}</Button></div>)}
      {q.data?.openCustody&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-mist p-4"><p className="text-sm"><Laptop className="mr-2 inline h-4 w-4"/>Laptop held: <strong>{q.data.openCustody.assetId}</strong></p><Button variant="secondary" size="sm" onClick={()=>{const held=q.data?.openCustody;if(held)setReturnRecord(held);}}>Return laptop</Button></div>}
    </div>
    {selected&&<AttendanceForm work={selected} onClose={()=>setSelected(null)} onAccepted={r=>{setSelected(null);setDetail(r.id);}}/>}
    {returnRecord&&<ReturnDialog record={returnRecord} onClose={()=>setReturnRecord(null)}/>}
    {detail&&<AttendanceDetails id={detail} onClose={()=>setDetail(null)}/>}
  </Card>;
}
function AttendanceForm({work,onClose,onAccepted}:{work:WorkOccurrence;onClose:()=>void;onAccepted:(r:AttendanceRecord)=>void}) {
  const devices=useQuery({queryKey:['attendance','devices',work.id,work.platformCode,work.department,work.revision],queryFn:()=>api.getMyAttendanceDevices(work.id),refetchInterval:15000});
  const refresh=useAttendanceRefresh();
  const [search,setSearch]=useState(''),[assetId,setAsset]=useState(''),[notes,setNotes]=useState(''),[issue,setIssue]=useState(''),[reason,setReason]=useState('');
  const [exception,setException]=useState(false),[declaration,setDeclaration]=useState(false);
  const [uncertain,setUncertain]=useState(false);
  const [clock,setClock]=useState(()=>new Date());
  useEffect(()=>{const timer=setInterval(()=>setClock(new Date()),1000);return ()=>clearInterval(timer);},[]);
  const retry=useRef<{signature:string;payload:AttendanceSubmission}|null>(null);
  const submit=useMutation({mutationFn:(payload:AttendanceSubmission)=>api.confirmMyShiftAttendance(payload),onSuccess:async r=>{await refresh();onAccepted(r);},onError:()=>{setUncertain(true);void devices.refetch();}});
  const selected=devices.data?.find(d=>d.assetId===assetId);
  useEffect(()=>{if(devices.isSuccess&&assetId&&!devices.data.some(d=>d.assetId===assetId))setAsset('');},[devices.isSuccess,devices.data,assetId]);
  const send=()=>{
    const values={occurrenceId:work.id,expectedRevision:work.revision,department:work.department,assetId:exception?undefined:assetId,attendanceOnly:exception,notes,equipmentIssue:issue,exceptionReason:reason,declaration:true as const};
    const signature=JSON.stringify(values);
    if(retry.current?.signature!==signature)retry.current={signature,payload:{...values,...captureDeviceTime(),idempotencyKey:crypto.randomUUID()}};
    submit.mutate(retry.current.payload);
  };
  return <Dialog open portal backdropBlur title="Confirm handover & attendance" description={`${work.workerName} · ${work.staffNumber}`} size="lg" onClose={()=>{if(!submit.isPending)onClose();}} footer={<><Button variant="secondary" disabled={submit.isPending} onClick={onClose}>Cancel</Button><Button loading={submit.isPending} disabled={!declaration||(!exception&&(!selected||devices.isError))||(exception&&reason.trim().length<5)||!!issue&&!exception} onClick={send}>{uncertain?'Retry same request':'Confirm my shift'}</Button></>}>
    <div className="space-y-4"><div className="grid gap-3 rounded-xl bg-mist p-4 text-sm sm:grid-cols-2"><p><strong>{work.platformCode}</strong> · {work.shift}</p><p>Roster start date: {work.rosterDate}</p><p className="sm:col-span-2">{businessDateTime(work.effectiveStart)} → {businessDateTime(work.effectiveEnd)}</p></div>
      <Field htmlFor="attendance-dept" label="Scheduled department" hint="Your assignment authorizes this department."><Select id="attendance-dept" defaultValue={work.department} options={[{value:work.department,label:work.department}]}/></Field>
      <Checkbox id="attendance-exception" label="I cannot receive a usable laptop — request attendance-only review" checked={exception} onChange={setException}/>
      {!exception&&<><Field label="Search department laptops" hint={`Available devices for ${work.platformCode} / ${work.department} only.`} htmlFor="attendance-search"><Input id="attendance-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Asset ID, serial or model"/></Field><Field label="Available laptop" htmlFor="attendance-asset"><Select id="attendance-asset" value={assetId} onChange={e=>setAsset(e.target.value)} placeholder="Select a laptop" options={(devices.data??[]).filter(d=>`${d.workstationId??""} ${d.assetId} ${d.serial} ${d.model}`.toLowerCase().includes(search.toLowerCase())).map(d=>({value:d.assetId,label:`${d.workstationId ? d.workstationId+" · " : ""}${d.assetId} · ${d.model} · ${d.serial}`}))}/></Field>{devices.isError&&<p role="alert">{errorMessage(devices.error)}</p>}{!devices.isPending&&!devices.data?.length&&<p className="text-sm text-ink-muted">No usable laptops are available for {work.platformCode} / {work.department}. Refresh or use an attendance-only exception.</p>}{selected&&<div className="rounded-xl border border-line p-3 text-xs leading-6">Condition: {selected.condition}<br/>Last receipt: {businessDateTime(selected.lastReceivedAt)}<br/>Last return: {businessDateTime(selected.lastReturnedAt)}</div>}</>}
      {exception&&<Field htmlFor="attendance-reason" label="Why laptop receipt cannot be confirmed" hint="Required. Attendance needs supervisor review; no laptop will be claimed."><Textarea id="attendance-reason" maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></Field>}
      <Field htmlFor="attendance-issue" label="Equipment issue (if any)" hint="For a fault, choose the attendance-only exception above."><Textarea id="attendance-issue" maxLength={2000} value={issue} onChange={e=>setIssue(e.target.value)}/></Field>
      <Field htmlFor="attendance-notes" label="Special notes"><Textarea id="attendance-notes" maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/></Field>
      <Field label="Device timestamp preview (Asia/Colombo)" htmlFor="attendance-clock" hint="The device timestamp is captured when you submit. Server receipt time is assigned when accepted."><Input id="attendance-clock" readOnly value={businessDateTime(clock.toISOString())}/></Field>
      <p className="rounded-xl bg-primary-50 p-3 text-xs leading-5">Device time determines attendance and punctuality. Submission captures your device clock; server receipt time is recorded separately. Exactly 15 minutes after effective start is on time. Submissions after effective end require review.</p>
      <Checkbox id="attendance-declaration" label={exception?'I am present for this shift and the exception details are accurate.':'I am present for this shift and have physically received the selected laptop.'} checked={declaration} onChange={setDeclaration}/>
      {submit.isError&&<div role="alert" className="text-sm text-danger-600">{errorMessage(submit.error)}<p>Your form is preserved. Retry uses the same reference; if the response was lost, the saved result is returned.</p><Button size="sm" variant="secondary" onClick={()=>{void refresh();onClose();}}>Check saved confirmation</Button></div>}
    </div>
  </Dialog>;
}
function ReturnDialog({record,onClose}:{record:AttendanceRecord;onClose:()=>void}) {
  const [notes,setNotes]=useState(''),[checked,setChecked]=useState(false);
  const key=useRef(crypto.randomUUID()),refresh=useAttendanceRefresh();
  const mutation=useMutation({mutationFn:()=>{if(!record.custody)throw new Error('No laptop receipt exists.');return api.returnMyShiftDevice({confirmationId:record.id,expectedRevision:record.custody.revision,notes,physicallyReturned:true,idempotencyKey:key.current});},onSuccess:async()=>{await refresh();onClose();}});
  return <Dialog open portal backdropBlur title="Confirm physical laptop return" onClose={()=>{if(!mutation.isPending)onClose();}} footer={<Button loading={mutation.isPending} disabled={!checked} onClick={()=>mutation.mutate()}>Confirm return</Button>}><div className="space-y-4"><p className="text-sm">Return <strong>{record.assetId}</strong> to its department pool. This records the return separately from your attendance.</p><Field label="Return notes" htmlFor="return-notes"><Textarea id="return-notes" value={notes} maxLength={2000} onChange={e=>{setNotes(e.target.value);key.current=crypto.randomUUID();}}/></Field><Checkbox id="return-physical" label="I have physically returned this laptop." checked={checked} onChange={setChecked}/>{mutation.isError&&<p role="alert">{errorMessage(mutation.error)}</p>}</div></Dialog>;
}





