import type { Handover, Laptop, ShiftCode } from '../../types/domain';
import type { AttendanceRow, AttendanceStatus, HandoverCorrectionInput, HandoverSubmission } from '../../types/attendance';
import { addCalendarDays, businessDate, handoverInstant, punctuality, shiftStart } from '../../utils/shiftTime';
import { ApiError, requireRole, respond } from './core';
import { db, pushAudit } from './db';

function instant(value: string | null) { return value ? handoverInstant(value) : null; }
function validateTimestamp(value: string) {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new ApiError('VALIDATION', 'A valid device timestamp with a timezone is required.', 422);
  return new Date(value).toISOString();
}
function validateDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new ApiError('VALIDATION', 'Choose a valid calendar date.', 422);
}
function findHandover(id: string) {
  const h = db.handovers.find(h => h.id === id);
  if (!h) throw new ApiError('NOT_FOUND', 'Handover not found.', 404);
  return h;
}
function worker(id: string) { return db.employees.find(e => e.id === id) ?? db.freelancers.find(f => f.id === id); }
function roleOf(id: string): 'EMPLOYEE' | 'FREELANCER' { return db.freelancers.some(f => f.id === id) ? 'FREELANCER' : 'EMPLOYEE'; }

/** Resolve the planned seat occupant, including approved leave and freelancer replacements. */
function plannedWorker(laptop: Laptop, date: string, shift: ShiftCode) {
  const slot = Number(laptop.workstationId?.split('-').slice(-1)[0]);
  const employees = db.employees.filter(e => e.platformCode === laptop.platformCode && e.dept === laptop.dept && e.shift === shift && e.status === 'ACTIVE');
  const employee = employees.find(e => e.currentWorkstationId === laptop.workstationId || e.id === laptop.currentUserId || e.id === laptop.nextUserId) ?? employees.find(e => e.slot === slot);
  const replacement = db.replacements.find(r => r.date === date && r.shift === shift && r.platformCode === laptop.platformCode && r.dept === laptop.dept && ['ASSIGNED', 'CONFIRMED'].includes(r.status) && (r.workstationId === laptop.workstationId || r.absentEmployeeId === employee?.id));
  if (replacement?.freelancerId) return db.freelancers.find(f => f.id === replacement.freelancerId && f.status === 'ACTIVE') ?? null;
  if (!employee || db.offDays.some(o => o.employeeId === employee.id && o.date === date && ['APPROVED', 'OVERRIDE_APPROVED'].includes(o.status)) || db.replacements.some(r => r.absentEmployeeId === employee.id && r.date === date && r.status !== 'CANCELLED')) return null;
  return employee;
}

