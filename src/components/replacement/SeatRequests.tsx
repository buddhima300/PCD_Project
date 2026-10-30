import React from 'react';
import {Link} from 'react-router-dom';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {StarIcon} from 'lucide-react';
import {toast} from 'sonner';
import {api,errorMessage} from '../../services/api';
import {Card} from '../ui/Card';
import {Button} from '../ui/Button';
import {EmptyState,QueryView} from '../ui/States';
import type {SeatRequest} from '../../types/seatRequests';

export function SeatRequests({replacementId}:{replacementId?:string}){
 const qc=useQueryClient();
 const q=useQuery({queryKey:['seat-requests',replacementId??'all'],queryFn:()=>replacementId?api.listSeatRequests(replacementId):api.listSeatRequests(),refetchInterval:15000});
 const decide=useMutation({mutationFn:({request,decision}:{request:SeatRequest;decision:'ALLOCATE'|'REJECT'})=>api.decideSeatRequest(request.id,{version:request.version,decision}),onSuccess:(_,v)=>{toast.success(v.decision==='ALLOCATE'?'Seat allocated and freelancer notified':'Seat request declined');qc.invalidateQueries();},onError:e=>{toast.error(errorMessage(e));qc.invalidateQueries();}});
 return <Card className="mb-5 p-5"><h2 className="flex items-center gap-2 font-semibold"><StarIcon className="h-4 w-4 text-primary"/>Freelancer seat requests</h2><p className="mt-1 text-xs text-ink-muted">Interested applicants highlighted for this vacancy. Requests do not change the overall freelancer priority ranking. Allocation rechecks current eligibility.</p><QueryView query={q} retainOnError>{rows=>!rows.length?<EmptyState title="No seat requests"/>:<ul className="mt-4 grid max-h-96 gap-3 overflow-y-auto md:grid-cols-2">{rows.map(r=><li key={r.id} className={`rounded-xl border p-3 ${r.status==='PENDING'?'border-primary/30 bg-primary/5':'border-line'}`}><div className="flex justify-between gap-2 text-sm"><strong>{r.name}</strong><span>{r.status==='PENDING'?'Priority interest':r.status.replace(/_/g,' ').toLowerCase()}</span></div><Link to={`/replacements/${r.replacementId}`} className="mt-1 block text-xs text-primary underline">{r.platformCode} / {r.dept} · {r.date} · {r.shift==='MORNING'?'Morning':'Night'}</Link>{r.note&&<p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-muted">{r.note}</p>}{r.status==='PENDING'&&<><p className="mt-2 text-xs text-ink-muted">{r.eligible?'Currently eligible':r.reasons.join(' · ')||'No longer eligible'}</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={!r.eligible||decide.isPending} onClick={()=>decide.mutate({request:r,decision:'ALLOCATE'})}>Allocate seat</Button><Button size="sm" variant="secondary" disabled={decide.isPending} onClick={()=>decide.mutate({request:r,decision:'REJECT'})}>Decline</Button></div></>}</li>)}</ul>}</QueryView></Card>;
}
