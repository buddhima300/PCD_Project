# Roster and leave management — implementation prompt for review

Status: proposed scope for review; implementation has not started.

## Prompt

Act as a senior software engineer and product-minded technical lead with 20 years of experience building workforce scheduling systems. Design and implement the following feature in this repository after the policy decisions below have been reviewed. Deliver a complete workflow across employee requests, supervisor visibility, backend validation, PostgreSQL persistence, and replacement coverage.

First inspect the current code and applicable repository instructions. Present a concise implementation plan and policy decision log before changing application behavior. Resolve blocking business-policy questions before implementing the affected rules; progress on independent work where possible. Treat recommendations in this prompt as proposals, not existing business policy.

### 1. Outcome and scope

Replace the supervisor's dense employee-by-date monthly roster as the primary experience with an interactive coverage workspace. Give employees a calendar and request form for monthly off-days, casual leave, half-days, one eight-hour shift per month, informed absences, annual leave, and medical leave. Requests and decisions must appear consistently in both users' views.

Preserve existing platform, department, shift, attendance, replacement, notification, profile, and equipment workflows. Freelancers participate through availability and replacement assignments; extending permanent-employee leave entitlements to freelancers requires an explicit policy decision.

### 2. Existing implementation to build on

Inspect at least these repository-relative paths:

- `src/pages/scheduling/Roster.tsx`, `MySchedule.tsx`, `MyOffDays.tsx`, and `OffDays.tsx`.
- `src/components/roster/` and `src/components/offday/`.
- `src/services/api.ts`, `src/types/domain.ts`, and scheduling/profile/replacement handlers under `src/services/mock/`.
- `backend/src/modules/operations/service.js`, `runtime.js`, `domain-entry.ts`, and `store.js`.
- Existing backend migrations, scheduling tests, profile tests, authentication tests, and real HTTP browser tests.
- `docs/backend/06-original-workflows.md`, `docs/user-profiles.md`, and scheduling navigation documentation.

The frontend API facade already calls authenticated backend operations. Legacy handlers under `mock/` also participate in the server domain runtime; their directory name alone does not mean they are browser-only. Follow the execution and persistence paths before choosing where to add behavior.

Existing off-days already support automatic approval below a limit of two approved employees per platform, department, and date, a monthly allowance, cancellation, and supervisor exceptions. Extend these workflows instead of creating a competing system. The current backend serializes domain load/validate/save operations with a transaction advisory lock; retain equivalent correctness for new operations.

Replace sample behavior in the affected scheduling flow: fixed September/October 2026 navigation limits, hardcoded date-based rotation presentation, and leave inferred from a broad `ON_LEAVE` date window. Use actual dated schedules, rotation records, approved requests, and authoritative server time. Existing profile documentation includes older persistence caveats; verify current behavior against code.

### 3. Policy decisions required for review

Record a decision, rationale, and affected workflows for each item:

1. **Off-days first:** does completion mean all monthly entitled days are approved, at least one is approved, or the employee explicitly finishes planning? Recommended: an explicit monthly off-day planning step, showing remaining entitlement and whether the plan is complete. Confirm whether finishing with unused entitlement is allowed. Ordinary leave requests unlock only under the chosen definition, enforced by the server. Recommend an exception path for urgent medical leave and emergencies, and support employees joining mid-month. Define what happens when an off-day is cancelled after planning is complete; do not silently invalidate existing approved leave.
2. **Other leave approval:** automatic approval is confirmed for eligible off-days only. Recommended: other leave and eight-hour shift requests require supervisor review until type-specific automatic approval rules are agreed. Define reviewer permissions, rejection reasons, cancellation, amendments, and any exceptional approval path.
3. **Entitlements:** confirm the monthly off-day allowance and any proration; current scheduling uses four. Confirm annual and medical leave allocation, accrual, carryover, evidence requirements, and booking windows. Do not invent balances. Unconfigured entitlements must be clearly unavailable for approval rather than treated as unlimited.
4. **Half-days and casual leave:** existing behavior accrues one half-day per month, converts two half-days into one casual day, and carries unused entitlement forward. Reconcile this with the new maximum of one half-day request per month. Keep accrual balance and monthly usage limits distinct. Define whether pending requests reserve balance and how cancellations restore it.
5. **Eight-hour shift:** interpret this as a reduced working shift, with a maximum of one approved occurrence per calendar month, rather than a full day of leave. Confirm its start/end selection, pay/allowance effects, and whether it is independent of the half-day allowance.
6. **Informed absence:** recommended eligibility is submission at least 48 elapsed hours before the scheduled shift starts, including overnight shifts. Exactly 48 hours qualifies. A later submission must be explained and routed under an agreed late/emergency policy. Never automatically create an uninformed attendance absence from a late request. Existing profiles show a maximum of four informed absences without a defined enforcement period; resolve that period before enforcing it.
7. **Capacity and coverage:** the two-person limit applies to off-days in the same platform and department on the same roster date, across both shifts. Other leave types do not consume that quota unless explicitly decided, but must affect staffing coverage. Existing supervisor override functionality can exceed the limit; confirm whether to retain an audited exception or enforce the new limit absolutely. Do not silently preserve a bypass.
8. **Freelancers:** recommended scope is calendar-based availability and existing replacement assignments, without employee leave balances. Define handling of withdrawal after a shift has already been assigned.

