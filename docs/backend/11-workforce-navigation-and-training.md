# Workforce and platform workflow

Supervisor navigation groups staff registration, candidate records, training, production assignment, employee/freelancer directories, breaks, off-days, replacement coverage and conduct under Workforce. Platforms owns platform creation, categories, configuration, device capacity, demand and departments. Workforce also owns the roster, shifts and rotation. Live platform operations sit under Platforms. Equipment owns inventory, pools and incidents.

## Staff lifecycle

1. Register an employee or freelancer and their linked login.
2. Start training from Workforce → Training using a single form: department, platform, person, shift and duration. No position code or named device is selected.
3. Record completed training days in sequence. Future days cannot be completed. Pass the supervisor evaluation only after all required days are complete.
4. Open Workforce → Platform assignments. Select the qualified person, production platform and shift. The backend checks active employment/login, qualification, department and remaining shift capacity in the same serialized transaction as the update.

The production platform may differ from the training platform. Training location stays on the training record; `productionPlatformCode`, `productionShift` and `promotedAt` record the production decision. Identity and login mappings are preserved for both employees and freelancers. Existing qualified production staff keep their memberships.

The old placement wizard is removed. `/placement-queue` redirects to Training. Platform setup points to Workforce instead of duplicating staff assignment forms.

## Retired handovers

Pending handover pages, confirmations, device reservations, counterpart actions, dashboard counters and assignment blockers are removed from active use. Old mutation and dedicated handover endpoints return HTTP 410 `WORKFLOW_RETIRED`. `/handover` and `/handovers` redirect to current feature areas. Historical records remain stored; pending transfer history is excluded from active API responses.

Physical device custody remains distinct from pending transfer paperwork. Before changing membership, a supervisor with `attendance.correct` can verify the physical return of an existing held device from the employee panel. This needs a checked physical-return declaration and reason, records an audit event, and does not require counterpart confirmation.

Migration `006_retire_pending_handovers.sql` cancels unstarted equipment reservations, clears next-user reservations/pending inventory status, and marks existing in-progress training for separate qualification and assignment. It does not delete historical handover or attendance records. Apply with `npm run migrate` from `backend`.
