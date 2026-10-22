import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { RadialProgress } from '../../components/ui/RadialProgress';
import { LoadingBlock, ErrorState } from '../../components/ui/States';
import { useBreakSnapshot, useBreakMonitor } from '../../features/break-management/hooks';
import { defaultFilters } from '../../features/break-management/contracts';
import { breakConfig } from '../../features/break-management/config';

const activeFilters={...defaultFilters,status:'ACTIVE',pageSize:5};
export function SupervisorBreakAnalytics({scheduled}:{scheduled:number|undefined}) {
  const snapshot=useBreakSnapshot();
  const allowed=!!snapshot.data?.capabilities.monitor;
  const monitor=useBreakMonitor(defaultFilters,allowed);
  const active=useBreakMonitor(activeFilters,allowed);
  const data=monitor.data;
  return <Card className="min-w-0 p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">Break management</h2>{allowed&&<Link to="/breaks" className="text-xs font-semibold text-primary">View breaks ↗</Link>}</div>
    {breakConfig.adapter==='mock'&&<p className="mt-2 text-xs text-ink-muted">Development simulation</p>}
    {!snapshot.enabled?<p className="mt-4 text-sm text-ink-muted">Break management is disabled.</p>:snapshot.isError?<ErrorState error={snapshot.error} onRetry={()=>snapshot.refetch()}/>:snapshot.isPending?<LoadingBlock rows={3}/>:!allowed?<p className="mt-4 text-sm text-ink-muted">Break monitoring is unavailable for your account.</p>:monitor.isError?<ErrorState error={monitor.error} onRetry={()=>monitor.refetch()}/>:!data?<LoadingBlock rows={3}/>:<>
      <div className="my-4 grid grid-cols-3 gap-2">{[
        {label:'On break',value:data.activeCount,max:scheduled??0,tone:'lime' as const,description:'scheduled across both shifts'},
        {label:'Pending requests',value:data.pendingCount,max:data.requestTotal,tone:'orange' as const,description:'total requests'},
        {label:'Overruns to review',value:data.overrunCount,max:data.total,tone:'violet' as const,description:'recorded sessions'},
      ].map(metric=><div key={metric.label} className="flex min-w-0 flex-col items-center text-center"><RadialProgress value={metric.value} max={metric.max} display={String(metric.value)} label={metric.label} tone={metric.tone} className="h-20 w-20 sm:h-24 sm:w-24" valueText={`${metric.value} ${metric.label.toLowerCase()}${metric.max ? ` of ${metric.max} ${metric.description}`:''}`}/><p className="mt-1 text-xs font-medium">{metric.label}</p><p className="mt-1 text-[10px] text-ink-muted">{metric.max} {metric.description}</p></div>)}</div>
      <div className="border-t border-line pt-3"><h3 className="text-xs font-semibold">Currently taking a break</h3>{active.isError?<p className="mt-2 text-xs text-ink-muted">Active staff list unavailable. <button className="underline" onClick={()=>active.refetch()}>Retry</button></p>:active.isPending?<p className="mt-2 text-xs text-ink-muted">Loading active staff…</p>:<><ul className="mt-2 space-y-2">{active.data?.sessions.map(s=><li key={s.id} className="flex flex-wrap justify-between gap-x-3 text-xs"><span className="font-medium">{s.workerName}</span><span className="text-ink-muted">{s.platform} / {s.department} · {Math.floor(s.elapsedSeconds/60)} min</span></li>)}</ul>{!active.data?.total&&<p className="mt-2 text-xs text-ink-muted">No one is currently on break.</p>}{(active.data?.total??0)>5&&<Link to="/breaks" className="mt-2 inline-block text-xs text-primary">View all {active.data?.total} active breaks →</Link>}</>}
      <p className="mt-3 text-[10px] text-ink-subtle">Across all platforms · Updated {new Date(data.serverNow).toLocaleTimeString('en-GB',{timeZone:'Asia/Colombo',hour:'2-digit',minute:'2-digit'})}</p></div>
    </>}
  </Card>;
}
