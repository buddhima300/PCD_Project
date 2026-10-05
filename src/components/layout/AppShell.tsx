import React, { Suspense } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useSessionStore } from '../../hooks/useSessionStore';
import { LoadingBlock } from '../ui/States';
import { MobileNav } from './MobileNav';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const user = useSessionStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="flex min-h-screen w-full bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-24 pt-5 md:px-6 md:pb-10">
          <Suspense fallback={<LoadingBlock rows={8} />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <MobileNav />
    </div>);

}