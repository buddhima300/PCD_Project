import { Link, useLocation } from 'react-router-dom';
import { areaLinks, contextualDestination, matchesDestination, type SupervisorArea } from '../../data/supervisorNavigation';
import { useBreakSnapshot } from '../../features/break-management/hooks';
import { cn } from '../../utils/cn';

export function SupervisorAreaNavigation({area}:{area:SupervisorArea}) {
  const {pathname,search}=useLocation();
  const snapshot=useBreakSnapshot();
  const links=areaLinks(area,snapshot.data);
  const active=[...links].sort((a,b)=>b.to.length-a.to.length).find(link=>matchesDestination(pathname,link.to));
  const groups=links.reduce<Record<string,typeof links>>((result,link)=>{
    const group=area.id!=='workforce'?'': ['/register','/candidates'].includes(link.to)?'1. Registration': ['/training','/workforce/assignments'].includes(link.to)?'2. Training & assignment': ['/employees','/freelancers'].includes(link.to)?'3. Directories': ['/roster','/shifts','/rotation'].includes(link.to)?'4. Scheduling':'5. Daily management';
    (result[group]??=[]).push(link);return result;
  },{});
  const linkClass=(selected:boolean)=>cn('rounded-lg px-3 py-2 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',selected?'bg-primary-50 text-primary-700':'text-ink-muted hover:bg-mist hover:text-ink');
  return <nav aria-label={`${area.label} navigation`} className="mb-5 space-y-3 border-b border-line pb-3">
    <Link to={area.to} aria-current={pathname===area.to?'page':undefined} className={cn('inline-block',linkClass(pathname===area.to))}>Overview</Link>
    <div className="flex flex-wrap gap-x-5 gap-y-3">{Object.entries(groups).sort(([a],[b])=>a.localeCompare(b)).map(([group,items])=><div key={group} role={group?'group':undefined} aria-label={group||undefined}>
      {group&&<p className="mb-1 px-3 text-[11px] font-semibold text-ink-subtle">{group}</p>}
      <div className="flex flex-wrap gap-1">{items.map(link=><Link key={link.to} to={contextualDestination(link.to,pathname,search)} aria-current={active?.to===link.to?'page':undefined} className={linkClass(active?.to===link.to)}>{link.label}</Link>)}</div>
    </div>)}</div>
  </nav>;
}
