# Increment exam eligibility and appointments

Approved scope: count from employment joining date; confirmed completed working day = 1, approved off-day = 1, half-day leave with confirmed work = 0.5, completed eight-hour shift = 1, absence/full-day leave = 0. Unknown or unresolved days are unverified, not absence. One credit maximum per roster start date, including overnight shifts. No future or ongoing shift earns credit. The threshold is 90 qualifying days. Employment must remain active to appoint an exam.

Use a dedicated calculation rather than the payroll/profile attendance total. SQL attendance evidence and valid historical receipts establish confirmed work. Approved roster leave, off-days and recorded absence/leave override work evidence. Pending leave does not remove confirmed work; provisional attendance does not establish it. Training advancement alone is not attendance. Historical training/work can be reconciled with an opening balance verified by a supervisor with attendance.correct permission.

Manual reported absences recorded by the existing replacement workflow also exclude the date; roster-generated replacement requests retain their approved full/partial leave classification. Off-day completion follows the authoritative scheduled rotation window.

An opening balance covers joining date through a completed roster date, with half-day precision, reason, actor, revision and immutable before/after history. Dates through that boundary are not counted again. Subsequent corrections inside the verified period require an audited balance correction. Joining date changes invalidate incompatible balances.

Add relational migration 010 for stable-worker opening balances, one increment-exam appointment per employee, immutable events and idempotency commands. Calculate eligibility live from persisted evidence; retain the calculation snapshot when scheduling. Recheck identity, active employment/login, credit threshold and revision within the existing serialized transaction. Reschedule/cancel preserves history and sends a new durable private notification. Falling below eligibility later flags the appointment for review rather than silently deleting it. Exam outcomes, salary changes and recurring exam cycles are outside this feature.

Supervisor dashboard: middle section with an employee list and appointment side panel. Default to eligible employees; also expose scheduled appointments, verification-needed employees and all employees for reconciliation. Search, paging, explicit details, and revision-based scheduling. Employee profile: lifetime progress independent of its attendance date filter, counted/excluded/unverified breakdown, verified balance and latest appointment. Profile access is owner or supervisor only.

Notification persistence and appointment writes commit together. Online clients refresh notifications every two seconds through a lightweight SQL reader; offline clients see retained notifications on login. This is near-real-time polling, not a guaranteed push transport. No email is marked sent. Poll eligibility/progress every 15 seconds. Target the current several-hundred-worker dataset; batch evidence reads and avoid queries per employee.

Validation: domain boundary/leave/overnight/deduplication tests, isolated PostgreSQL identity/eligibility/version/idempotency/notification tests, frontend tests and an authenticated browser journey. Apply with `cd backend` then `npm run migrate`. No data reset or automatic historical credit is needed. Preserve evidence tables/backups during application rollback; do not edit applied migration checksums or delete appointment history. Policy changes need an explicit reviewed version; the initial policy is JOINING_90_V1.

## Verification commands

- `cd backend` then `npm test`: full backend suite (77 tests passed).
- `node --test backend/tests/increment-exams.test.js`: threshold, half-day/off-day/leave rules, overnight/rotation boundaries, verified opening balances, historical deduplication, identity changes, permissions, version conflicts, idempotency and notification privacy.
- `npx vitest run src/data/tests/incrementExamsUI.test.tsx`: profile progress/appointment display, scheduling/retry recovery and historical verification form (3 tests passed).
- `node backend/tests/increment-exams-frontend.e2e.js`: isolated database and real authenticated browser sessions; verify balance, appoint/reschedule, notification receipt within 8 seconds, employee profile, reload persistence, ownership and mobile layout. Screenshots: `test-results/increment-exams/`.
- `npm run build`; lint the new increment/notification modules and UI. Type contracts pass with `npx tsc --noEmit --noUnusedLocals false --noUnusedParameters false`; repository strict unused-import diagnostics predate this feature.

Migration 010 was applied to the configured local database. Existing attendance, verified balances, appointments and notifications remain the sources of truth across reloads and server restarts. No fixture reset was performed.
