# Dashboard attendance and handover confirmation — implementation prompt

Status: draft for review. No application behavior or database records have been changed for this feature.

## Implementation brief

Act as a senior software engineer and technical lead with 20 years of experience in workforce operations, transactional systems, and accessible product design. Design and, after this proposal is reviewed, implement a complete attendance and equipment handover workflow for the existing application.

An employee or freelancer must be able to open their dashboard, confirm attendance and receipt of a department laptop for their actual scheduled shift, and receive a durable confirmation. Supervisors must see the same evidence in a Shift definitions attendance record book and in both staff directories. Implement the frontend, authenticated backend, additive database migrations, reporting projections, and meaningful tests together.

Use this document as a proposed specification. Clearly distinguish confirmed requirements from recommendations awaiting review. Before coding, produce a concise implementation plan, final policy matrix, schema/state-transition design, and affected-file list. Resolve policy decisions that affect evidence, eligibility, custody, or attendance classification before implementing those rules. Continue independent work where possible.

## 1. Current system findings

Inspect these repository-relative files before choosing an implementation:

- Dashboards: `src/pages/dashboard/EmployeeDashboard.tsx` and `FreelancerDashboard.tsx`.
- Supervisor shifts: `src/pages/scheduling/Shifts.tsx`.
- Directories and details: `src/pages/workforce/Employees.tsx`, `Freelancers.tsx`, `EmployeeDetail.tsx`, and `FreelancerDetail.tsx`.
- Equipment context: `src/pages/resources/MyWorkstation.tsx`, `MyPlatform.tsx`, `backend/src/modules/operations/equipment.js`, and the inventory/pool pages.
- Scheduling: `backend/src/modules/operations/roster.js`, replacement operations, and the roster contracts. Reuse the authoritative shift/leave interval resolver instead of creating another clock or eligibility calculation.
- Integration: `src/services/api.ts`, `backend/src/modules/operations/service.js`, `store.js`, `domain-entry.ts`, authentication middleware, and `retired-workflows.js`.
- Existing evidence contracts/helpers: `src/types/attendance.ts`, `src/utils/shiftTime.ts`, `src/services/mock/attendanceHandlers.ts`, and `profileHandlers.ts`.
- Migrations: `004_equipment_allocations.sql`, `006_retire_pending_handovers.sql`, and subsequent migrations.
- Existing attendance, equipment, profile, workforce, HTTP, and browser tests.

The current dashboards have assignment summaries, but no active combined attendance/receipt action. Shift definitions currently shows the morning and night definitions and a roster link; it is not an attendance register. Employee and freelancer directories currently show operational/employment information without a current attendance confirmation projection.

The frontend uses the authenticated HTTP API facade. Operational data is persisted in PostgreSQL through `ops_*` JSONB records, with some relational workflow tables. Legacy domain handlers under `src/services/mock/` also execute in the backend runtime; the directory name does not establish whether a handler is live.

Most importantly, `retired-workflows.js` explicitly blocks the old handover/receipt/return/attendance operations. Its response adapter also removes handover arrays and pending-state indicators. Migration 006 cancelled outstanding old reservations. `MyWorkstation` is currently an informational shared-device page. Historical handover code and documents therefore do not establish an active workflow.

Earlier handover documentation describes two-party confirmation and device-clock attendance. It also contains outdated mock-only persistence statements. Treat it as historical policy context, not as permission to reactivate every old endpoint or as an accurate description of current production behavior. Plan a specific replacement contract and adapter changes; preserve historical evidence and unrelated retired workflows.

## 2. Confirmed user requirements

1. Add a prominent **Confirm handover & attendance** action to employee and freelancer dashboards, according to each person's actual morning/night schedule.
2. Open an accessible modal over a dimmed, blurred backdrop.
3. Show the assigned platform, a department dropdown, laptops belonging to the selected authorized department, relevant laptop/shift timestamps, special notes, and a submit action.
4. Persist confirmation through the backend and database.
5. Extend the supervisor Shift definitions page with a record book of submitted attendance and handover confirmations.
6. Display confirmed attendance details in both the employee and freelancer directories, while retaining their existing workforce-management functions.
7. Keep dashboard, register, directory, equipment, and applicable profile views consistent after submission and across separate user sessions.

## 3. Decisions required during review

