import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { BellIcon, ChevronDownIcon, LogOutIcon, SearchIcon, UserCircleIcon } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { roleLabels } from '../../data/navigation';
import { useDebounce } from '../../hooks/useDebounce';
import { useSessionStore } from '../../hooks/useSessionStore';
import { api } from '../../services/api';
import { toast } from 'sonner';

export function initials(name: string) {
  return name.
  split(' ').
  map((p) => p[0]).
  slice(0, 2).
  join('').
  toUpperCase();
}

export function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const dq = useDebounce(q, 250);
  const navigate = useNavigate();
  const res = useQuery({ queryKey: ['search', dq], queryFn: () => api.globalSearch(dq), enabled: dq.length >= 2 });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div ref={ref} className="relative w-full max-w-md">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search platforms, employees, freelancers, laptops…"
        aria-label="Global search"
        className="app-input h-10 w-full rounded-2xl border pl-9 pr-3 text-[13px] placeholder:text-ink-subtle focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20" />
      
      <AnimatePresence>
        {open && dq.length >= 2 &&
        <motion.ul
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
          className="absolute left-0 right-0 top-12 z-40 max-h-80 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-pop"
          role="listbox">
          
            {res.isPending && <li className="px-3 py-2 text-xs text-ink-muted">Searching…</li>}
            {res.data?.length === 0 && <li className="px-3 py-2 text-xs text-ink-muted">No matches for “{dq}”.</li>}
            {res.data?.map((r) =>
          <li key={`${r.kind}-${r.id}`}>
                <button
              onClick={() => {
                navigate(r.to);
                setOpen(false);
                setQ('');
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-mist">
              
                  <span className="w-20 shrink-0 text-[11px] font-medium text-ink-subtle">{r.kind}</span>
                  <span className="font-mono text-xs text-ink">{r.id}</span>
                  <span className="truncate text-xs text-ink-muted">{r.label}</span>
                </button>
              </li>
          )}
          </motion.ul>
        }
      </AnimatePresence>
    </div>);

}

export function Topbar() {
  const user = useSessionStore((s) => s.user)!;
  const permissions = useSessionStore(s => s.permissions);
  const signOut = useSessionStore((s) => s.signOut);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notif = useQuery({ queryKey: ['notifications', user.id, 'unread'], queryFn: () => api.listNotifications({ unreadOnly: true }), refetchInterval: 2_000 });
  useEffect(() => {
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const unread = notif.data?.unread ?? 0;

  return (
    <header className="app-glass-bar sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 backdrop-blur md:px-6">
      <Link to="/" className="flex items-center gap-2 md:hidden" aria-label="PortCity Digital home">
        <BrandLogo compact />
        <span className="text-sm font-semibold">PortCity Digital</span>
      </Link>
      <div className="hidden flex-1 md:block">
        <GlobalSearch />
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <Link to="/notifications" className="relative rounded-xl p-2.5 text-ink-muted hover:bg-mist hover:text-ink" aria-label={`Notifications, ${unread} unread`}>
          <BellIcon className="h-5 w-5" />
          {unread > 0 &&
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white tabular">{unread}</span>
          }
        </Link>
        <div ref={menuRef} className="relative">
          <button onClick={() => setMenu((v) => !v)} className="flex items-center gap-2.5 rounded-xl p-1 pr-2 hover:bg-mist" aria-haspopup="menu" aria-expanded={menu}>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">{initials(user.name)}</span>
            <span className="hidden text-left sm:block">
              <span className="block text-[13px] font-semibold leading-tight text-ink">{user.name}</span>
              <span className="block text-[11px] leading-tight text-ink-muted">{roleLabels[user.role]}</span>
            </span>
            <ChevronDownIcon className="hidden h-4 w-4 text-ink-subtle sm:block" />
          </button>
          <AnimatePresence>
            {menu &&
            <motion.div
              role="menu"
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              style={{ transformOrigin: 'top right' }}
              className="absolute right-0 top-12 z-40 w-72 rounded-xl border border-line bg-surface p-1.5 shadow-pop">
              
                <div className="px-3 py-2">
                  <p className="text-sm font-semibold">{user.name}</p>
                  <p className="text-xs text-ink-muted">{user.email}</p>
                </div>
                <Link to="/profile" role="menuitem" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-mist">
                  <UserCircleIcon className="h-4 w-4 text-ink-subtle" /> Profile
                </Link>
                {permissions.includes('accounts.manage') && <>
                  <Link to="/account-admin" role="menuitem" onClick={() => setMenu(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-mist">Account management · Add Supervisor</Link>
                </>}
                <Link to="/profile#password" role="menuitem" onClick={() => setMenu(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-mist">Change password</Link>
                <div className="my-1 border-t border-line" />
                <button
                role="menuitem"
                onClick={async () => {
                  try { await signOut(); await qc.cancelQueries(); qc.clear(); navigate('/login'); }
                  catch (error) { toast.error(error instanceof Error ? error.message : 'Sign out failed. Try again.'); }
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger-600 hover:bg-danger-50">
                
                  <LogOutIcon className="h-4 w-4" /> Sign out
                </button>
              </motion.div>
            }
          </AnimatePresence>
        </div>
      </div>
    </header>);

}
