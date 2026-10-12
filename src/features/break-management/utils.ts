export class BreakError extends Error {
  constructor(public code: string, message: string, public status = 400, public uncertain = false) { super(message); }
}
export function normalizeBreakError(error: unknown): BreakError {
  if (error instanceof BreakError) return error;
  if (error instanceof Error && error.name === 'ZodError') return new BreakError('INVALID_RESPONSE', 'Break data is malformed. Actions are disabled until a valid response is received.');
  return new BreakError('NETWORK', 'The action outcome cannot be confirmed. Refresh authoritative state before taking another action.', 0, true);
}
export function duration(value: number) { if (!Number.isFinite(value) || value < 0) return 'Unavailable'; const n = Math.floor(value); return `${Math.floor(n / 60).toString().padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`; }
export function businessTime(value: string, timezone: string): string {
  if (!timestamp.safeParse(value).success || !Number.isFinite(Date.parse(value))) return 'Unavailable — invalid timestamp';
  try { return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'medium', timeZone: timezone }).format(new Date(value)) + ` (${timezone})`; } catch { return 'Unavailable — invalid timezone'; }
}
export function displayElapsed(elapsed: number, receivedAt: number, monotonicNow: number, serverNow: string, shiftEnd: string, active: boolean) {
  if (!active) return elapsed;
  const delta = Math.max(0, (monotonicNow - receivedAt) / 1000);
  return elapsed + Math.min(delta, Math.max(0, (Date.parse(shiftEnd) - Date.parse(serverNow)) / 1000));
}
import { timestamp } from './contracts';
