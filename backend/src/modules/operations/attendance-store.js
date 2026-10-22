import { randomUUID } from 'node:crypto';
import { ApiError } from '../../shared/errors.js';

// These helpers run inside the operations transaction/advisory lock. They do not
// decide attendance eligibility, punctuality or confirmation windows.
export async function requireAttendanceSchema(client) {
  const {rows} = await client.query("SELECT to_regclass('attendance_confirmations') AS name");
  if (!rows[0].name) throw new ApiError(503,'MIGRATION_REQUIRED','Apply the attendance database migration before using shift confirmations.');
}

export async function attendanceWorker(client, operationalId, userId) {
  const {rows} = await client.query('SELECT id,worker_number,user_id FROM workers WHERE worker_number=$1',[operationalId]);
  const worker = rows[0];
  if (!worker || (userId && worker.user_id !== userId)) {
    throw new ApiError(409,'STAFF_IDENTITY_REQUIRED','The login must be linked to its registered workforce record. Ask a supervisor to repair the link.');
  }
  return worker;
}

export async function materializeOccurrence(client, worker, work) {
  // An accepted occurrence is an immutable assignment snapshot. An unconfirmed
  // occurrence changes revision only when the resolved source actually changes.
  const {rows} = await client.query(`INSERT INTO work_occurrences
    (id,worker_id,operational_worker_id,worker_name,worker_type,platform_code,department,roster_date,shift,
     scheduled_start,scheduled_end,effective_start,effective_end,source_key,source_version)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    ON CONFLICT(worker_id,roster_date,shift) DO UPDATE SET
      operational_worker_id=excluded.operational_worker_id,worker_name=excluded.worker_name,
      platform_code=excluded.platform_code,department=excluded.department,
      scheduled_start=excluded.scheduled_start,scheduled_end=excluded.scheduled_end,
      effective_start=excluded.effective_start,effective_end=excluded.effective_end,
      source_key=excluded.source_key,source_version=excluded.source_version,
      revision=work_occurrences.revision+1
    WHERE work_occurrences.source_version<>excluded.source_version
      AND NOT EXISTS(SELECT 1 FROM attendance_confirmations c WHERE c.occurrence_id=work_occurrences.id)
    RETURNING *`,[randomUUID(),worker.id,work.workerId,work.workerName,work.workerType,work.platformCode,
    work.department,work.rosterDate,work.shift,work.scheduledStart,work.scheduledEnd,work.effectiveStart,
    work.effectiveEnd,work.sourceKey,work.sourceVersion]);
  return rows[0] ?? (await client.query('SELECT * FROM work_occurrences WHERE worker_id=$1 AND roster_date=$2 AND shift=$3',
    [worker.id,work.rosterDate,work.shift])).rows[0];
}

export const recordSelect = `SELECT c.*,o.worker_id,o.operational_worker_id,o.worker_name,o.worker_type,
  o.platform_code,o.department,o.roster_date::text,o.shift,o.effective_start,o.effective_end,
  u.user_id AS login_id,u.worker_number AS current_staff_number,s.id AS custody_id,s.received_at,s.released_at,s.release_notes,s.revision AS custody_revision
  FROM attendance_confirmations c JOIN work_occurrences o ON o.id=c.occurrence_id
  JOIN workers u ON u.id=o.worker_id
  LEFT JOIN equipment_custody_sessions s ON s.confirmation_id=c.id`;
