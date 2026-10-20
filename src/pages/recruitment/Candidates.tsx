import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card,CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { QueryView,EmptyState } from '../../components/ui/States';
import { SearchInput } from '../../components/ui/SearchInput';
import { WorkspaceSummary } from '../../components/ui/WorkspaceSummary';
import { TrainingIntake } from '../../components/placement/TrainingIntake';
import { WorkforceVacancies,type VacancySelection } from '../../components/placement/WorkforceVacancies';
import type { RecruitCandidate } from '../../types/domain';

export function Candidates(){
  const [search,setSearch]=useState('');
  const [intake,setIntake]=useState<{candidate?:RecruitCandidate;placement?:VacancySelection}|null>(null);
  const q=useQuery({queryKey:['candidates'],queryFn:()=>api.listCandidates({}),refetchInterval:30000});
  const vacancies=useQuery({queryKey:['workforce-vacancies'],queryFn:()=>api.getWorkforceVacancies()});
  const candidates=q.data??[];
  return <div className="space-y-5"><PageHeader title="Candidates" description="Registered employees and freelancers waiting for training. Once placed, they move to Training." actions={<Link to="/register"><Button size="sm" variant="secondary">Register staff</Button></Link>}/>
    <WorkspaceSummary label="Candidate pipeline" items={[{label:'Waiting for training',value:q.data?.length},{label:'Permanent candidates',value:q.data?candidates.filter(c=>c.employmentType==='PERMANENT').length:undefined},{label:'Freelancer candidates',value:q.data?candidates.filter(c=>c.employmentType==='FREELANCER').length:undefined},{label:'Available training seats',value:vacancies.data?.reduce((n,p)=>n+p.departments.reduce((sum,d)=>sum+d.shifts.MORNING.available+d.shifts.NIGHT.available,0),0)}]}/>
    <Card><CardHeader title="Registered candidates" description="The only placement action here is assignment to training."/><div className="p-4"><SearchInput value={search} onChange={setSearch} placeholder="Search candidate reference, name or email"/></div><QueryView query={q}>{items=>{const visible=items.filter(c=>`${c.candidateReference??c.id} ${c.name} ${c.email}`.toLowerCase().includes(search.toLowerCase()));return !visible.length?<EmptyState title="No candidates waiting for training" description="Register new staff or review the current training list."/>:<div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-y border-line bg-mist"><tr>{['Candidate','Contact','Department','Position','Employment','Action'].map(label=><th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{visible.map(c=><tr key={c.id}><td className="px-4 py-3"><p className="font-semibold">{c.name}</p><p className="mt-1 font-mono text-ink-muted">{c.candidateReference??c.id}</p></td><td className="px-4 py-3">{c.email}<p className="mt-1 text-ink-muted">{c.phone}</p></td><td className="px-4 py-3">{c.dept}</td><td className="px-4 py-3">{c.position}</td><td className="px-4 py-3">{c.employmentType==='PERMANENT'?'Permanent employee':'Freelancer'}</td><td className="px-4 py-3"><Button size="sm" onClick={()=>setIntake({candidate:c})}>Assign training</Button></td></tr>)}</tbody></table></div>;}}</QueryView></Card>
    <div><h2 className="mb-1 text-lg font-semibold">Available training seats</h2><p className="mb-4 text-sm text-ink-muted">Browse by category, platform, department and shift, then select a registered candidate.</p><WorkforceVacancies mode="training" onSelect={placement=>setIntake({placement})}/></div>
    {intake&&<TrainingIntake {...intake} onClose={()=>setIntake(null)}/>}
  </div>;
}