### 4. Supervisor experience

Recommended primary layout: a coverage calendar with a selected-day staffing panel and a requests inbox. A compact weekly staff timeline can support individual comparison. Keep existing useful daily/platform/department navigation and compatible URL filters.

- Provide month navigation, Today, employee search, platform, department, shift, request type/status, and coverage filters.
- Each calendar date shows readable counts for scheduled staff, off-days, approved leave, pending requests, and uncovered shifts or hours. Explain count units and filter scope.
- Selecting a date opens an employee list grouped by platform and department, with scheduled hours, off-day/leave type, approval state, and replacement status.
- Expose pending requests with approve/reject actions, validation results, and decision history. Show automatically approved off-days immediately.
- Offer replacement actions through the existing eligible-freelancer workflow. Track missing coverage for full and partial shifts without double-booking a replacement.
- Keep an employee's leave reason visible to authorized supervisors even after a replacement covers the shift. Coverage and absence are separate facts.
- Show loading, empty, failed, stale, and conflict states. Use text and icons alongside color. Never present synthetic sample data as live operational records.

### 5. Employee experience

Build a cohesive “My roster & leave” workspace, reusing or redirecting existing schedule/off-day entry points so bookmarks remain useful.

- Provide a monthly calendar and mobile agenda showing assigned shifts, approved off-days, leave, reduced shifts, and pending requests.
- Show off-day planning progress, leave balances, half-day monthly usage, and eight-hour shift usage. Distinguish pending reservations from approved consumption.
- Clicking a date opens a side panel or bottom sheet with eligible request types, dates, relevant scheduled shift, reason, and type-specific fields. Half-days require the absent interval; eight-hour requests show the resulting working interval.
- For off-days, show anonymous department/platform capacity such as “1 of 2 slots used,” then confirm the authoritative result on submission. When full, explain the conflict and suggest valid alternative dates without moving the request automatically.
- Support a reviewed multi-date submission for monthly off-day planning. Explicitly show whether each date was approved or rejected; do not hide partial outcomes. Make retries safe.
- For other requests, show eligibility, entitlement impact, notice requirements, and approval expectations before submission. Enforce the agreed off-days-first rule and provide an actionable explanation when blocked.
- Provide request history, decision reasons, cancellation/amendment rules, and notifications linked to the relevant request. Preserve form input after recoverable errors.
- Keep medical reasons and documents private; coworkers see only aggregated availability where needed.

Use the application's established components and visual language. Aim for clear hierarchy, generous spacing, concise labels, useful feedback, keyboard navigation, visible focus, accessible dialogs, and restrained motion honoring reduced-motion preferences.

### 6. Backend rules and data integrity

