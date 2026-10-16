import { demoUsers, shiftDefinitions } from '../../data/reference';
import { businessDate, handoverInstant } from '../../utils/shiftTime';
import { ApiError, currentAuth, requireRole, respond } from './core';
import { db } from './db';

export type ProfileEventKind = 'HALF_DAY' | 'CASUAL_LEAVE' | 'INFORMED_ABSENCE' | 'UNINFORMED_ABSENCE' | 'OFF_DAY';
export interface ProfileEvent { workerId: string; date: string; kind: ProfileEventKind; note: string; actor: string; recordedAt: string }
interface ProfileStorage { photos: Record<string, string>; events: ProfileEvent[] }
const read = (): ProfileStorage => {
  try { return JSON.parse(localStorage.getItem('relay-profile-v1') ?? '{"photos":{},"events":[]}'); }
  catch { return { photos: {}, events: [] }; }
};
const write = (data: ProfileStorage) => localStorage.setItem('relay-profile-v1', JSON.stringify(data));
function person(id: string) {
  const employee = db.employees.find(e => e.id === id);
  const freelancer = db.freelancers.find(e => e.id === id);
  const actor = currentAuth();
  const supervisor = demoUsers.find(e => e.id === id && e.role === 'SUPERVISOR') ?? (actor.role === 'SUPERVISOR' && actor.userId === id ? { id, name: actor.name, role: actor.role, email: '', title: 'Supervisor' } : undefined);
  const record = employee ?? freelancer ?? supervisor;
  if (!record) throw new ApiError('NOT_FOUND', 'Profile not found.', 404);
  return { record, role: supervisor ? 'SUPERVISOR' : freelancer ? 'FREELANCER' : 'EMPLOYEE' };
}
function dateValid(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new ApiError('VALIDATION', 'Choose a valid date.', 422);
}
export const profileApi = {
  getProfile: (id: string, start: string, end: string) => respond(() => {
    const actor = currentAuth();
    if (actor.role !== 'SUPERVISOR' && actor.userId !== id) throw new ApiError('FORBIDDEN', 'You can only view your own profile.', 403);
    dateValid(start); dateValid(end);
    if (start > end) throw new ApiError('VALIDATION', 'Start date must precede end date.', 422);
    const { record, role } = person(id); const storage = read();
    const events = storage.events.filter(e => e.workerId === id);
    const selected = events.filter(e => e.date >= start && e.date <= end);
    const shifts = new Map<string, { date: string; shift: string; hours: number; corrected: boolean }>();
    for (const h of db.handovers) {
      // Incoming receipt establishes a shift; outgoing events must not count it twice.
      if (h.incomingId !== id || !h.receivedAt || (!h.outgoingConfirmedAt && !h.selfConfirmationReason)) continue;
      const date = businessDate(handoverInstant(h.scheduledAt));
      if (date < start || date > end) continue;
      const definition = shiftDefinitions.find(s => s.code === h.incomingShift)!;
      const minutes = (time: string) => Number(time.split(':')[0]) * 60 + Number(time.split(':')[1]);
      const hours = ((minutes(definition.end) - minutes(definition.start) + 1440) % 1440) / 60;
      shifts.set(`${date}-${h.incomingShift}`, { date, shift: h.incomingShift, hours, corrected: !!h.corrections?.length });
    }
    const attendance = [...shifts.values()].sort((a, b) => b.date.localeCompare(a.date));
    const days = new Map<string, number>(); let hours = 0;
    for (const row of attendance) {
      const event = selected.find(e => e.date === row.date);
      const fraction = event?.kind === 'HALF_DAY' ? .5 : event && event.kind !== 'OFF_DAY' ? 0 : 1;
      if (role !== 'FREELANCER' && days.has(row.date)) continue;
      days.set(row.date, Math.max(days.get(row.date) ?? 0, fraction)); hours += row.hours * fraction;
    }
    const offDates = new Set(db.offDays.filter(o => o.employeeId === id && ['APPROVED', 'OVERRIDE_APPROVED'].includes(o.status) && o.date >= start && o.date <= end).map(o => o.date));
    selected.filter(e => e.kind === 'OFF_DAY').forEach(e => offDates.add(e.date));
    const joined = 'joinedAt' in record ? record.joinedAt.slice(0, 10) : null;
    const monthNumber = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
    const accrued = role === 'EMPLOYEE' && joined && joined <= end ? monthNumber(end) - monthNumber(joined) + 1 : 0;
    const consumed = events.filter(e => e.date <= end).reduce((sum, e) => sum + (e.kind === 'HALF_DAY' ? 1 : e.kind === 'CASUAL_LEAVE' ? 2 : 0), 0);
    const halfDays = Math.max(0, accrued - consumed);
    const months: string[] = []; const cursor = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
    while (cursor.toISOString().slice(0, 7) <= end.slice(0, 7)) { months.push(cursor.toISOString().slice(0, 7)); cursor.setUTCMonth(cursor.getUTCMonth() + 1); }
    return { record, role, photo: storage.photos[id], attendance, events: selected, days: [...days.values()].reduce((a, b) => a + b, 0), hours, offDays: offDates.size, halfDays, casualDays: Math.floor(halfDays / 2), informed: selected.filter(e => e.kind === 'INFORMED_ABSENCE').length,
      allowance: months.map(month => ({ month, eligible: !events.some(e => e.date.startsWith(month) && ['INFORMED_ABSENCE', 'UNINFORMED_ABSENCE', 'CASUAL_LEAVE'].includes(e.kind)), provisional: true })) };
  }),
  saveProfilePhoto: (photo: string) => respond(() => {
    const actor = currentAuth();
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(photo) || photo.length > 2800000) throw new ApiError('VALIDATION', 'Choose a PNG, JPEG or WebP image under 2 MB.', 422);
    const data = read(); data.photos[actor.userId] = photo; write(data);
  }),
  recordProfileEvent: (input: Pick<ProfileEvent, 'workerId' | 'date' | 'kind' | 'note'>) => respond(() => {
    const actor = requireRole('SUPERVISOR'); const { role } = person(input.workerId); dateValid(input.date);
    if (!['HALF_DAY', 'CASUAL_LEAVE', 'INFORMED_ABSENCE', 'UNINFORMED_ABSENCE', 'OFF_DAY'].includes(input.kind) || input.note.trim().length < 5) throw new ApiError('VALIDATION', 'Select a valid event and supply a note of at least five characters.', 422);
    if (role === 'FREELANCER' || (role === 'SUPERVISOR' && ['HALF_DAY', 'CASUAL_LEAVE'].includes(input.kind))) throw new ApiError('VALIDATION', 'This leave entitlement does not apply to this role.', 422);
    const data = read();
    if (data.events.some(e => e.workerId === input.workerId && e.date === input.date)) throw new ApiError('CONFLICT', 'An event already exists on this date.', 409);
    if (['HALF_DAY', 'CASUAL_LEAVE'].includes(input.kind)) {
      const { record } = person(input.workerId); const joined = 'joinedAt' in record ? record.joinedAt : input.date;
      const accrual = Math.max(0, (Number(input.date.slice(0, 4)) - Number(joined.slice(0, 4))) * 12 + Number(input.date.slice(5, 7)) - Number(joined.slice(5, 7)) + 1);
      const used = data.events.filter(e => e.workerId === input.workerId).reduce((n, e) => n + (e.kind === 'HALF_DAY' ? 1 : e.kind === 'CASUAL_LEAVE' ? 2 : 0), 0);
      if (accrual - used < (input.kind === 'CASUAL_LEAVE' ? 2 : 1)) throw new ApiError('VALIDATION', 'Insufficient accumulated half-day entitlement.', 422);
    }
    data.events.push({ ...input, note: input.note.trim(), actor: actor.name, recordedAt: new Date().toISOString() }); write(data);
  })
};