| Topic | Recommended approach to review |
| --- | --- |
| What the submission proves | A valid incoming submission records the authenticated person's attendance declaration and laptop receipt. If a second-party verification is required, expose it as a separate handover verification state. Do not silently make confirmed attendance depend on an outgoing person who may be unavailable. Confirm whether attendance is immediate, provisional, or supervisor-approved. |
| Incoming versus outgoing scope | The requested dashboard action is the incoming receipt/start-of-shift action. Include a minimal explicit device-return or outgoing-transfer action so claimed laptops can be used next shift. Review its location and whether outgoing/counterparty confirmation is mandatory. Do not infer a person's confirmation from the next worker's click or from the clock reaching shift end. |
| Department dropdown | Prefill the worker's scheduled department and restrict options to departments authorized by that assignment. A single valid option remains visible as a dropdown with explanatory text. Supporting temporary cross-department work requires a supervisor-authorized assignment; employee selection must not change their registered department. |
| Confirmation window | Proposed default: open 15 minutes before the person's effective work interval starts, permit confirmation until that interval ends, and route later submissions to supervisor review. A late worker must not lose the ability to submit merely because the grace period passed. Define exact inclusive/exclusive boundaries. |
| Timestamp authority | Proposed default: server receipt time is authoritative for attendance/punctuality, with optional device time and timezone offset retained as separate evidence. Historical policy used device time, so this is an explicit policy change requiring review. Never silently substitute one for the other. |
| Punctuality | Proposed default: exactly 15 minutes after the effective start is on time; subsequent instants are late. Approve the actual grace rule before enforcing it. Use the effective start for partial shifts and partial replacement assignments. |
| Equipment problem or no laptop | Recommended: allow an explicit attendance-only exception requiring a reason and supervisor review, while leaving custody unconfirmed. A reported fault must not create a successful laptop receipt or automatically establish absence. Review this exception rather than fabricating a device selection. |
| Eligible worker types | Employees require active employment/login and a valid dated production assignment. Freelancers require a dated production/replacement assignment; availability or category compatibility alone is not an assignment. Confirm how regular assigned freelancers and trainees should participate. Training progression is not attendance evidence. |
| Corrections and retention | Recommended: authorized supervisor corrections require a reason, preserve original evidence, and use revision checks. Define who can void a duplicate/incorrect event, who can access equipment/medical-related notes, and record retention. Avoid inventing an approval hierarchy or retention period. |

Do not mark someone absent simply because they have not clicked. Show **Not submitted** for an expected worker, **Not scheduled** when no eligible occurrence exists, and **Confirmed** only for accepted evidence under the reviewed policy. Keep employment status, attendance, equipment condition, and transfer verification separate.

## 4. Dashboard and modal design

Use the application's current shared theme, components, and typography. Create one shared confirmation component for both dashboards, with role-specific schedule context supplied by the backend.

The dashboard card should show platform, department, role, roster date, shift label, effective time interval, and a clear action/state. Distinguish **Available to confirm**, **Opens at …**, **Not scheduled**, **Awaiting platform assignment**, **Already confirmed**, and **Needs review**. Explain blocked states. After confirmation, show the accepted timestamp and a **View confirmation** action; do not permit another attendance record for that occurrence.

The modal should contain:

- Read-only worker identity, staff reference, assigned platform, shift, roster date, and effective start/end time.
- A labeled authorized-department dropdown and searchable laptop selector scoped to that platform/department.
- Read-only asset ID, serial/model, current custody/availability, and known last receipt/return timestamps where available. Label timestamps precisely; show unknown values as unavailable rather than inventing them. Reveal counterpart details only when the user is authorized to see them.
- A clearly labeled confirmation timestamp preview, identifying server/device meaning. The final receipt timestamp is assigned when the server accepts the request.
- Special notes with a defined length limit, equipment condition/issue input, and a clear receipt/attendance declaration.
- Reviewed exception controls, if approved, with required reason fields.
- A primary submit action, recoverable error feedback, and an explicit accepted result with confirmation reference.

Preserve entered notes and selections after network/validation failures. If a laptop is claimed by someone else while the modal is open, explain the conflict and refresh eligible options without erasing the note. Disable submission while pending; a timeout must not be presented as success. Provide a retry/status-check path for uncertain responses.

Support keyboard focus trapping, Escape/close behavior, focus restoration, labeled controls, readable contrast, screen-reader status announcements, reduced motion, and a mobile sheet layout. Blur is decorative and must not reduce text legibility. Avoid showing other departments' assets and then rejecting them only at submission.

## 5. Supervisor record book and directory projections

Retain the shift definition cards at `/shifts` and add a **Confirmed attendance & handovers** register with date/range, morning/night, platform, department, employee/freelancer, attendance/verification status, and search filters.

Default to the current Asia/Colombo roster date and make its meaning explicit. Overnight attendance belongs to the date on which its scheduled occurrence started; retain each event's actual calendar date separately. Decide whether an event-date view is also needed rather than mixing both date meanings in one filter.

Rows should include worker/staff reference, worker type, platform, department, roster date, scheduled/effective interval, laptop, accepted timestamp, punctuality, handover verification, notes/issue indicator, and correction/review indicator. A detail drawer shows evidence, custody events, and audit history. Use pagination and server-side filtering. A submitted-record register may default to submissions only; a separate expected-versus-submitted view can show **Not submitted** without creating absence records.

