import { Card } from '../../components/ui/Card';
import { RadialProgress } from '../../components/ui/RadialProgress';
import type { OpsDashboard } from '../../services/api';
import type { ShiftCode } from '../../types/domain';

export function ShiftAnalytics({analytics,current}:{analytics:NonNullable<OpsDashboard['analytics']>;current:ShiftCode}) {
  const shifts:ShiftCode[]=current==='MORNING'?['MORNING','NIGHT']:['NIGHT','MORNING'];
  const metrics=[
    {label:'Scheduled workforce',key:'scheduled' as const,max:'target' as const,caption:'staffing target'},
    {label:'Confirmed attendance',key:'confirmed' as const,max:'scheduled' as const,caption:'scheduled staff'},
    {label:'Laptops in use',key:'devicesHeld' as const,max:'capacity' as const,caption:'configured seats'},
    {label:'Staffing vacancies',key:'vacancies' as const,max:'target' as const,caption:'staffing target'},
  ];
  return <section aria-label="Shift comparison" className="space-y-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-base font-semibold">{current==='MORNING'?'Morning':'Night'} shift overview</h2><p className="text-xs text-ink-muted">Roster date {analytics.date} · Morning 07:30–19:30 / Night 19:30–07:30</p></div>
    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">{metrics.map(metric=><Card key={metric.key} className="min-w-0 p-4"><h3 className="text-sm font-semibold">{metric.label}</h3><div className="mt-4 grid grid-cols-2 gap-2">{shifts.map(shift=>{
      const values=analytics.shifts[shift],value=values[metric.key],max=values[metric.max];
      return <div key={shift} className="flex min-w-0 flex-col items-center"><p className={`mb-2 text-xs ${shift===current?'font-semibold text-primary':'text-ink-muted'}`}>{shift==='MORNING'?'Morning':'Night'}{shift===current?' · Current':''}</p><RadialProgress value={value??0} max={max} display={value===null?'—':String(value)} label={`${shift} ${metric.label}`} tone={shift==='MORNING'?'orange':'violet'} className="h-20 w-20" valueText={value===null?'Attendance records unavailable':`${value} of ${max} ${metric.caption}`}/><p className="mt-2 text-center text-[10px] text-ink-muted">{value===null?'Records unavailable':`of ${max} ${metric.caption}`}</p></div>;
    })}</div>{metric.key==='confirmed'&&<p className="mt-3 text-xs text-ink-muted">Needs review: Morning {analytics.shifts.MORNING.needsReview??'—'} · Night {analytics.shifts.NIGHT.needsReview??'—'}</p>}</Card>)}</div>
  </section>;
}
