import React,{useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {ArmchairIcon,StarIcon} from 'lucide-react';
import {toast} from 'sonner';
import {api,errorMessage} from '../../services/api';
import {Card} from '../ui/Card';
import {Button} from '../ui/Button';
import {Dialog} from '../ui/Dialog';
import {Field,Textarea} from '../ui/Field';
import {EmptyState,QueryView} from '../ui/States';
import {businessDateTime} from '../../utils/shiftTime';
import type {SeatVacancy,SeatRequestStatus} from '../../types/seatRequests';

const labels:Record<SeatRequestStatus,string>={PENDING:'Requested · awaiting supervisor',WITHDRAWN:'Withdrawn',REJECTED:'Declined',ALLOCATED:'Allocated to you',NOT_SELECTED:'Allocated to another freelancer',CLOSED:'Vacancy closed or changed'};
export function UpcomingSeats({month}:{month:string}){
 const qc=useQueryClient(),[selected,setSelected]=useState<SeatVacancy|null>(null),[note,setNote]=useState('');
 const q=useQuery({queryKey:['my-seat-vacancies',month],queryFn:()=>api.getMySeatVacancies(month),refetchInterval:15000});
 const refresh=()=>{qc.invalidateQueries({queryKey:['my-seat-vacancies']});qc.invalidateQueries({queryKey:['seat-requests']});};
 const apply=useMutation({mutationFn:()=>api.requestVacancySeat(selected!.id,{note}),onSuccess:()=>{setSelected(null);setNote('');refresh();toast.success('Seat request sent to supervisors');},onError:e=>{refresh();toast.error(errorMessage(e));}});
 const withdraw=useMutation({mutationFn:(r:{id:string;version:number})=>api.withdrawSeatRequest(r.id,r.version),onSuccess:()=>{refresh();toast.success('Request withdrawn');},onError:e=>toast.error(errorMessage(e))});
 return <><Card className="p-4 md:p-5"><h2 className="flex items-center gap-2 text-base font-semibold"><ArmchairIcon className="h-5 w-5 text-primary"/>Upcoming seats / vacancies</h2><p className="mt-2 text-xs text-ink-muted">Open replacement seats for {month}, up to 60 days ahead. Requests highlight your interest; the supervisor decides allocation. Mark the shift Available before requesting.</p><QueryView query={q} retainOnError>{d=><>
  <div className="my-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-mist p-3"><p className="text-xl font-semibold">{d.vacancies.length}</p><p className="text-xs text-ink-muted">Open seats</p></div><div className="rounded-xl bg-primary/5 p-3"><p className="text-xl font-semibold">{d.requests.filter(r=>r.status==='PENDING').length}</p><p className="text-xs text-ink-muted">Your pending requests</p></div></div>
  {!d.vacancies.length?<EmptyState title="No open seats this month" description="Replacement needs will appear here once a supervisor opens a vacancy."/>:<ul className="max-h-[36rem] space-y-3 overflow-y-auto">{d.vacancies.map(v=><li key={v.id} className="rounded-xl border border-line p-3"><div className="flex justify-between gap-2 text-sm"><strong>{v.platformCode} · {v.dept}</strong><span>{v.shift==='MORNING'?'Morning':'Night'}</span></div><p className="mt-1 text-xs text-ink-muted">{v.date}</p><p className="mt-1 text-xs text-ink-muted">{businessDateTime(v.shiftStart)} – {businessDateTime(v.shiftEnd)} · Asia/Colombo</p>{v.request&&<p className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary"><StarIcon className="h-3 w-3"/>{labels[v.request.status]}</p>}{!v.eligible&&<p className="mt-2 text-xs text-ink-muted">{v.reasons.join(' · ')||'Not eligible for allocation'}</p>}<div className="mt-3">{v.request?.status==='PENDING'?<Button variant="secondary" size="sm" loading={withdraw.isPending&&withdraw.variables?.id===v.request.id} onClick={()=>withdraw.mutate(v.request!)}>Withdraw request</Button>:<Button size="sm" disabled={!v.eligible||!!v.request&&v.request.status!=='WITHDRAWN'} onClick={()=>{setSelected(v);setNote('');}}>Request this seat</Button>}</div></li>)}</ul>}
  {d.requests.some(r=>r.status!=='PENDING')&&<details className="mt-4 border-t border-line pt-3"><summary className="cursor-pointer text-sm font-semibold">Your request history</summary><ul className="mt-3 space-y-3">{d.requests.filter(r=>r.status!=='PENDING').map(r=><li key={r.id} className="text-xs"><strong>{r.platformCode} · {r.date} · {r.shift==='MORNING'?'Morning':'Night'}</strong><p className="mt-1 text-ink-muted">{labels[r.status]}</p></li>)}</ul></details>}
  <p className="mt-4 text-xs text-ink-muted">Updated {businessDateTime(d.serverNow)} · refreshes every 15 seconds.</p>
 </>}</QueryView></Card><Dialog open={!!selected} onClose={()=>{if(!apply.isPending)setSelected(null);}} title="Request this seat" description={`${selected?.platformCode??''} · ${selected?.date??''} · ${selected?.shift==='NIGHT'?'Night':'Morning'}. Pending supervisor allocation.`} footer={<><Button variant="ghost" disabled={apply.isPending} onClick={()=>setSelected(null)}>Cancel</Button><Button loading={apply.isPending} onClick={()=>apply.mutate()}>Send request</Button></>}><Field label="Message to supervisor (optional)" htmlFor="seat-note"><Textarea id="seat-note" maxLength={500} value={note} onChange={e=>setNote(e.target.value)} placeholder="Add relevant availability or experience details"/></Field></Dialog></>;
}
