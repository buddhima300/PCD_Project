import React from 'react';
import { NavLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { MenuIcon, XIcon } from 'lucide-react';
import { mobilePrimary, navByRole } from '../../data/navigation';
import { useSessionStore } from '../../hooks/useSessionStore';
import { useUiStore } from '../../hooks/useUiStore';
import { cn } from '../../utils/cn';

export function MobileNav() {
  const user = useSessionStore((s) => s.user)!;
  const { moreOpen, setMoreOpen } = useUiStore();
  const items = navByRole[user.role];
  const primary = mobilePrimary[user.role].map((to) => items.find((i) => i.to === to)!).filter(Boolean);

  return (
    <>
      <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {primary.map((it) =>
        <NavLink
          key={it.to}
          to={it.to}
          end={it.to === '/'}
          className={({ isActive }) => cn('flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium', isActive ? 'text-primary' : 'text-ink-muted')}>
          
            <it.icon className="h-5 w-5" aria-hidden />
            <span className="max-w-[72px] truncate">{it.label.replace('Platform ', '')}</span>
          </NavLink>
        )}
        <button onClick={() => setMoreOpen(true)} className="flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium text-ink-muted" aria-label="Open full navigation">
          <MenuIcon className="h-5 w-5" aria-hidden />
          More
        </button>
      </nav>
      <AnimatePresence>
        {moreOpen &&
        <div className="fixed inset-0 z-50 md:hidden">
            <motion.div className="absolute inset-0 bg-ink/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={() => setMoreOpen(false)} />
            <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-surface p-4 pb-8">
            
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">All sections</p>
                <button onClick={() => setMoreOpen(false)} className="rounded-lg p-1.5 hover:bg-mist" aria-label="Close navigation">
                  <XIcon className="h-5 w-5" />
                </button>
              </div>
              <ul className="grid grid-cols-3 gap-2">
                {items.map((it) =>
              <li key={it.to}>
                    <NavLink
                  to={it.to}
                  end={it.to === '/'}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                  cn('flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 text-center text-[11px] font-medium', isActive ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-line text-ink-muted')
                  }>
                  
                      <it.icon className="h-5 w-5" aria-hidden />
                      <span className="leading-tight">{it.label}</span>
                    </NavLink>
                  </li>
              )}
              </ul>
            </motion.div>
          </div>
        }
      </AnimatePresence>
    </>);

}