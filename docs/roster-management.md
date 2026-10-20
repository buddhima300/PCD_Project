# Roster and leave management

## User workflow

Supervisors open **Workforce → Scheduling → Roster**. The default view uses the supplied reference image's fixed employee column, horizontal date axis and contiguous status bars, adapted to the application's existing theme. The alternative monthly calendar opens the same daily staffing panel. Daily, platform and department detail routes remain available. Filters are shareable through URL parameters. Counts are employee-days or missing hours within the selected month and scope, rather than headcounts for today.

Employees open **My Schedule** or **My Off-days**. Both lead to the same roster workspace; My Off-days starts date selection. Employees can submit several off-day dates with an explicit outcome per date. The server approves each eligible date immediately, or rejects it with a capacity reason. No rejected date is silently moved. A failed response can be retried without another approved off-day being created for the same employee/date.

Employees explicitly finish each month's off-day plan, then request other leave through the date panel or **New request**. Unused off-days are allowed. Finishing a plan does not consume the unused allowance or prevent later off-day changes. Cancelling an off-day does not invalidate existing leave. An urgent medical request can bypass planning, but still requires supervisor approval and a configured entitlement.

The calendar, mobile agenda and request history show pending and approved requests separately. A pending request reserves entitlement and monthly usage but leaves the confirmed work schedule intact. Employees can cancel unstarted requests. For approved leave, **Change dates** submits an amendment: the original approval stays effective until a supervisor accepts the change. An accepted amendment supersedes the old request atomically and cancels linked unstarted replacement coverage. A rejected amendment retains the original approval. Pending requests can be cancelled and resubmitted. Off-day changes use cancellation and a new automatically evaluated request.

Supervisor **Requests** supports decisions with mandatory reasons, optimistic concurrency checks and request history. **Leave entitlements** sets verified annual and medical allocations for an employee and year; it does not assume statutory or company allocations. The selected-day panel retains the leave type and reason when a replacement covers an employee. **Find replacement** creates a linked record for the actual absent interval and opens the existing eligible-freelancer workflow. Cancellation returns an assigned freelancer's unstarted slot to Available and notifies them.

Freelancers retain **Availability** and **My assignments**, with no permanent-employee leave balances. Their calendar now materializes any selected month's real dates. Availability can be changed before the shift starts and up to 60 days ahead. Assigned/confirmed shifts must be released by a supervisor first.

## Policy decision log

| Decision | Rule and rationale |
| --- | --- |
| Off-day planning — confirmed by user | Explicit monthly completion, including a plan with unused days. Avoids forcing employees to use their entire allowance before requesting leave. |
| Approval — confirmed by user | Eligible off-days are automatic. Other leave and reduced shifts require supervisor review. Annual/medical approval requires a configured allocation. |
| Off-day capacity | Strictly two distinct approved employees per platform, department and roster date across both shifts. Existing historic overrides remain stored and consume capacity; new reconsiderations cannot exceed the limit. This follows the user's explicit two-employee rule. |
| Off-day allowance | Preserve each employee's configured monthly allowance, falling back to the existing four-day policy. No new proration is inferred. |
| Half-day accrual | Preserve one accrued half-day unit per calendar month since joining, including the joining month, without expiry. Half-day leave consumes one unit; a casual day consumes two. Existing matching ledger entries are deduplicated. |
| Monthly usage | At most one half-day and one eight-hour shift per month. Pending requests reserve these separate limits. A pending amendment to the same request does not count as a second occurrence. |
| Partial shifts | Half-day = first or last six hours of a twelve-hour shift. Eight-hour shift = first or last four hours absent, with eight hours worked. These are independent monthly options. |
| Informed absence | Submission at least 48 elapsed hours before each scheduled shift starts; exactly 48 qualifies. Late submissions are rejected with an explanation, never converted into actual uninformed absence. |
| Annual/medical balances | Explicit verified allocations per employee/year; no invented accrual, carryover, attachment requirement or payroll rule. Requests can await configuration, while approval is blocked. Configured balances reserve pending days. |
| Amendments | Original approval remains effective during review. Reservations account for the larger of original/amended consumption per accrual cutoff or calendar year, rather than charging both. A change must keep the same leave type. |
| Overlaps | One active leave/off-day request per employee/date. Cross-month requests require completed plans in each month. Cross-year balances are checked separately. |
| Absence coverage | Off-days do not automatically create replacement demand, preserving the existing system rule. Approved leave/reduced shifts create missing coverage hours. Actual attendance remains separate. |
| Freelancers | Availability and replacement participation only; permanent-employee entitlements are not extended to them. |
| Unspecified policies | The existing four-informed-absence maximum still has no defined period and is not newly enforced. Annual/medical pay and reduced-shift allowance effects are not guessed. |

## Backend and persistence

`backend/src/modules/operations/roster.js` implements the roster operations. `service.js` dispatches them inside the existing PostgreSQL transaction and advisory lock, with the same session, Origin and CSRF middleware as other operations. Employee identity comes from the authenticated login/worker link. Supervisors use the application's existing role boundary for review and allocation changes. Every mutation, including legacy off-day API calls, validates on the server.

