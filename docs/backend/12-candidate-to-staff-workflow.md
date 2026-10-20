# Candidate-to-staff workflow

## Comparison and implementation

| Stage | Before | Implemented behavior |
| --- | --- | --- |
| Registration | Allocated EMP/FL immediately and navigated to Training | Creates a CND reference, linked login and onboarding worker, then navigates to Candidates |
| Candidates | Displayed placed candidates and selection actions | Displays registered people awaiting training only; the placement action assigns training |
| Training seats | Capacity was checked on submission | Shared vacancy board shows active production platforms, departments and Morning/Night capacity |
| Training | Retained assigned and failed records in the operational list | Only current trainees and qualified people awaiting assignment remain; history stays stored |
| Evaluation | Pass and fixed two-day extension | Solid green Pass, amber Extend and red Fail buttons; extension duration and reason are required |
| Failure | Recorded failure without a complete return flow | Releases the seat immediately and returns the registered candidate to Candidates with login and failed-attempt history intact |
| Production | Assigned the existing early EMP/FL identifier | Issues the next EMP-xxxxx or FL-xxxxx only when qualified staff are assigned to production |
| Platform assignments | Listed qualified people | Interactive category → platform → department → shift vacancy hierarchy with occupancy rings |

## Identity and persistence

The login UUID, password hash, SQL worker UUID and active sessions remain unchanged throughout the lifecycle. Candidates and trainees use CND business references. On production assignment, the backend allocates a number using `staff_number_counters`, updates the worker number and login mapping, and carries operational history forward in the same serialized PostgreSQL transaction. Candidate references remain explicit on the retained candidate/training records. `staffNumber` and `candidateReference` are display references and are excluded from login-ID translation.

Migration `007_staff_number_counters.sql` creates and seeds the EMP and FL counters from existing SQL and operational records. Existing production staff keep their identifiers. Earlier preallocated EMP/FL records are preserved rather than renumbered.

Employee and freelancer directory layouts and actions are preserved. Their queries exclude people who have not yet qualified for production, and the ID cells display the final business number.

## Capacity and transitions

`getWorkforceVacancies` calculates capacity from configured device counts, assigned production staff and unpromoted training placements. Morning and Night are independent. Training uses existing active production platforms and cannot exceed the same shared shift limit. Passed trainees retain their reserved training seat until production assignment; conversion on the same platform/shift does not require a second seat. A new platform or shift must have space.

All training days must be completed before supervisor review. Supervisors can advance the next training day immediately, even if its planned date is in the future; the row action and progress dialog use the same rule. Duplicate or skipped days and advancement after evaluation/promotion are rejected server-side. Extensions append sequential planned dates and retain the platform/shift. Failures return the person to Candidates and release capacity. Successful assignment removes the person from the active training list and exposes them in the appropriate directory. `listTrainings({history:true})` retains access to prior attempts and completed assignments for supervisor history and audit purposes.

## Missing staff record recovery

Some legacy/sample training records reference staff IDs that were never present in the workforce tables. A completed evaluation alone cannot resolve those IDs. Assignment now follows an existing candidate's explicit `registeredWorkerId` when available, distinguishes missing records from inactive accounts, and preserves all normal qualification/capacity checks.

The assignment dialog checks `getTrainingStaffContext`. For an orphan, it offers an explicit **Link registered staff** action requiring the same department/employment type, an active linked login, no competing training/production placement, confirmation that this is the same person, and a correction reason. `linkTrainingStaff` records the original ID and an audit event without altering completed days or evaluation. It does not infer identity from matching names or create logins/passwords automatically.

If the person is not yet registered, **Register this staff member** opens registration with the known training/candidate details. An authorized account administrator supplies verified details and an initial password. Existing unregistered candidate records are reused rather than rejected as duplicate emails; their reference, original creation date and completed training are retained. Registration returns to Training, where the person can be linked if needed and assigned. Genuine inactive staff/accounts remain blocked until reactivated.

The dedicated lifecycle integration test covers employee and freelancer login before/after conversion, stage visibility, failure/retry, extension, seat release, same-seat conversion, cross-platform assignment, final numbering, preserved history, unauthorized access and competing placement requests for the last vacancy.
