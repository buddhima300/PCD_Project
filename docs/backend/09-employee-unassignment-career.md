# Employee unassignment and career progression

The employee directory panel and full record share contextual actions. Assigned staff have Change, Unassign and Promote; unassigned staff have Assign and Promote. One form opens at a time. Career level appears in both views, with a career history timeline in the full record. Unassigned PIC/TL staff display a responsibility-reassignment notice. Unassignment leaves employment active and the existing account intact.

## Contracts

Use the authenticated, CSRF-protected `POST /api/v1/operations/workflows/{method}` endpoint with `{ "args": [...] }`.

| Method | Arguments | Result |
| --- | --- | --- |
| unassignEmployeePlatform | employee ID, `{expectedPlatform, reason}` | Updated employee |
| getEmployeeCareerOptions | employee ID | Current/next level, career revision, eligibility reason, linked-account/access flags and access blocker |
| promoteEmployee | employee ID, `{expectedLevel, expectedRevision, nextLevel, reason, grantSupervisorAccess}` | `{employee, supervisorAccessGranted}` |

All three operations require a supervisor. Reasons contain 5–1,000 trimmed characters. Career progression is STAFF → PIC → TL → SPV; same-level changes, skipped levels and demotions are rejected. Existing records default to STAFF without rewriting their department or job position. Promotions require active employment/account status and completed qualification/training. A career revision plus expected level rejects stale or repeated promotions. SPV is the highest level.

All mutation checks, operational state, SQL projections, notifications and audits commit within the existing operations transaction/advisory lock. Career level, revision and events persist in employee JSON records; no additional migration is needed. Existing worker identity, password, employment, department and job position are retained.

## Unassignment

The current platform must match `expectedPlatform`. Existing device custody, unfinished handovers, live equipment reservations, active training, upcoming off-days and replacement commitments block removal with a specific error. The form keeps its reason and links to the relevant management page. No history or approved commitments are silently deleted.

On success, close the current platform history interval, release assigned/reserved logical workforce positions, clear platform/category/pool/position membership and current workstation fields, and mark the employee as requiring platform placement. Record the old platform in audit. Platform summaries refresh immediately after the operation. Unassigned employees remain visible in the directory, are excluded from production roster rows, and see an awaiting-assignment notice on their dashboard. Previous shift preferences and career level remain available for the next assignment.

## Career title and login access

PIC/TL are career levels, with employee login access retained. An SPV career-only promotion also preserves employee access and current platform membership. Granting supervisor dashboard access is an explicit checkbox at SPV promotion and additionally requires the actor's `accounts.manage` permission, verified against the database inside the transaction.

New supervisor access requires an active linked employee login and no production platform membership. Unassign first, completing custody/commitments through the normal workflow. This prevents changing a production employee into a login that cannot use the staff handover routes. A failed access validation rolls back the entire promotion and leaves active sessions intact.

When explicitly granted, update the existing user's role/title and the operational account link to SUPERVISOR, preserve the same employee/account IDs and password, revoke that account's sessions and write a separate access audit. The user signs in again to receive supervisor identity. No administrative permissions are automatically added. Career-only promotions do not revoke sessions.

## Shift colors

Employee directory shift badges use the shared `ShiftTag` filled variant: morning blue `#1D4ED8`, night red `#B91C1C`, both with white labels and their existing sun/moon icons. Other uses retain their existing style unless they request the filled variant.

## Verification

`backend/tests/employee-career.test.js` checks unassignment blockers, rollback, position/capacity release, roster exclusion, duplicate/concurrent promotion, level progression, permissions, history persistence, career-only SPV promotion, linked identity, session revocation, re-login and unchanged management grants. UI tests cover forms, retained reasons, blocker links, one-form behavior, promotion/access controls, the history display and filled shift classes. The browser integration test exercises promotion → unassignment → reload → career history and checks rendered foreground/background colors.