Existing off-days remain in `ops_off_days`. The new versioned roster module contains requests, completed plans and entitlements in the existing `ops_state` JSONB store. It is initialized lazily for older databases; additive migration `008_roster_management.sql` also initializes it safely. All roster changes, audit records, replacement records and in-app notifications commit together. No fixture reset or destructive import is required. Persisted records survive fresh backend domain runtimes, and legacy workflows cannot erase the module.

Business dates use Asia/Colombo; request, decision and interval timestamps are stored as instants. Overnight shifts belong to their scheduled start date. The roster derives shifts from employee assignments and explicit scheduled rotation records, replacing the previous fixed October flip and broad status-based leave window. The backend sets the legacy domain runtime's operational clock to actual server time before executing a workflow; fixture import remains deterministic. Earlier historical shift/assignment details cannot be reconstructed when they were never recorded; the roster uses the available assignment and rotation records.

Profile leave balances use approved request consumption and legacy ledger usage without manufacturing actual attendance records. Casual/informed leave affects the existing provisional attendance allowance calculation. Platform release/change checks block unresolved upcoming leave and coverage. Equipment reservation/handover workflows that the current repository retired remain retired.

Reads use the same monthly projection for the new workspace and existing monthly, daily and platform roster endpoints. React Query invalidates related roster/capacity/balance/profile views after mutation and polls active roster views every 15 seconds for cross-session updates. Background refresh errors keep the last confirmed view and unsaved form values. Notifications are in-app records with email status `NOT_SENT`; SMTP delivery is not invented.

This implementation retains the repository's serialized, whole-state store for its current scale of hundreds of workers and dozens of platforms. Timeline rows are virtualized and request rendering is paginated. A substantially larger deployment should move request/plan records into indexed tables and narrow the transaction lock rather than extending the metadata document indefinitely.

## Operation contracts

All use authenticated `POST /api/v1/operations/workflows/{method}` with `{ "args": [...] }` and the existing CSRF header.

| Method | Arguments |
| --- | --- |
| `getRosterWorkspace` | `{ month, platform?, category?, dept?, shift?, search? }` |
| `completeOffDayPlan` | `month` (authenticated employee only) |
| `requestOffDay` | `employeeId, date` (existing contract) |
| `submitLeaveRequest` | `{ kind, startDate, endDate, reason, portion?, urgent?, idempotencyKey }` |
| `amendLeaveRequest` | `requestId, requestInput, expectedOriginalVersion` |
| `decideLeaveRequest` | `requestId, { decision, reason, expectedVersion }` |
| `cancelLeaveRequest` | `requestId, expectedVersion` |
| `setLeaveEntitlement` | `{ employeeId, year, annual, medical, reason, expectedVersion }` |
| `createRosterReplacement` | `approvedRequestId, date` |

Requests progress through `PENDING → APPROVED/REJECTED/CANCELLED`; unstarted approved requests can be cancelled, or become `SUPERSEDED` when an amendment is approved. Duplicate submission keys return the original request; reuse with different input is rejected. Conflicting decisions fail with a refresh instruction. Cancellation releases balance exactly once. Pending/approved amendments reserve both sets of dates against other bookings until reviewed, while entitlement reserves only the maximum needed.

## Verification and rollout

Verified during implementation: all 46 backend regression tests then present passed; the final focused roster suite passed all 16 tests (including the subsequently added mid-month joining check). All nine frontend HTTP tests passed. The real authenticated browser workflow passed submission, cross-session review, annual entitlement configuration, approved amendments, partial replacement handoff, reload persistence, CSRF/authorization and responsive layouts. The production build passed. Targeted lint had no errors, with existing-style non-null assertion and mixed-export warnings; the relaxed unused-symbol typecheck passed.

- Backend domain and PostgreSQL integration: `cd backend; node --test tests/roster.test.js`.
- Backend regressions: `cd backend; npm test`.
- Real browser, HTTP/authentication and isolated PostgreSQL: `cd backend; node tests/roster-frontend.e2e.js`. Uses local port 5191 and installed Chrome by default; `PCD_TEST_BROWSER` can select another installed channel. Screenshots go to ignored `test-results/roster/`.
- Frontend HTTP contracts: `npm run test:backend`.
- Build: `npm run build`. The existing large-main-chunk warning remains.
- Typecheck: `npx tsc --noEmit --noUnusedLocals false --noUnusedParameters false`; the repository's normal strict command retains unrelated unused-symbol diagnostics.

For an existing deployment, run `npm run migrate` from `backend`, restart/redeploy the backend and frontend together, and configure verified annual/medical entitlements through the supervisor roster. Historical employee off-days, profile ledger entries and overrides remain intact; do not reset data. Before rollback, preserve the roster module: older code cannot project the new leave requests into its screens, although the persisted records remain recoverable. Migrations and browser tests do not reset the developer database.
