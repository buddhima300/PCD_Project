import { ReportDownload } from '../reports/ReportDownload';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import type { DeptCode,ShiftCode } from '../../types/domain';
import type { ShiftVacancy } from '../../types/workforceFlow';
import { Card } from '../ui/Card';
import { QueryView } from '../ui/States';
import { SearchInput } from '../ui/SearchInput';
import { Select } from '../ui/Field';
import { deptNames } from '../../utils/format';
import { RadialProgress } from '../ui/RadialProgress';

export interface VacancySelection {platformCode:string;dept:DeptCode;shift:ShiftCode;}
function VacancyRing({value,label,night}:{value:ShiftVacancy;label:string;night:boolean}) {
  return <div className="flex items-center gap-3"><RadialProgress value={value.used} max={value.capacity} label={label} tone={night?'violet':'orange'} className="h-20 w-20" valueText={`${value.used} of ${value.capacity} seats occupied; ${value.available} available`}/><div><p className="text-sm font-semibold">{night?'Night':'Morning'}</p><p className="text-xs text-ink-muted">{value.available} seats free</p><p className="text-[11px] text-ink-subtle">{value.production} production · {value.training} training</p></div></div>;
}
export function WorkforceVacancies({onSelect,mode='production'}:{onSelect:(selection:VacancySelection)=>void;mode?:'training'|'production'}) {
  const [search,setSearch]=useState('');const [dept,setDept]=useState<DeptCode|''>('');
  const q=useQuery({queryKey:['workforce-vacancies'],queryFn:()=>api.getWorkforceVacancies(),refetchInterval:30000});
  return <section className="space-y-4" aria-label={mode==='training'?'Training vacancies':'Production platform vacancies'}>
    <div className="flex justify-end"><ReportDownload report="platform-vacancies" filters={{dept,search}}/></div><div className="flex flex-wrap items-center gap-3"><SearchInput value={search} onChange={setSearch} placeholder="Search platform or category"/><Select aria-label="Vacancy department" value={dept} onChange={e=>setDept(e.target.value as DeptCode|'')} placeholder="All departments" options={Object.entries(deptNames).map(([value,label])=>({value,label}))}/></div>
    <p className="text-xs text-ink-muted">Seats are shared by trainees and production staff within each shift. {mode==='production'?'A qualified trainee can keep their current seat even when the shift is full.':'Choose available seats to assign a candidate to training.'}</p>
    <QueryView query={q} isEmpty={rows=>!rows.length}>{rows=>{
      const visible=rows.filter(p=>(!dept||p.departments.some(d=>d.dept===dept))&&`${p.code} ${p.name} ${p.categoryCode}`.toLowerCase().includes(search.toLowerCase()));
      const categories=[...new Set(visible.map(p=>p.categoryCode))].sort();
      return <>{!visible.length&&<p className="rounded-xl border border-line p-5 text-sm text-ink-muted">No platforms match these filters.</p>}{categories.map(category=><section key={category} className="space-y-3"><h2 className="text-base font-semibold">{category} platforms</h2><div className="grid items-start gap-4 xl:grid-cols-2">{visible.filter(p=>p.categoryCode===category).map(p=>{
        const departments=p.departments.filter(d=>!dept||d.dept===dept);
        const total=(shift:ShiftCode):ShiftVacancy=>departments.reduce((sum,d)=>({capacity:sum.capacity+d.shifts[shift].capacity,production:sum.production+d.shifts[shift].production,training:sum.training+d.shifts[shift].training,used:sum.used+d.shifts[shift].used,available:sum.available+d.shifts[shift].available}),{capacity:0,production:0,training:0,used:0,available:0});
        return <Card key={p.code} className="p-4"><h3 className="font-semibold">{p.code} <span className="font-normal text-ink-muted">{p.name!==p.code?`· ${p.name}`:''}</span></h3><div className="my-4 grid gap-3 sm:grid-cols-2"><VacancyRing value={total('MORNING')} label={`${p.code} morning occupancy`} night={false}/><VacancyRing value={total('NIGHT')} label={`${p.code} night occupancy`} night/></div><div className="space-y-3 border-t border-line pt-3">{departments.map(d=><div key={d.dept}><p className="mb-2 text-xs font-semibold">{d.dept} · {deptNames[d.dept]}</p><div className="grid grid-cols-2 gap-2">{(['MORNING','NIGHT'] as const).map(shift=><button key={shift} disabled={mode==='training'&&!d.shifts[shift].available} onClick={()=>onSelect({platformCode:p.code,dept:d.dept,shift})} className="rounded-lg border border-line px-3 py-2 text-left text-xs hover:border-primary hover:bg-primary-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"><span className="font-semibold">{shift==='MORNING'?'Morning':'Night'} · {d.shifts[shift].available} free</span><span className="mt-1 block text-ink-muted">{mode==='training'?'Assign candidate to training':'Assign qualified staff'}</span></button>)}</div></div>)}</div></Card>;
      })}</div></section>)}</>;
    }}</QueryView>
  </section>;
}