In **both directories**, retain all staff by default. Add a date/shift-scoped attendance badge/summary, accepted time, and laptop/reference with a link to detail. Provide **Confirmed only** and **Not submitted** filters. Do not hide every unconfirmed employee, confuse freelancer availability with attendance, or show yesterday's confirmation as today's. Include history in worker detail views without adding a query for every row.

Refresh the active register and relevant directory projections after a successful mutation; proposed cross-session visibility target is within 15 seconds, using existing infrastructure or focused polling. Background failures should retain the last confirmed data with a stale indicator.

## 6. Backend and scheduling integration

Create typed contracts and a dedicated domain service. The backend must resolve the authenticated login to the stable staff identity and determine eligible dated work occurrences. Client-supplied actor IDs, platform labels, worker type, department, scheduled times, or confirmation status are not authoritative.

Reuse the roster's approved off-day/leave, rotation, half-day, eight-hour shift, replacement, and superseded/amended-request rules. Pending leave does not remove confirmed work. For partial leave, derive the actual remaining working interval; for freelancer coverage, use the assignment's exact interval. A confirmation must refer to a specific occurrence/version, especially when the early window overlaps the previous shift. Do not infer the user's assignment from the global current shift or the first upcoming assignment on a dashboard.

Validate active access, eligibility, department authorization, time window, current assignment version, asset membership and condition, incident restrictions, and custody conflicts inside a transaction. Revalidate at submission even when the context was fetched moments earlier.

Use a database uniqueness constraint for one attendance record per worker/work occurrence and idempotent command handling. Two workers racing for the same laptop must not both acquire custody. An asset must have at most one active custody session, and a worker must not hold incompatible simultaneous claims. Apply the existing operations lock consistently where old inventory JSONB and new relational records interact; document a single lock order. Process boundaries must not weaken concurrency guarantees.

Persist the confirmation, valid custody transition, audit evidence and in-app notification atomically. If equipment is faulty, create/link the incident under the reviewed policy without confusing attendance state with device status. Historical corrections must not silently rewrite current custody.

Keep profile attendance and worked-hours calculations consistent with the new source of truth. A start confirmation proves a check-in, not twelve completed working hours. Do not combine old handover-derived totals and new attendance rows without a documented deduplication/projection rule. Planned leave, training completion, and actual attendance remain separate.

## 7. Proposed database design

Design additive relational tables, with final names and SQL reviewed before implementation. Reuse the inventory's actual device identity rather than introducing duplicate laptops. Use stable SQL worker UUIDs for new foreign keys; operational staff numbers can change from CND to EMP/FL. Verify account/worker mappings and existing SQL rows instead of assuming an operational JSONB ID is a SQL UUID.

| Table / concept | Proposed fields and constraints |
| --- | --- |
| `work_occurrences` or a reviewed equivalent | Stable occurrence ID; worker UUID; employee assignment/replacement source and revision; platform/department snapshot; roster date; shift code; effective `starts_at`/`ends_at` as `timestamptz`; lifecycle/version. Define how occurrences are materialized and amended so refreshing a page cannot create another identity for the same scheduled work. |
| `attendance_confirmations` | UUID; unique occurrence/worker key; authenticated actor user UUID; worker and assignment snapshots; server accepted time; optional untrusted device time/offset; reviewed attendance/verification status and punctuality; notes; version; optional legacy evidence reference. Actor/worker linkage and valid source occurrence must be validated. |
| `equipment_custody_sessions` | UUID; inventory asset FK, e.g. existing `ops_laptops.id`; worker UUID; occurrence/confirmation FK; received/released times; state/version. Partial unique indexes enforce at most one open session per asset and the reviewed per-worker custody limit. A repeated receipt/device switch must not create another attendance record. |
| `handover_events` | UUID; custody/transfer reference; event type such as receipt, outgoing declaration or return; actual actor; server/device times; condition/issue link; notes. Model the counterpart/transfer association explicitly if dual verification is approved. Receipt and outgoing events can legitimately have different dates and actors. |
| `attendance_corrections` | Immutable correction ID; confirmation/event reference; actor; reason; server time; expected/prior version; original and corrected values. Preserve originals; record void/replacement semantics explicitly. |
| `command_idempotency` or equivalent | Actor, operation, request key, payload digest and accepted result reference. Same-key/same-payload retry returns the original result; a changed payload conflicts. Apply retention under the reviewed policy. |

Use real `date`/`timestamptz` types, `NOT NULL`, foreign keys, valid-state checks, start-before-end checks, and indexes supporting date/platform/department/shift registers and worker histories. Avoid hard deletion of referenced staff/assets; preserve historical snapshots when names, platforms, departments or staff numbers change.

