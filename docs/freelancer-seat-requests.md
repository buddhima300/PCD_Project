# Freelancer vacancy requests

The Availability page has a responsive side panel showing open **dated replacement seats** in the freelancer's department for the selected calendar month, within the existing 60-day planning horizon. Each replacement is one seat. Unallocated permanent headcount is not advertised as a dated shift. Supervisors create these openings through the existing replacement workflow (record absence / approved roster leave coverage).

Freelancers mark the shift Available, then request a seat with an optional 500-character message. Requests highlight interest for that vacancy; they do not reserve the seat or change the manager-defined freelancer priority rank. Retries reuse the pending request without duplicate notifications. Pending requests can be withdrawn and reapplied for. Other freelancers' requests, absent employees' identity and private absence reasons are excluded from the freelancer vacancy feed.

The Replacement Center and each replacement detail page display requests for supervisors. Allocate uses the existing assignment workflow, including its roster, availability, workstation and notification updates. Decline notifies the applicant. Normal supervisor assignment/search remains supported; request status also reflects seats filled through those existing actions.

Eligibility uses the shared replacement candidate evaluator plus production/training status and actual schedule overlap checks. Both request and allocation recheck current data. Stale versions, changed vacancy intervals, closed/started shifts and competing allocations are rejected under the operations transaction/advisory lock. A request is not a guaranteed allocation or automatic priority override.

Requests are persisted as `seatRequests` metadata in the existing PostgreSQL `ops_state` JSONB store, with immutable request IDs, vacancy signatures, status and optimistic version. Audit events and private in-app notifications use existing persisted collections. No database migration or email integration is required. Both panels refresh every 15 seconds.

API: `getMySeatVacancies(month)`, `requestVacancySeat(replacementId,{note})`, `withdrawSeatRequest(id,version)`, supervisor-only `listSeatRequests(replacementId?)` and `decideSeatRequest(id,{decision,version})`.

Tests: `backend/tests/seat-requests.test.js` and `src/data/tests/seatRequestsUI.test.tsx`.
