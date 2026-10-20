// Server-synchronised operational clock used for display. Authoritative time lives on the backend.
export let SERVER_NOW = new Date('2026-09-25T18:52:00');
export let TODAY = '2026-09-25';

// The fixture reference stays deterministic for imports. Authenticated backend
// runtimes replace it before executing a workflow, using the actual server clock.
export function setOperationalClock(instant: string) {
  SERVER_NOW = new Date(instant);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(SERVER_NOW);
  TODAY = `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
}
