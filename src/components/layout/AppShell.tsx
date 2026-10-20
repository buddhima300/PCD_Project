import { Suspense, useLayoutEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSessionStore } from '../../hooks/useSessionStore';
import { LoadingBlock } from '../ui/States';
import { MobileNav } from './MobileNav';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { SupervisorContext } from './SupervisorContext';
import { supervisorAreaFor } from '../../data/supervisorNavigation';

export function AppShell() {
  const user = useSessionStore((s) => s.user);
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    if (!user) return;
    document.documentElement.classList.add('elite-theme');
    return () => document.documentElement.classList.remove('elite-theme');
  }, [user]);
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="app-shell-canvas flex min-h-screen w-full" data-workspace={user.role === 'SUPERVISOR' ? supervisorAreaFor(pathname)?.id ?? 'supervisor' : user.role.toLowerCase()}>
      <div className="app-atmosphere" aria-hidden="true"><span /><span /><span /></div>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-24 pt-5 md:px-6 md:pb-10">
          <Suspense fallback={<LoadingBlock rows={8} />}>
            <SupervisorContext />
            <Outlet />
          </Suspense>
        </main>
      </div>
      <MobileNav />
    </div>);

}