/** Mock scheduling adapter: materialize planned transfers for real calendar dates. */
function ensureScheduledHandovers(date: string) {
  for (const laptop of db.laptops.filter(l => l.workstationId && l.status !== 'RETIRED' && db.platforms.some(p => p.code === l.platformCode && p.status === 'ACTIVE'))) {
    for (const shift of ['MORNING', 'NIGHT'] as const) {
      const scheduledAt = shiftStart(date, shift).toISOString();
      if (db.handovers.some(h => (h.assetId === laptop.assetId || h.plannedAssetId === laptop.assetId) && Date.parse(handoverInstant(h.scheduledAt)) === Date.parse(scheduledAt))) continue;
      const outgoingShift = shift === 'MORNING' ? 'NIGHT' : 'MORNING';
      const incoming = plannedWorker(laptop, date, shift);
      const outgoing = plannedWorker(laptop, shift === 'MORNING' ? addCalendarDays(date, -1) : date, outgoingShift);
      if (!incoming) continue;
      if (db.handovers.some(h => h.incomingId === incoming.id && Date.parse(handoverInstant(h.scheduledAt)) === Date.parse(scheduledAt))) continue;
      db.handovers.push({ id: `HO-${laptop.assetId}-${date}-${shift}`, assetId: laptop.assetId, workstationId: laptop.workstationId!, poolId: laptop.poolId, platformCode: laptop.platformCode, dept: laptop.dept, incomingId: incoming.id, incomingName: incoming.name, outgoingId: outgoing?.id ?? '', outgoingName: outgoing?.name ?? 'No outgoing worker scheduled', incomingShift: shift, outgoingShift, scheduledAt, status: 'PENDING', outgoingConfirmedAt: null, receivedAt: null, checklist: null, incidentId: null, attendanceTracked: true, revision: 0 });
    }
  }
}
export function attendanceStatus(h?: Handover): AttendanceStatus {
  if (!h?.receivedAt) return 'AWAITING_RECEIPT';
  if (!h.outgoingConfirmedAt && !h.selfConfirmationReason) return 'PENDING_COUNTERPART';
  return punctuality(handoverInstant(h.receivedAt), handoverInstant(h.scheduledAt));
}
function recordAudit(h: Handover, action: string, reason: string, previous: string, next: string) {
  const actor = requireRole('EMPLOYEE', 'FREELANCER', 'SUPERVISOR');
  pushAudit({ at: new Date().toISOString(), actorId: actor.userId, actorName: actor.name, role: actor.role, action, entity: 'Handover', entityId: h.id, platformCode: h.platformCode, dept: h.dept, previous, next, reason, isOverride: action === 'HANDOVER_CORRECTED' });
}
function updateCustody(h: Handover) {
  h.status = h.equipmentIssue || h.incidentId ? 'ISSUE_REPORTED' : h.receivedAt && (h.outgoingConfirmedAt || h.selfConfirmationReason) ? 'COMPLETED' : h.receivedAt ? 'RECEIVED' : h.outgoingConfirmedAt ? 'OUTGOING_CONFIRMED' : 'PENDING';
  const laptop = db.laptops.find(l => l.assetId === h.assetId);
  if (!laptop) return;
  laptop.handoverStatus = h.status;
  if (h.receivedAt && (h.outgoingConfirmedAt || h.selfConfirmationReason)) {
    laptop.currentUserId = h.incomingId; laptop.currentUserName = h.incomingName; laptop.currentShift = h.incomingShift;
    laptop.nextUserId = null; laptop.nextUserName = null;
    laptop.status = db.incidents.some(i => i.assetId === h.assetId && i.status !== 'RESOLVED') || laptop.condition === 'DAMAGED' ? 'INCIDENT' : 'ASSIGNED';
    const previous = db.employees.find(e => e.id === h.outgoingId && e.currentWorkstationId === h.workstationId);
    if (previous) { previous.currentWorkstationId = null; previous.workstationState = null; }
    const incoming = db.employees.find(e => e.id === h.incomingId);
    if (incoming) { incoming.currentWorkstationId = h.workstationId; incoming.workstationState = 'IN_USE'; }
  } else if (h.outgoingConfirmedAt && laptop.status === 'ASSIGNED') laptop.status = 'HANDOVER_PENDING';
}

