import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightIcon, ArrowUpRightIcon } from 'lucide-react';
import { api } from '../../services/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card,CardHeader } from '../../components/ui/Card';
import { QueryView } from '../../components/ui/States';
import { useEffect, useState } from 'react';
import { useSessionStore } from '../../hooks/useSessionStore';
import { businessDate, businessTime, liveShift } from '../../utils/shiftTime';
import { DashboardClockWeather } from './DashboardClockWeather';
import { SupervisorBreakAnalytics } from './SupervisorBreakAnalytics';
import { ShiftAnalytics } from './ShiftAnalytics';
import { WorkforceDashboardPanels } from './WorkforceDashboardPanels';
import { PlatformTable } from '../../components/platform/PlatformTable';
import { supervisorAreas } from '../../data/supervisorNavigation';
import { RadialProgress } from '../../components/ui/RadialProgress';
import { IncrementEligibilityPanel } from '../../components/increment/IncrementExams';

export function SupervisorOverview(){
  const user=useSessionStore(s=>s.user);
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),1000);return ()=>clearInterval(timer);},[]);
  const current=liveShift(now);
  const hour=Number(businessTime(now).slice(0,2));
  const greeting=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
  const q=useQuery({queryKey:['dashboard',{},current.date,current.shift,businessDate(now)],queryFn:()=>api.getDashboard({}),refetchInterval:30000});
  const scheduled=q.data?.analytics ? q.data.analytics.shifts.MORNING.scheduled+q.data.analytics.shifts.NIGHT.scheduled : undefined;
  return <div className="space-y-5"><PageHeader title={`${greeting}, ${user?.name??"Supervisor"}`} description={`Supervisor dashboard · ${current.shift==="MORNING"?"Morning":"Night"} shift is in progress · ${businessTime(now)} (Asia/Colombo)`}/>
    <div className="grid items-stretch gap-5 xl:grid-cols-2"><SupervisorBreakAnalytics scheduled={scheduled}/><DashboardClockWeather now={now}/></div>
    <Card className="dashboard-hero">
      <div><span className="dashboard-eyebrow">Operations workspace</span><h2>Your people. Your platforms.<br/>One clear view.</h2><p className="mt-3 text-sm text-ink-muted">Bring workforce, scheduling and equipment together. Keep every shift moving with confidence.</p><div className="dashboard-hero-actions"><Link to="/operations" className="dashboard-primary-link">Open operations <ArrowRightIcon className="h-4 w-4" aria-hidden/></Link><Link to="/register" className="text-xs font-semibold text-primary hover:underline">Register staff <span aria-hidden>↗</span></Link></div></div>
      <QueryView query={q}>{d=><div className="dashboard-hero-metric"><RadialProgress value={d.kpis.activePlatforms} max={d.kpis.totalPlatforms} label="Active platforms" caption="active" tone="lime"/><div><p className="text-sm font-semibold">Platform activity</p><p className="mt-2 text-xs text-ink-muted">{d.kpis.activePlatforms} active of {d.kpis.totalPlatforms} platforms</p><Link to="/platforms" className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-primary">View platforms <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden/></Link></div></div>}</QueryView>
    </Card>
    <QueryView query={q}>{d=>d.analytics?<ShiftAnalytics analytics={d.analytics} current={current.shift}/>:<Card className="p-5"><p role="status" className="text-sm text-ink-muted">Shift analytics unavailable. <button className="text-primary underline" onClick={()=>q.refetch()}>Retry</button></p></Card>}</QueryView>
    <IncrementEligibilityPanel/>
    <QueryView query={q}>{d=>d.analytics?.workforce?<WorkforceDashboardPanels data={d.analytics.workforce} current={current.shift} rosterDate={d.analytics.date}/>:null}</QueryView>
    <section aria-label="Workspace areas" className="dashboard-areas">{supervisorAreas.filter(a=>a.id!=='dashboard').map(area=><Link key={area.id} to={area.to} className="app-panel dashboard-area-link"><span className="area-icon"><area.icon className="h-5 w-5" aria-hidden/></span><ArrowUpRightIcon className="area-arrow h-4 w-4" aria-hidden/><h2>{area.label}</h2><p>{area.description}</p></Link>)}</section>
    <Card><CardHeader title="Workforce workflow" description="A clear path from registration to production."/><ol className="workflow-steps">{[{to:'/register',label:'Register staff',text:'Create an employee or freelancer record and login.'},{to:'/training',label:'Train and evaluate',text:'Start training, record completed days and evaluate readiness.'},{to:'/workforce/assignments',label:'Assign platform',text:'Choose a production platform and shift after qualification.'}].map((step,i)=><li key={step.to}><span className="workflow-step-number" aria-hidden>0{i+1}</span><Link to={step.to}>{step.label}</Link><p>{step.text}</p></li>)}</ol></Card>
    <QueryView query={q}>{d=><Card><CardHeader title="Platform coverage" description="Current staffing and shared device capacity." action={<Link to="/operations" className="text-xs font-semibold text-primary">View live operations</Link>}/><PlatformTable rows={d.platforms} showStatus={false}/></Card>}</QueryView>
  </div>;
}