const iso = value => value == null ? null : new Date(value).toISOString();
export function attendanceRecord(row) {
  return {id:row.id,occurrenceId:row.occurrence_id,workerId:row.login_id ?? row.operational_worker_id,
    staffNumber:row.operational_worker_id,workerName:row.worker_name,workerType:row.worker_type,
    platformCode:row.platform_code,department:row.department,rosterDate:row.roster_date,shift:row.shift,
    effectiveStart:iso(row.effective_start),effectiveEnd:iso(row.effective_end),acceptedAt:iso(row.accepted_at),
    deviceTimestamp:iso(row.device_timestamp),status:row.status,punctuality:row.punctuality,verification:row.verification,
    assetId:row.asset_id,notes:row.notes,equipmentIssue:row.equipment_issue,exceptionReason:row.exception_reason,
    revision:row.revision,custody:row.custody_id ? {id:row.custody_id,receivedAt:iso(row.received_at),
      releasedAt:iso(row.released_at),revision:row.custody_revision,releaseNotes:row.release_notes} : null};
}

export async function readAttendanceRecord(client,id,{history=false}={}) {
  const row = (await client.query(`${recordSelect} WHERE c.id=$1`,[id])).rows[0];
  if (!row) throw new ApiError(404,'NOT_FOUND','Attendance confirmation not found.');
  const result = attendanceRecord(row);
  if (history) {
    result.events = (await client.query('SELECT * FROM attendance_handover_events WHERE confirmation_id=$1 ORDER BY recorded_at,id',[id])).rows
      .map(e=>({id:e.id,kind:e.kind,recordedAt:iso(e.recorded_at),notes:e.notes}));
    result.corrections = (await client.query(`SELECT a.*,u.name AS actor_name FROM attendance_corrections a
      JOIN users u ON u.id=a.actor_user_id WHERE a.confirmation_id=$1 ORDER BY a.recorded_at,a.id`,[id])).rows
      .map(e=>({id:e.id,recordedAt:iso(e.recorded_at),actorName:e.actor_name,reason:e.reason,before:e.before_values,after:e.after_values}));
  }
  return result;
}

export async function recordCustodyReceipt(client,{confirmationId,workerId,assetId,actorId,at,notes=''}) {
  const existing = (await client.query(`SELECT asset_id,worker_id FROM equipment_custody_sessions
    WHERE released_at IS NULL AND (asset_id=$1 OR worker_id=$2)`,[assetId,workerId])).rows;
  if (existing.length) throw new ApiError(409,'CUSTODY_CONFLICT','This laptop or worker already has an open device receipt. Refresh the options or record its physical return.');
  const id = randomUUID();
  await client.query(`INSERT INTO equipment_custody_sessions(id,confirmation_id,worker_id,asset_id,received_at)
    VALUES($1,$2,$3,$4,$5)`,[id,confirmationId,workerId,assetId,at]);
  await client.query(`INSERT INTO attendance_handover_events(id,confirmation_id,custody_id,actor_user_id,kind,recorded_at,notes)
    VALUES($1,$2,$3,$4,'RECEIPT',$5,$6)`,[randomUUID(),confirmationId,id,actorId,at,notes]);
  return id;
}

export async function recordCustodyReturn(client,{custodyId,expectedRevision,actorId,at,notes=''}) {
  const row = (await client.query('SELECT * FROM equipment_custody_sessions WHERE id=$1 FOR UPDATE',[custodyId])).rows[0];
  if (!row) throw new ApiError(404,'NOT_FOUND','Device receipt not found.');
  if (row.released_at) return {alreadyReturned:true,confirmationId:row.confirmation_id,assetId:row.asset_id};
  if (row.revision !== expectedRevision) throw new ApiError(409,'CONCURRENCY_CONFLICT','Device custody changed. Refresh before confirming the return.');
  await client.query(`UPDATE equipment_custody_sessions SET released_at=$2,released_by=$3,
    release_notes=$4,revision=revision+1 WHERE id=$1`,[custodyId,at,actorId,notes]);
  await client.query(`INSERT INTO attendance_handover_events(id,confirmation_id,custody_id,actor_user_id,kind,recorded_at,notes)
    VALUES($1,$2,$3,$4,'RETURN',$5,$6)`,[randomUUID(),row.confirmation_id,custodyId,actorId,at,notes]);
  return {alreadyReturned:false,confirmationId:row.confirmation_id,assetId:row.asset_id};
}
