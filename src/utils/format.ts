import { format, formatDistanceStrict, parseISO } from 'date-fns';
import { SERVER_NOW } from './clock';
import type { DeptCode, ShiftCode } from '../types/domain';

export const fmtDate = (s: string, pattern = 'MMM d, yyyy'): string => format(parseISO(s), pattern);
export const fmtDateTime = (s: string): string => format(parseISO(s), 'MMM d, HH:mm');
export const fmtTime = (s: string): string => format(parseISO(s), 'HH:mm');
export const fmtLongDate = (s: string): string => format(parseISO(s), 'EEEE, MMMM d');

export function fmtShiftWindow(start: string, end: string): string {
  const s = parseISO(start);
  const e = parseISO(end);
  if (format(s, 'yyyyMMdd') === format(e, 'yyyyMMdd')) {
    return `${format(s, 'MMM d')} · ${format(s, 'HH:mm')} → ${format(e, 'HH:mm')}`;
  }
  return `${format(s, 'MMM d, HH:mm')} → ${format(e, 'MMM d, HH:mm')}`;
}

export function relative(s: string): string {
  return formatDistanceStrict(parseISO(s), SERVER_NOW, { addSuffix: true });
}

export const deptNames: Record<DeptCode, string> = {
  GS: 'Accounts',
  DP: 'Deposits',
  WD: 'Withdrawals',
  SAFETY: 'Safety'
};

export const shiftLabels: Record<ShiftCode, string> = { MORNING: 'Morning', NIGHT: 'Night' };
export const shiftHours: Record<ShiftCode, string> = { MORNING: '07:30 → 19:30', NIGHT: '19:30 → 07:30 (+1)' };

export function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round(part / whole * 100);
}

export function humanize(s: string): string {
  return s.
  toLowerCase().
  split('_').
  map((w) => w.charAt(0).toUpperCase() + w.slice(1)).
  join(' ');
}