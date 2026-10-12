import { Link, useLocation } from 'react-router-dom';
import { MenuIcon } from 'lucide-react';
import { mobilePrimary, navByRole } from '../../data/navigation';
import { matchesDestination, supervisorAreaFor, visibleNavigation } from '../../data/supervisorNavigation';
import { useSessionStore } from '../../hooks/useSessionStore';
import { useUiStore } from '../../hooks/useUiStore';
import { cn } from '../../utils/cn';
import { useBreakSnapshot } from '../../features/break-management/hooks';
import { Dialog } from '../ui/Dialog';

export function MobileNav() {
  const user = useSessionStore(s => s.user);
  const { moreOpen, setMoreOpen } = useUiStore();
  const breaks = useBreakSnapshot();
  const { pathname } = useLocation();
  if (!user) return null;
  const area = user.role === 'SUPERVISOR' ? supervisorAreaFor(pathname) : undefined;
  const items = visibleNavigation(navByRole[user.role], user.role, breaks.data);
  const primary = mobilePrimary[user.role].flatMap(to => items.filter(item => item.to === to));
  const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';
  const renderLink = (item: typeof items[number], grid: boolean) => <Link key={item.to} to={item.to} onClick={() => setMoreOpen(false)} aria-current={(area ? area.to === item.to : matchesDestination(pathname, item.to)) ? 'page' : undefined}
    className={cn('flex flex-col items-center justify-center gap-1 text-center text-xs font-medium', focus, grid ? 'min-h-20 rounded-xl border border-line p-2' : 'h-16', (area ? area.to === item.to : matchesDestination(pathname, item.to)) ? 'bg-primary-50 text-primary-700' : 'text-ink-muted')}>
    <item.icon className="h-5 w-5" aria-hidden /><span>{item.label}</span>
  </Link>;
  return <>
    <nav aria-label="Mobile" className="app-glass-bar fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] md:hidden">
      {primary.map(item => renderLink(item, false))}
      <button onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen} className={cn('flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-ink-muted', focus)} aria-label="Open full navigation">
        <MenuIcon className="h-5 w-5" aria-hidden />More
      </button>
    </nav>
    <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="All sections">
      <nav aria-label="All sections" className="grid grid-cols-2 gap-2">{items.map(item => renderLink(item, true))}</nav>
    </Dialog>
  </>;
}
