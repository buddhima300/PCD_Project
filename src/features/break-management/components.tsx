import React, { useEffect, useState } from 'react';

import { Button } from '../../components/ui/Button';

import { businessTime, displayElapsed, duration } from './utils';

import type { BreakEvent, BreakSession, BreakSnapshot } from './contracts';

export function BreakStatus({ status }: { status: string }) { return <span className="inline-flex rounded-lg border border-line px-2 py-1 text-xs font-medium">{status.replace(/_/g, ' ')}</span>; }
export function BreakNotice({ children, error = false }: { children: React.ReactNode; error?: boolean }) { return <div role={error ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${error ? 'border-danger-200 bg-danger-50 text-danger-600' : 'border-line bg-mist text-ink-muted'}`}>{children}</div>; }
export function BreakTimer({ session, snapshot }: { session: BreakSession; snapshot: BreakSnapshot }) {
  const [clock, setClock] = useState({ received: performance.now(), current: performance.now() });
  useEffect(() => { const received = performance.now(); setClock({ received, current: received }); const id = window.setInterval(() => setClock({ received, current: performance.now() }), 1000); return () => clearInterval(id); }, [snapshot.serverNow, session.id]);
  const elapsed = displayElapsed(session.elapsedSeconds, clock.received, clock.current, snapshot.serverNow, session.shiftEnd, session.status === 'ACTIVE');
  return <div className="space-y-2"><div className="flex items-center gap-2"><BreakStatus status={session.status} />{session.overrun && <BreakStatus status="Overrun — review required" />}</div><p className="font-mono text-4xl tabular-nums" aria-label={`Session elapsed ${duration(elapsed)}`}>{duration(elapsed)}</p><p className="text-xs text-ink-muted">Display estimate between server refreshes. Started {businessTime(session.startedAt, snapshot.timezone)}.</p>{session.status === 'UNRESOLVED' && <BreakNotice error>Scheduled closure is unresolved. An authorized supervisor must correct this timer.</BreakNotice>}</div>;
}
export function BreakAllowance({ snapshot }: { snapshot: BreakSnapshot }) {
  if (!snapshot.allowance) return <BreakNotice>Allowance unavailable: no scheduled assignment returned.</BreakNotice>;
  return <dl className="grid grid-cols-3 gap-3">{[['Allowance', snapshot.allowance.totalSeconds], ['Consumed', snapshot.allowance.consumedSeconds], ['Remaining', snapshot.allowance.remainingSeconds]].map(([label, value]) => <div key={label} className="rounded-xl border border-line p-3"><dt className="text-xs text-ink-muted">{label}</dt><dd className="mt-1 font-mono text-xl tabular-nums">{duration(Number(value))}</dd><p className="text-xs text-ink-subtle">minutes:seconds</p></div>)}</dl>;
}
export function BreakAudit({ events, timezone }: { events: BreakEvent[]; timezone: string }) { return <ol className="space-y-2">{events.map(e => <li key={e.id} className="rounded-lg border border-line p-3 text-sm"><strong>{e.action.replace(/_/g, ' ')}</strong> · {e.actor}<p className="text-xs text-ink-muted">{businessTime(e.at, timezone)}</p>{e.reason && <p>{e.reason}</p>}{(e.previous || e.resulting) && <p className="break-all text-xs">Original: {e.previous || '—'} · Result: {e.resulting || '—'}</p>}</li>)}</ol>; }
export function BreakHistory({ sessions, timezone, onView }: { sessions: BreakSession[]; timezone: string; onView: (s: BreakSession) => void }) {
  if (!sessions.length) return <BreakNotice>No break sessions match this view.</BreakNotice>;
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Break sessions and scheduled shift dates</caption><thead><tr>{['Employee', 'Assignment at event', 'Scheduled shift', 'Duration', 'Status', 'Review', 'Details'].map(h => <th key={h} scope="col" className="border-b border-line p-3 font-medium text-ink-muted">{h}</th>)}</tr></thead><tbody>{sessions.map(s => <tr key={s.id}><td className="border-b border-line p-3">{s.workerName}<p className="text-xs text-ink-muted">{s.workerId}</p></td><td className="border-b border-line p-3">{s.department} · {s.platform}</td><td className="border-b border-line p-3">{s.shiftDate}<p className="text-xs">{s.shift}</p></td><td className="border-b border-line p-3 font-mono">{duration(s.elapsedSeconds)}</td><td className="border-b border-line p-3"><BreakStatus status={s.status} />{s.overrun && <p className="mt-1 text-xs">Overrun</p>}</td><td className="border-b border-line p-3">{s.review?.outcome ?? (s.overrun ? 'Unreviewed' : '—')}</td><td className="border-b border-line p-3"><Button variant="secondary" size="sm" onClick={() => onView(s)} aria-label={`View session for ${s.workerName}`}>View</Button><span className="sr-only">Started {businessTime(s.startedAt, timezone)}</span></td></tr>)}</tbody></table></div>;
}

