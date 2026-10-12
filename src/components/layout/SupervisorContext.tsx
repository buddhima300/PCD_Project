import { Link, useLocation } from 'react-router-dom';
import { areaLinks, contextualDestination, matchesDestination, supervisorAreaFor } from '../../data/supervisorNavigation';
import { useBreakSnapshot } from '../../features/break-management/hooks';
import { useSessionStore } from '../../hooks/useSessionStore';
import { cn } from '../../utils/cn';

export function SupervisorContext() {
  const role = useSessionStore(s => s.user?.role);
  const location = useLocation();
  const breaks = useBreakSnapshot();
  const area = supervisorAreaFor(location.pathname);
  if (role !== 'SUPERVISOR' || !area || area.id === 'dashboard') return null;
  const links = areaLinks(area, breaks.data);
  const current = [...links].sort((a, b) => b.to.length - a.to.length).find(link => matchesDestination(location.pathname, link.to));
  return (
    <div className="mb-5 min-w-0">
      <nav aria-label="Feature location" className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <Link to="/" className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary hover:text-primary">Dashboard</Link>
        <span aria-hidden>/</span>
        <Link to={area.to} aria-current={location.pathname === area.to ? 'page' : undefined} className="rounded font-semibold hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{area.label}</Link>
        {current && <><span aria-hidden>/</span><Link to={contextualDestination(current.to, location.pathname, location.search)} className="hover:text-primary">{current.label}</Link></>}
      </nav>
      {location.pathname !== area.to && <nav aria-label={`${area.label} navigation`} className="workspace-tabs flex flex-wrap gap-1 border-b border-line">
        {[{ ...area, label: 'Overview' }, ...links].map(link => (
          <Link key={link.to} to={contextualDestination(link.to, location.pathname, location.search)} aria-current={current?.to === link.to ? 'page' : undefined}
            className={cn('border-b-2 px-3 py-3 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary', current?.to === link.to ? 'border-primary text-primary' : 'border-transparent text-ink-muted hover:text-ink')}>
            {link.label}
          </Link>
        ))}
      </nav>}
    </div>
  );
}
