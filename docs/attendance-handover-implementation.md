# Attendance and handover implementation

## Plan and affected areas

1. Add migration 009 with relational work occurrences, confirmations, custody sessions, handover events, correction history and idempotency results. Historical handover/allocation data stays separate.
2. Add an attendance scheduling adapter over the existing roster projection and explicit freelancer production/replacement assignments. Persist stable worker UUID references and a source/version fingerprint.
3. Add dedicated authenticated operations inside the existing advisory-lock transaction, avoiding the retired legacy handover sanitizer. Integrate inventory custody, supervisor release, directory summaries and profile attendance without fabricating completed hours.
4. Add a shared dashboard card/modal and return action; extend Shifts with the record book and both directories/details with attendance projections.
5. Verify boundaries, ownership, conflicts, retries, persistence and the worker-to-supervisor browser journey with isolated data.

Affected areas: `backend/migrations/009_attendance_confirmations.sql`; new attendance domain/schedule modules under operations; operations dispatch and equipment-release reconciliation; typed attendance API contracts; shared dashboard and register components; employee/freelancer dashboards, directories and detail pages; Shifts; profile projection; and dedicated backend/UI/browser tests.

## Policy review

Confirmed by the user: valid incoming attendance and laptop receipt are accepted immediately, with a separate explicit return action. Attendance does not wait for an outgoing person's confirmation.

Confirmed by the user: device time is authoritative for attendance and punctuality. The server retains an independent immutable receipt timestamp. Updated policy: confirmation is always available for eligible unconfirmed scheduled occurrences, with no early-submission restriction on either server or device time. Exactly 15 minutes after effective start is on time. Device timestamps after effective end require review. Device time is self-declared evidence, not a verified hardware clock.

Confirmed by the user: attendance-only equipment exceptions are permitted with a reason of at least five characters. They enter `NEEDS_REVIEW` and never claim a laptop. Equipment faults must use this exception path. Production employees and explicitly assigned regular/replacement freelancers are eligible; trainees are excluded.

Eligibility uses production assignments only. The department is restricted to the scheduled department. Regular freelancers require an explicit production shift; replacement workers use their exact dated interval. Incomplete or missing schedule/identity data yields an actionable blocked state. No attendance is inferred from training advancement or non-submission.

Corrections/review use the existing `attendance.correct` permission. Original timestamps/evidence remain immutable. Current custody is changed only by explicit receipt/return/verified-return commands, never by editing a historical attendance timestamp. Records are retained without an automatic deletion policy; retention changes require an explicit policy decision.

## State model

An expected occurrence is `NOT_SUBMITTED`; no absence row is fabricated. Accepted attendance is either `CONFIRMED` or `NEEDS_REVIEW`. Supervisor review can confirm or void the record, with revision checks and correction history. Custody independently progresses from no claim to received to explicitly returned. Return closes custody and records actual release evidence; a check-in alone never earns a full shift of worked hours.

Occurrence identity is unique by stable worker UUID, roster date and shift. Meaningful source changes update an unconfirmed occurrence's revision. Once confirmed, its original assignment snapshot remains historical evidence. Submission rechecks the live source, eligibility and version.

## Operations and reconciliation

- Apply additive migrations with `cd backend` then `npm run migrate`. Migration 009 references existing stable workers, login users and inventory records. No historical handover is backfilled or reactivated.
- Worker dashboards show yesterday/today/tomorrow occurrences so overnight and late submissions remain available. Select the occurrence by its roster start date. Confirm actual physical receipt and use **Return laptop** after physical return. Equipment exceptions are reviewed under **Shift definitions → Confirmed attendance & handovers**.
- Both directories retain all staff by default and offer date/shift-scoped confirmed/not-submitted/review filters. Filtering happens before pagination; summaries are batched. Registers and directories poll every 15 seconds and retain cached data with an error indicator when refresh fails.
- Supervisors with `attendance.correct` can confirm/void with a reason and expected revision. Original clocks and assignment evidence stay immutable; reviews append before/after history. A void does not return a laptop. Existing employee physical-return verification closes the relational custody session as well as inventory custody.
- A new check-in counts presence, with zero recorded working hours until physical return. Closed-session hours are bounded by the effective interval and authoritative device attendance time. Original legacy attendance retains its existing calculation, deduplicated against new occurrence evidence. Attendance-only exceptions have no inferred working hours.
- There is no automatic absence inference, cross-department selection, outgoing-person dependency, payroll recalculation or automatic evidence deletion. A clock discrepancy is visible through the separate timestamps and can be reviewed/voided with a reason. Reinstating a void is a new audited review, not a new receipt.

Before deployment, take the normal database backup. Verify existing operational/login/SQL worker links and resolve old physical custody explicitly; no import or reset is needed. The development fixture reset utility now backs up and clears dependent attendance tables in dependency order only when its existing explicit reset mode is invoked.

Rollback: first return/reconcile open devices through the active workflow, retain the database backup and evidence tables, then revert the application changes. Do not drop attendance tables or edit applied migration checksums. A destructive schema rollback or evidence retention change needs a separate reviewed migration. Keep the previous application unable to create retired handovers.

## Validation

Backend: `cd backend` then `npm test`. Focused scheduling/persistence: `node --test backend/tests/attendance-schedule.test.js backend/tests/shift-attendance.test.js`.

Frontend: `npx vitest run src/data/tests/shiftAttendanceUI.test.tsx`; authenticated browser journey: `node backend/tests/shift-attendance-frontend.e2e.js`. The browser uses isolated PGlite records, real cookie/CSRF HTTP operations and separate supervisor/worker sessions; screenshots are saved under `test-results/shift-attendance/`.

Production: `npm run build`. The repository's strict `npm run typecheck` has pre-existing unused-import diagnostics across unrelated files; `npx tsc --noEmit --noUnusedLocals false --noUnusedParameters false` verifies the type contracts without those existing lint-style failures.
