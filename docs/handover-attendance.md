# Handover and attendance

## Business decisions

The existing handover records are the source of attendance evidence. Both outgoing and incoming workers confirm the same transfer; either can submit first. Until both confirm, incoming attendance is pending. The incoming receipt time determines punctuality, regardless of when the outgoing worker submits. If the outgoing worker is unavailable, incoming workers can self-confirm with a required reason, visibly identified in reports. A reason can also be added to a pending receipt before the shift ends, without editing its original timestamp or confirmation evidence.

Workers submit using their own accounts. **Switch worker** signs out, cancels queries, clears personal caches and remembered email, and opens login. The next worker authenticates and returns to My Workstation. Pending requests from the old identity cannot mutate records after the identity changes.

The device supplies timestamps automatically, with UTC instant and timezone offset. Shift boundaries, display and reports use Asia/Colombo. Morning is 07:30–19:30; night is 19:30–07:30 the next day. Receipt opens 15 minutes before the shift boundary. Exactly 07:45 / 19:45 is on time; subsequent instants are late. Receipt after the shift ends requires supervisor review. These timestamps deliberately follow the device clock; backend receipt time is retained as separate audit evidence.

Laptop and partner details are prefilled from roster/workstation allocations. Workers cannot edit those identifiers. Equipment issues create an incident and supervisor notification but never block attendance; equipment custody/status and attendance status remain separate. Notes are recorded separately for receipt and outgoing transfer.

## Pages and reporting

My Workstation contains Receive shift and Hand over shift panels, a Switch worker button and paginated personal history. The old worker Handover route renders the same workflow. A shift-date selector identifies the shift starting on that day, including a night shift's next-morning outgoing transfer. Missing allocations instruct the worker to contact a supervisor.

Shift Overview presents morning/night attendance columns, date/platform/department/status/search filters, a 30-second refresh and CSV/Excel downloads. Only people with a submitted confirmation appear; it does not infer absent workers from non-submission. Daily grouping uses the event's Colombo calendar date, while retaining the shift's start date and shift identity. A night receipt and next-morning outgoing event appear on separate days. Daily rows only show timestamps actually submitted on the selected day; linked prior receipt evidence can determine attendance status without duplicating that timestamp into another day's report.

Excel is a real OOXML `.xlsx` workbook with Morning and Night worksheets, header filters and frozen headers. CSV includes both shifts, Unicode support and formula-safe text. Both exports reflect the current filters and include worker type, laptop, partners, timestamps, attendance, exception reason, notes, equipment issues, correction indicator and transfer IDs.

Supervisors can review and correct a transfer's laptop, partners and existing confirmation times, with a required reason. Original actor/device evidence stays immutable; every correction stores previous/new values, supervisor identity and audit time. Revisions reject stale edits. Corrections cannot invent or delete confirmations and do not rewrite current physical laptop custody when changing historical records.

## API and backend integration

Shared contracts: `src/types/attendance.ts`. UI uses only the `api` facade. New methods:

| Method | Suggested endpoint |
| --- | --- |
| getMyWorkstationHandovers(date, page) | GET /my/workstation/handovers?shiftDate=&page= |
| submitHandoverConfirmation(id, input) | POST /handovers/:id/confirmations |
| getDailyHandoverAttendance(date, filters) | GET /attendance/handover?eventDate= |
| getAttendanceHandover(id) | GET /attendance/handovers/:id |
| getHandoverCorrectionOptions(id) | GET /attendance/handovers/:id/correction-options |
| correctAttendanceHandover(id, input) | PATCH /attendance/handovers/:id |

Handover additions are optional for legacy compatibility: separate incoming/outgoing confirmation evidence, notes, equipment issue, self-confirmation reason, revision and corrections. Existing timestamps are reused. Old seeded timestamps without an offset are interpreted as Colombo time.

The mock scheduling adapter resolves permanent employees by platform/department/shift/workstation slot, applies approved off-days and assigned freelancer replacements, and materializes planned transfers for real calendar dates. Production scheduling must create these plans from the authoritative roster/allocation, with unique asset/shift-boundary keys. Transfers with no outgoing worker can use the self-confirmation exception; transfers without an incoming allocation require supervisor scheduling.

Production requirements: authenticated account identity (never a client-supplied actor ID), own-record authorization, supervisor-only reports and corrections, atomic confirmations/custody updates, idempotency, unique transfer keys, revision checks, persistent original evidence and transactional correction logs. Device timestamps remain the agreed business input. Backend received-at timestamps support audit and clock-error review rather than replacing the agreed device-based punctuality rule. Network failures leave forms intact and must not display success before acceptance.

The current application remains a memory-only mock and resets on reload. Demo login supports active seeded workers using `demo-password`; this enables separate account sign-ins on a shared device but is not production authentication. Real credentials, server-side session invalidation, multi-device synchronization, durable storage and email delivery belong to the production backend integration.

## Verification

Tests cover Colombo shift rollover, exact early/grace boundaries, both confirmation orders, device timestamps, freelancer identities, exception reasons, equipment issues, duplicate submissions, own-record authorization, cross-session pending requests, correction evidence/revisions, calendar-date splitting, CSV formula handling and Excel structure. UI tests cover live clock refresh, shared-device cache/session clearing, receipt-before-outgoing and exception form validation.