Do not copy every old handover into confirmed attendance. Old records can be incomplete, equipment-only, or lack valid counterpart evidence. Document which are legacy history only and any reviewed backfill/deduplication rule. Migration 006's cancelled reservations must not be automatically reinstated. Provide migration, reconciliation, rollback and backup guidance without resetting operational data.

## 8. Suggested API responsibilities

Fit the existing facade and cookie/Origin/CSRF conventions. These names are proposals; do not expose parallel sources of truth.

| Operation | Responsibility |
| --- | --- |
| `getMyAttendanceContext` | Server time, eligible occurrence(s), effective intervals, authorized departments, confirmation/exception state and reasons. |
| `getMyHandoverDevices` | Eligible assets and evidence timestamps for an authorized occurrence/department. Recheck context version and scope. |
| `confirmMyAttendanceHandover` | Idempotent incoming attendance/receipt command using occurrence ID/version, selected asset, notes, declaration and optional device evidence. |
| `getMyAttendanceConfirmation` | Owner-readable accepted result/history for recovery after an uncertain response. |
| `releaseMyShiftDevice` / reviewed outgoing operation | Explicit end/transfer transition, with its own eligibility/time rules and immutable actor evidence. |
| `listShiftAttendance` / `getShiftAttendanceDetail` | Supervisor-only paginated register and evidence detail. |
| `correctShiftAttendance` | Permission-checked, reasoned, versioned corrections with preserved evidence. |
| Directory projection changes | Join/batch attendance summaries for list queries using the same date/shift filters and statuses. |

Review `retired-workflows.js`, its response sanitizer, API allowlists, permission grants, SQL projections and runtime adapters explicitly. New results must survive those layers. Keep unrelated retired routes unavailable. Return structured ownership, eligibility, timing, stale-version, device-conflict and validation errors with useful user messages.

## 9. Acceptance criteria and verification

1. A scheduled employee and an assigned freelancer can confirm their own correct shift; off-day/full-leave, cancelled coverage, unassigned, inactive and unauthorized cases behave under the reviewed policy.
2. Morning, overnight, early-window, exact grace boundary, month/year rollover and partial-shift cases resolve the correct occurrence in Asia/Colombo. The same night shift is not duplicated at midnight.
3. The department selector and devices are correctly scoped. Tampering with identity, department, platform, asset or schedule is rejected by the server.
4. Repeated clicks, lost responses and same-key retries create one accepted attendance record. Different payloads with the same key conflict.
5. Competing workers cannot claim one device concurrently. Return/transfer releases custody correctly; another device receipt in the same occurrence does not duplicate attendance.
6. Missing or damaged equipment follows the reviewed exception/incident path without fabricating a completed handover or an absence.
7. Accepted evidence appears consistently in the dashboard, supervisor register, both directories and applicable profile views after reload, another session and backend restart.
8. Register/directory date and shift filters agree. Unconfirmed workers remain visible by default, with a truthful status. Sorting/filtering/pagination do not cause N+1 queries or incorrect totals.
9. Assignment/leave changes between opening and submitting the modal produce a safe, actionable conflict; no wrong-platform custody or attendance is committed.
10. Corrections preserve original evidence, reject stale edits, identify the correcting supervisor and do not rewrite current physical custody as a side effect.
11. Attendance hours are not fabricated from planned shifts or inflated by repeated receipts, historical imports, device switches or training progression.
12. Modal and register flows work by keyboard and at mobile/tablet/desktop widths, including recoverable errors, loading/empty/stale states and reduced-motion preferences.
13. Existing roster, leave, training, assignment, directory, equipment inventory and authentication workflows retain their intended behavior. Only explicitly reviewed handover functionality is introduced.

Use meaningful domain/time-boundary and PostgreSQL concurrency tests, real HTTP ownership/permission/CSRF/persistence tests, and a focused browser journey from worker dashboard through supervisor register and directory detail. Use isolated test data. Run the appropriate build, typecheck, lint and regression checks, reporting pre-existing failures separately.

Proposed non-functional baseline: several hundred staff across dozens of platforms, reflecting the documented dataset; verify actual scale. Aim for scoped context/register requests within two seconds in the agreed environment, measure concurrent shift-boundary submissions, paginate histories and avoid unbounded payloads. Keep private notes owner/authorized-supervisor only, sanitize rendered/exported content, use existing session security, and document policy ownership and operational reconciliation.

Deliver the reviewed decisions, interaction design, occurrence/state model, migrations and integration code, both dashboard flows, supervisor register, directory/detail projections, test evidence, and an operations/rollback guide. Keep payroll redesign, biometrics, geolocation tracking, arbitrary department transfers and a general equipment-booking system outside this request unless separately approved.