export function dailyAttendanceRows(date: string): AttendanceRow[] {
  validateDate(date);
  const rows = new Map<string, AttendanceRow>();
  for (const event of db.handovers) {
    for (const direction of ['INCOMING', 'OUTGOING'] as const) {
      const at = instant(direction === 'INCOMING' ? event.receivedAt : event.outgoingConfirmedAt);
      if (!at || businessDate(at) !== date) continue;
      const id = direction === 'INCOMING' ? event.incomingId : event.outgoingId;
      if (!id) continue;
      const startAt = new Date(Date.parse(handoverInstant(event.scheduledAt)) - (direction === 'OUTGOING' ? 12 * 3600000 : 0)).toISOString();
      const key = `${id}|${startAt}`;
      const receipt = direction === 'INCOMING' ? event : db.handovers.find(h => h.incomingId === id && h.platformCode === event.platformCode && h.dept === event.dept && Date.parse(handoverInstant(h.scheduledAt)) === Date.parse(startAt));
      const outgoing = direction === 'OUTGOING' ? event : db.handovers.find(h => h.outgoingId === id && h.platformCode === event.platformCode && h.dept === event.dept && Date.parse(handoverInstant(h.scheduledAt)) === Date.parse(startAt) + 12 * 3600000);
      const prior = rows.get(key);
      const row: AttendanceRow = prior ?? { id: key, workerId: id, workerName: direction === 'INCOMING' ? event.incomingName : event.outgoingName, workerType: roleOf(id), shift: direction === 'INCOMING' ? event.incomingShift : event.outgoingShift, shiftDate: businessDate(startAt), eventDate: date, platformCode: event.platformCode, dept: event.dept, assetId: event.assetId, receivedFrom: receipt?.outgoingName || 'No outgoing worker', handedTo: outgoing?.incomingName || '—', receivedAt: null, outgoingAt: null, status: attendanceStatus(receipt), exceptionReason: receipt?.selfConfirmationReason ?? '', notes: '', equipmentIssue: [receipt?.equipmentIssue, outgoing?.equipmentIssue].filter(Boolean).join(' · '), corrected: !!receipt?.corrections?.length || !!outgoing?.corrections?.length, handoverIds: [receipt?.id, outgoing?.id].filter((v): v is string => !!v) };
      // Only timestamps actually submitted on the selected calendar date appear in the daily export.
      if (direction === 'INCOMING') row.receivedAt = at; else row.outgoingAt = at;
      const note = direction === 'INCOMING' ? event.incomingNotes : event.outgoingNotes ?? event.checklist?.notes;
      if (note) row.notes = [row.notes, `${direction === 'INCOMING' ? 'Receipt' : 'Outgoing'}: ${note}`].filter(Boolean).join(' · ');
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.workerName.localeCompare(b.workerName));
}

export const attendanceApi = {
  getMyWorkstationHandovers: (date: string, page = 1) => respond(() => {
    const actor = requireRole('EMPLOYEE', 'FREELANCER'); validateDate(date);
    for (const d of [addCalendarDays(date, -1), date, addCalendarDays(date, 1)]) ensureScheduledHandovers(d);
    const own = db.handovers.filter(h => h.incomingId === actor.userId || h.outgoingId === actor.userId || h.incomingConfirmation?.actorId === actor.userId || h.outgoingConfirmation?.actorId === actor.userId);
    const tasks = own.filter(h => {
      const scheduled = businessDate(handoverInstant(h.scheduledAt));
      return scheduled === date || (h.outgoingId === actor.userId && h.outgoingShift === 'NIGHT' && scheduled === addCalendarDays(date, 1));
    }).sort((a, b) => Date.parse(handoverInstant(a.scheduledAt)) - Date.parse(handoverInstant(b.scheduledAt)));
    const history = own.filter(h => ((h.incomingId === actor.userId || h.incomingConfirmation?.actorId === actor.userId) && h.receivedAt) || ((h.outgoingId === actor.userId || h.outgoingConfirmation?.actorId === actor.userId) && h.outgoingConfirmedAt)).sort((a, b) => Date.parse(handoverInstant(b.receivedAt ?? b.outgoingConfirmedAt!)) - Date.parse(handoverInstant(a.receivedAt ?? a.outgoingConfirmedAt!)));
    const workstation = db.laptops.find(l => l.currentUserId === actor.userId) ?? null;
    return { tasks, workstation, history: history.slice((Math.max(1, page) - 1) * 20, Math.max(1, page) * 20), totalHistory: history.length };
  }),
  submitHandoverConfirmation: (id: string, input: HandoverSubmission) => respond(() => {
    const actor = requireRole('EMPLOYEE', 'FREELANCER'); const h = findHandover(id);
    const incoming = input.direction === 'INCOMING';
    if (!['INCOMING', 'OUTGOING'].includes(input.direction) || (incoming ? h.incomingId : h.outgoingId) !== actor.userId || h.incomingId === h.outgoingId) throw new ApiError('FORBIDDEN', 'Only the scheduled worker can confirm their side of this transfer.', 403);
    const timestamp = validateTimestamp(input.deviceTimestamp);
    if (!Number.isInteger(input.timezoneOffsetMinutes) || Math.abs(input.timezoneOffsetMinutes) > 840) throw new ApiError('VALIDATION', 'Invalid device timezone offset.', 422);
    if (input.notes.length > 2000 || input.equipmentIssue.length > 2000) throw new ApiError('VALIDATION', 'Notes and equipment reports must be at most 2,000 characters.', 422);
    const selfReason = input.selfConfirmationReason?.trim();
    if (input.selfConfirmationReason !== undefined && (!incoming || h.outgoingConfirmedAt || !selfReason || selfReason.length < 5 || selfReason.length > 1000)) throw new ApiError('VALIDATION', 'Self-confirmation is for an unavailable outgoing worker and requires a reason of 5–1,000 characters.', 422);
    const confirmation = { actorId: actor.userId, actorName: actor.name, role: actor.role, deviceTimestamp: timestamp, timezoneOffsetMinutes: input.timezoneOffsetMinutes, recordedAt: new Date().toISOString() };
    if (incoming && selfReason && h.selfConfirmation?.deviceTimestamp === timestamp) return h;
    if (incoming && h.receivedAt && !h.selfConfirmationReason && selfReason) {
      if (Date.parse(timestamp) >= Date.parse(handoverInstant(h.scheduledAt)) + 12 * 3600000) throw new ApiError('SHIFT_ENDED', 'This shift has ended. Ask a supervisor to review the record.', 422);
      h.selfConfirmationReason = selfReason; h.selfConfirmation = confirmation; h.revision = (h.revision ?? 0) + 1;
      updateCustody(h); recordAudit(h, 'ATTENDANCE_SELF_CONFIRMED', selfReason, 'PENDING_COUNTERPART', attendanceStatus(h)); return h;
    }
    const existing = incoming ? h.incomingConfirmation : h.outgoingConfirmation;
    if (existing) {
      if (existing.deviceTimestamp === timestamp) return h;
      throw new ApiError('ALREADY_CONFIRMED', 'Your confirmation is already saved. Only a supervisor can correct it.', 409);
    }
    if ((incoming ? h.receivedAt : h.outgoingConfirmedAt)) throw new ApiError('ALREADY_CONFIRMED', 'This side has already been confirmed.', 409);
    const scheduled = Date.parse(handoverInstant(h.scheduledAt));
    if (Date.parse(timestamp) < scheduled - 15 * 60000) throw new ApiError('TOO_EARLY', 'Handover confirmation opens 15 minutes before the shift change.', 422);
    if (incoming && Date.parse(timestamp) >= scheduled + 12 * 3600000) throw new ApiError('SHIFT_ENDED', 'This shift has ended. Ask a supervisor to review the record.', 422);
    const previous = h.status;
    if (incoming) { h.receivedAt = timestamp; h.incomingNotes = input.notes.trim(); h.incomingConfirmation = confirmation; if (selfReason) { h.selfConfirmationReason = selfReason; h.selfConfirmation = confirmation; } }
    else { h.outgoingConfirmedAt = timestamp; h.outgoingNotes = input.notes.trim(); h.outgoingConfirmation = confirmation; }
    h.attendanceTracked = true; h.revision = (h.revision ?? 0) + 1;
    if (input.equipmentIssue.trim()) {
      h.equipmentIssue = [h.equipmentIssue, `${actor.name}: ${input.equipmentIssue.trim()}`].filter(Boolean).join(' · ');
      if (!h.incidentId) {
        h.incidentId = db.seq.inc();
        db.incidents.unshift({ id: h.incidentId, assetId: h.assetId, workstationId: h.workstationId, platformCode: h.platformCode, dept: h.dept, severity: 'LOW', status: 'OPEN', category: 'Handover equipment issue', title: `Handover equipment issue · ${h.assetId}`, description: h.equipmentIssue, reportedById: actor.userId, reportedByName: actor.name, createdAt: timestamp, updatedAt: timestamp, handoverId: h.id });
        const laptop = db.laptops.find(l => l.assetId === h.assetId); if (laptop) { laptop.openIncidentId = h.incidentId; laptop.status = 'INCIDENT'; }
        db.notifications.unshift({ id: db.seq.ntf(), type: 'LAPTOP_INCIDENT', title: 'Handover equipment issue', body: `${h.assetId}: ${input.equipmentIssue.trim()}`, createdAt: timestamp, read: false, emailStatus: 'NOT_SENT', link: '/incidents', recipientRoles: ['SUPERVISOR'], recipientId: null });
      } else { const incident = db.incidents.find(i => i.id === h.incidentId); if (incident) { incident.description = h.equipmentIssue; incident.updatedAt = timestamp; } }
    }
    updateCustody(h);
    recordAudit(h, selfReason ? 'ATTENDANCE_SELF_CONFIRMED' : 'HANDOVER_CONFIRMED', (selfReason ?? input.notes.trim()) || 'Shift transfer confirmation', previous, `${h.status} · ${input.direction} · ${timestamp}`);
    return h;
  }),
  getDailyHandoverAttendance: (date: string, filter: { platform?: string; dept?: string; status?: string; search?: string } = {}) => respond(() => {
    requireRole('SUPERVISOR');
    return dailyAttendanceRows(date).filter(r => (!filter.platform || r.platformCode === filter.platform) && (!filter.dept || r.dept === filter.dept) && (!filter.status || r.status === filter.status) && (!filter.search || `${r.workerId} ${r.workerName} ${r.assetId}`.toLowerCase().includes(filter.search.toLowerCase())));
  }),
  getAttendanceHandover: (id: string) => respond(() => { requireRole('SUPERVISOR'); return findHandover(id); }),
  getHandoverCorrectionOptions: (id: string) => respond(() => {
    requireRole('SUPERVISOR'); const h = findHandover(id);
    return { laptops: db.laptops.filter(l => l.platformCode === h.platformCode && l.dept === h.dept && l.workstationId && l.status !== 'RETIRED'), people: [...db.employees.filter(e => e.platformCode === h.platformCode && e.dept === h.dept && e.status === 'ACTIVE').map(e => ({ id: e.id, name: e.name })), ...db.freelancers.filter(f => f.dept === h.dept && f.status === 'ACTIVE' && (f.compatibleCategories.includes(db.platforms.find(p => p.code === h.platformCode)?.categoryCode ?? '') || db.replacements.some(r => r.freelancerId === f.id && r.platformCode === h.platformCode))).map(f => ({ id: f.id, name: f.name }))] };
  }),
  correctAttendanceHandover: (id: string, input: HandoverCorrectionInput) => respond(() => {
    const actor = requireRole('SUPERVISOR'); const h = findHandover(id);
    if (!input.reason.trim() || input.reason.trim().length < 5) throw new ApiError('VALIDATION', 'A correction reason of at least 5 characters is required.', 422);
    if (input.expectedRevision !== (h.revision ?? 0)) throw new ApiError('CONCURRENCY_CONFLICT', 'This handover changed. Reload it before correcting.', 409);
    const laptop = db.laptops.find(l => l.assetId === input.assetId && l.platformCode === h.platformCode && l.dept === h.dept && l.workstationId && l.status !== 'RETIRED');
    const incoming = worker(input.incomingId); const outgoing = input.outgoingId ? worker(input.outgoingId) : null;
    if (!laptop || !incoming || incoming.dept !== h.dept || (input.outgoingId && (!outgoing || outgoing.dept !== h.dept)) || input.incomingId === input.outgoingId) throw new ApiError('VALIDATION', 'Choose a valid laptop and distinct workers in this department.', 422);
    const eligible = (id: string) => db.employees.some(e => e.id === id && e.platformCode === h.platformCode && e.status === 'ACTIVE') || db.freelancers.some(f => f.id === id && f.status === 'ACTIVE' && (f.compatibleCategories.includes(db.platforms.find(p => p.code === h.platformCode)?.categoryCode ?? '') || db.replacements.some(r => r.freelancerId === f.id && r.platformCode === h.platformCode)));
    if (!eligible(input.incomingId) || (input.outgoingId && !eligible(input.outgoingId))) throw new ApiError('VALIDATION', 'Workers must be eligible for this platform.', 422);
    if (db.handovers.some(other => other.id !== h.id && Date.parse(handoverInstant(other.scheduledAt)) === Date.parse(handoverInstant(h.scheduledAt)) && (other.assetId === input.assetId || other.incomingId === input.incomingId))) throw new ApiError('ASSIGNMENT_CONFLICT', 'That laptop or incoming worker has another transfer at this shift boundary. Resolve its allocation first.', 409);
    // Corrections amend existing evidence; they cannot invent or remove somebody's confirmation.
    if (!!input.receivedAt !== !!h.receivedAt || !!input.outgoingConfirmedAt !== !!h.outgoingConfirmedAt) throw new ApiError('VALIDATION', 'Corrections cannot add or remove confirmations.', 422);
    const receivedAt = input.receivedAt ? validateTimestamp(input.receivedAt) : null;
    const outgoingConfirmedAt = input.outgoingConfirmedAt ? validateTimestamp(input.outgoingConfirmedAt) : null;
    const opens = Date.parse(handoverInstant(h.scheduledAt)) - 15 * 60000;
    if ((receivedAt && (Date.parse(receivedAt) < opens || Date.parse(receivedAt) >= opens + (12 * 60 + 15) * 60000)) || (outgoingConfirmedAt && Date.parse(outgoingConfirmedAt) < opens)) throw new ApiError('VALIDATION', 'Corrected confirmations must fall within the handover timing rules.', 422);
    const previous = { assetId: h.assetId, incomingId: h.incomingId, outgoingId: h.outgoingId, receivedAt: h.receivedAt, outgoingConfirmedAt: h.outgoingConfirmedAt };
    const next = { assetId: input.assetId, incomingId: input.incomingId, outgoingId: input.outgoingId, receivedAt, outgoingConfirmedAt };
    h.plannedAssetId ??= h.assetId;
    h.corrections = [...h.corrections ?? [], { actorId: actor.userId, actorName: actor.name, at: new Date().toISOString(), reason: input.reason.trim(), previous, next }];
    Object.assign(h, next, { incomingName: incoming.name, outgoingName: outgoing?.name ?? 'No outgoing worker scheduled', workstationId: laptop.workstationId, poolId: laptop.poolId, revision: (h.revision ?? 0) + 1 });
    // Historical corrections affect attendance records, never rewrite present-day physical custody.
    recordAudit(h, 'HANDOVER_CORRECTED', input.reason.trim(), JSON.stringify(previous), JSON.stringify(next));
    return h;
  })
};
