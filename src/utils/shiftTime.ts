import type { ShiftCode } from '../types/domain';

export const BUSINESS_TIMEZONE = 'Asia/Colombo';
export const HANDOVER_WINDOW_MINUTES = 15;
export const LATE_GRACE_MINUTES = 15;
const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: BUSINESS_TIMEZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

export function businessDate(value: string | Date = new Date()): string {
  const parts = dateFormatter.formatToParts(new Date(value));
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}-${parts.find(p => p.type === 'day')!.value}`;
}
export function businessTime(value: string | Date): string { return timeFormatter.format(new Date(value)); }
export function businessDateTime(value: string | null): string { return value ? `${businessDate(value)} ${businessTime(value)}` : '—'; }
export function addCalendarDays(date: string, days: number): string { return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }
export function shiftStart(date: string, shift: ShiftCode): Date { return new Date(`${date}T${shift === 'MORNING' ? '07:30' : '19:30'}:00+05:30`); }
export function shiftEnd(date: string, shift: ShiftCode): Date { return new Date(shiftStart(date, shift).getTime() + 12 * 3600000); }
export function liveShift(now: Date) {
  const today = businessDate(now);
  const morning = shiftStart(today, 'MORNING'); const night = shiftStart(today, 'NIGHT');
  const shift: ShiftCode = now < morning || now >= night ? 'NIGHT' : 'MORNING';
  const date = now < morning ? addCalendarDays(today, -1) : today;
  const start = shiftStart(date, shift); const end = shiftEnd(date, shift);
  return { shift, date, start, end, progress: Math.max(0, Math.min(1, (now.getTime() - start.getTime()) / (end.getTime() - start.getTime()))), remainingSeconds: Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 1000)) };
}
export function captureDeviceTime() {
  const now = new Date();
  return { deviceTimestamp: now.toISOString(), timezoneOffsetMinutes: now.getTimezoneOffset() };
}
export function punctuality(receivedAt: string, scheduledAt: string): 'ON_TIME' | 'LATE' {
  return Date.parse(receivedAt) > Date.parse(scheduledAt) + LATE_GRACE_MINUTES * 60000 ? 'LATE' : 'ON_TIME';
}
/** Legacy demo timestamps had no offset; interpret them in the business timezone. */
export function handoverInstant(value: string): string { return /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}+05:30`; }