- Make the server authoritative for identity, role permissions, scope, date validation, entitlement, monthly limits, off-day planning, notice periods, and request transitions. Never trust employee/platform identity supplied by the browser.
- Model request type, request status, scheduled work interval, actual attendance, and replacement coverage separately. A pending request does not remove approved staffing; an approved future absence is not proof of an actual attendance absence.
- Persist request IDs, employee and effective assignment, roster date/time interval, reason, status, submitted/decided timestamps, decision actor/reason, policy version, audit history, and concurrency version where needed.
- Use `Asia/Colombo` for business dates and month boundaries; store instants consistently. Overnight shifts belong to their scheduled start date. Allocate cross-month requests and entitlement consumption to each affected month correctly.
- Enforce the two-person off-day cap transactionally. Three competing employees for the same empty group/date can result in at most two ordinary approvals. Count each employee/date once, including approved exceptions if exceptions are retained.
- Prevent duplicate submissions and overlapping leave/off-day/reduced-shift intervals. Reserve pending entitlement and monthly usage, if that policy is chosen, so multiple requests cannot overcommit balances. Revalidate at approval.
- Define valid transitions for pending, approved, rejected, cancelled, and amendment states. Use explicit actor/decision metadata to distinguish automatic and manual decisions. Reject stale concurrent decisions safely.
- Keep approved amendments atomic: the previous approval remains effective until the replacement is valid and committed. Release capacity and restore balances exactly once on cancellation. Reconcile affected replacement/equipment allocations and notify impacted users.
- Integrate profile totals and attendance allowance policy without duplicating ledger deductions. Link approved requests to any projected ledger entries and reconcile legacy records without double counting. Do not guess payroll or new leave-type allowance effects.
- Persist request changes and notification records in the same transaction. Use existing notification delivery mechanisms and report actual delivery state accurately.

### 7. Engineering assumptions and delivery constraints

Proposed scale: several hundred employees across dozens of platforms, matching the documented dataset; verify actual deployment scale. Target ordinary scoped month views within two seconds on the agreed test environment, with measurements recorded. Scope queries and paginate or virtualize large detail lists as needed; avoid unbounded payloads and unnecessary per-employee calls.

Reuse React, TypeScript, Tailwind, React Query, Express, and PostgreSQL conventions already present. Add dependencies only with a concrete benefit. Preserve authentication, CSRF protection, and existing role boundaries. Check authorization on every read, decision, cancellation, attachment, and export path.

Employee mutations must refresh affected roster, capacity, request, profile, and balance queries. Proposed cross-session visibility target: within 15 seconds while the supervisor view is active, using existing realtime infrastructure if available or focused polling and refresh-on-focus otherwise. Failed writes must roll back completely; uncertain network retries must not create duplicate approvals.

Use additive migrations and an explicit legacy-data reconciliation strategy. Do not reset existing operational data. Document rollback limits. Keep policy evaluation in a maintainable domain layer with typed contracts and a concise owner-facing policy guide. Medical attachments, if required, need authenticated storage and defined retention/access rules.

### 8. Acceptance and verification

Verify at least:

1. Two employees in the same platform/department/date are approved automatically; a third is rejected, including concurrent submissions. Different departments/platforms remain independent; opposite shifts do not create extra quota.
2. Cancellation releases the correct capacity and balance once; duplicate/retried submissions do not consume extra entitlement.
3. Off-day planning gates ordinary leave under the agreed rule. A rejected date does not count as approved planning, and the agreed urgent medical path works.
4. A second half-day or eight-hour occurrence in the same month is blocked under the agreed reservation policy; approved cross-month requests respect each month's limits.
5. Informed absence behaves correctly at 48 hours, just below it, and across overnight/month boundaries using server time.
6. Pending requests appear in supervisor review without changing confirmed staffing; approval updates the relevant calendar, entitlement, and uncovered intervals. Rejection leaves the working schedule effective.
7. Replacement assignment preserves the original leave type and covers only the required interval without conflicts.
8. Employees cannot read private colleague details or mutate another person's request; unauthorized supervisor decisions fail server-side. Freelancer eligibility follows the reviewed policy.
9. Requests and decisions survive reloads, new sessions, and backend restarts. Concurrent approve/cancel/amend actions have one valid outcome and a complete audit trail.
10. Calendar navigation works beyond the sample months, and scheduled work remains distinct from actual attendance. Existing attendance, profile, equipment, and replacement behavior has no regression.
11. Core flows work by keyboard and at mobile, tablet, and desktop widths, with understandable loading, empty, error, and stale-capacity states.

Use meaningful domain/concurrency tests, real HTTP authorization/persistence tests, and focused browser tests for the employee-to-supervisor workflow. Run the appropriate existing build, typecheck, lint, and regression checks. Report unrelated pre-existing failures separately and never claim unexecuted checks passed.

Deliver the reviewed policy matrix and decision log, interaction design, implementation plan, migrations and API changes, completed role-specific interfaces, test results, and a short operations guide. Keep payroll redesign, unrelated navigation redesign, and speculative scheduling optimization outside this change.
