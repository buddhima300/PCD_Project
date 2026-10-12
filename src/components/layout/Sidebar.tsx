import { Link, useLocation } from 'react-router-dom';
import { ChevronsLeftIcon, ChevronsRightIcon } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { navByRole } from '../../data/navigation';
import { useSessionStore } from '../../hooks/useSessionStore';
import { useUiStore } from '../../hooks/useUiStore';
import { cn } from '../../utils/cn';
import { ShiftClock } from './ShiftClock';
import { useBreakSnapshot } from '../../features/break-management/hooks';
import { matchesDestination, supervisorAreaFor, visibleNavigation } from '../../data/supervisorNavigation';

export function Sidebar() {
  const user = useSessionStore((s) => s.user);
  const { sidebarCollapsed: collapsed, toggleSidebar } = useUiStore();
  const breaks = useBreakSnapshot();
  const { pathname } = useLocation();
  if (!user) return null;
  const activeArea = user.role === 'SUPERVISOR' ? supervisorAreaFor(pathname) : undefined;
  const items = visibleNavigation(navByRole[user.role], user.role, breaks.data);
  const groups = items.reduce<Record<string, typeof items>>((acc, it) => {
    const g = it.group ?? '';
    (acc[g] ??= []).push(it);
    return acc;
  }, {});

  return (
    <aside
      aria-label="Primary"
      className={cn(
        'app-glass-bar sticky top-0 hidden h-screen shrink-0 flex-col border-r md:flex',
        'transition-[width] duration-200 ease-out',
        collapsed ? 'w-[72px]' : 'w-[72px] lg:w-64'
      )}>
      
      <div className={cn('flex items-center gap-2.5 px-4 pb-3 pt-4', collapsed && 'justify-center px-0')}>
        <BrandLogo compact />
        <div className={cn('min-w-0', collapsed ? 'hidden' : 'hidden lg:block')}>
          <p className="text-[15px] font-semibold leading-tight text-ink">PortCity Digital</p>
          <p className="text-[11px] leading-tight text-ink-subtle">BPO Platform Operations</p>
        </div>
      </div>


      <nav className="scroll-thin flex-1 overflow-y-auto px-3 pb-3">
        {Object.entries(groups).map(([group, list]) =>
        <div key={group || 'main'} className="mt-2">
            {group && <p className={cn('px-2.5 pb-1 pt-2 text-[11px] font-medium text-ink-subtle', collapsed ? 'hidden' : 'hidden lg:block')}>{group}</p>}
            <ul className="space-y-0.5">
              {list.map((it) =>
            <li key={it.to}>
                  <Link
                to={it.to}
                title={it.label}
                aria-current={(activeArea ? activeArea.to === it.to : matchesDestination(pathname, it.to)) ? 'page' : undefined}
                className={
                cn(
                  'flex h-10 items-center gap-3 rounded-xl px-2.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
                  collapsed ? 'justify-center' : 'justify-center lg:justify-start',
                  (activeArea ? activeArea.to === it.to : matchesDestination(pathname, it.to)) ? 'bg-primary-50 text-primary-700' : 'text-ink-muted hover:bg-mist hover:text-ink'
                )
                }>
                
                    <it.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                    <span className={cn('truncate', collapsed ? 'sr-only' : 'sr-only lg:not-sr-only')}>{it.label}</span>
                  </Link>
                </li>
            )}
            </ul>
          </div>
        )}
      </nav>

      <div className={cn('px-3 pb-3', collapsed ? 'hidden' : 'hidden lg:block')}>
        <ShiftClock />
      </div>
      <button
        onClick={toggleSidebar}
        className="hidden h-10 items-center justify-center gap-2 border-t border-line text-xs font-medium text-ink-muted hover:bg-mist hover:text-ink lg:flex"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        
        {collapsed ? <ChevronsRightIcon className="h-4 w-4" /> : <><ChevronsLeftIcon className="h-4 w-4" /> Collapse</>}
      </button>
    </aside>);

}
