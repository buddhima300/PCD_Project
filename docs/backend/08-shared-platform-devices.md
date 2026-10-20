# Shared platform devices and employee assignment

Platform department capacity is the number of shared device places, reused independently by morning and night shifts. Staffing targets remain separate. Capacity configuration does not fabricate physical assets. Supervisors register each real device from its pool page; serial and asset IDs are unique and registration cannot exceed the configured count. Maintenance, damaged, retired and incident equipment are excluded from usable devices. Provisioning shortages remain visible even when staffing has been planned.

Employee directory rows open the existing right panel. It retains operational/contact information, adds a monthly off-day balance ring, and exposes Assign for unassigned employees or Change for assigned employees. The same action is available on the full record. Forms retain input on failure and refresh dependent queries after saving. Employment and account statuses have separate filled theme colors.

## Backend workflow contracts

All calls use `POST /api/v1/operations/workflows/{method}` with `{ "args": [...] }`, authenticated cookies, Origin validation and CSRF. Staff identities are derived from the account link. These operations use the existing PostgreSQL transaction and advisory lock; no new schema migration is needed beyond the existing migrations through 004.

| Method | Arguments | Access / result |
| --- | --- | --- |
| getEmployeePlatformOptions | employee ID, MORNING/NIGHT | Supervisor; active same-department platforms with configured/used/free capacity and usable device counts |
| setEmployeePlatform | employee ID, `{platformCode, shift, expectedPlatform, reason}` | Supervisor; saved employee |
| registerPlatformDevice | `{poolId, assetId, serial, model}` | Supervisor; registered shared asset |
| getSharedDevices | none | Employee/freelancer; eligible devices for their current rostered shift |
| receiveSharedDevice | asset ID | Employee/freelancer; pending actual receipt task, without changing custody |
| returnSharedDevice | none | Employee/freelancer; outgoing task for the device currently held |

Assignment checks active accounts/employment, qualification, training conflicts, capacity, pending handovers, actual custody, legacy reservations, upcoming off-days and replacement commitments. Upcoming off-days/replacements must be resolved before moving, so their old-platform capacity and coverage records cannot silently become invalid. `expectedPlatform` rejects stale membership. Saving updates employee/pool/shift, releases the old logical workforce position, fills a destination logical position without an asset, closes/opens platform history, writes an audit record, and adds an in-app notification in one transaction. SQL worker/platform projections are updated in the same transaction.

`getEmployee` returns `offDayBalance: {month, allowance, used, remaining}` from unique approved and override-approved dates in the current Asia/Colombo calendar month. Upcoming approved days in that month consume allowance; rejected/cancelled requests do not. Directory off-day sorting uses that same current balance. Actual held devices come from custody, never workforce slot numbers. Existing records without stored platform history display only their known current assignment.

## Shared-device custody

Staff select an available device in My workstation. Selection creates a receipt task; their existing confirmation form captures timestamp, notes, counterpart confirmation and any equipment issue. No supervisor device reservation is needed. Another worker cannot select an already claimed device. The backend serializes selection, registration and assignment writes.

A worker can switch after completing their pending receipt. Confirming the new receipt returns the previous device to the shared pool and records the switch in audit/history. Additional receipts in the same shift have `equipmentOnly: true`; attendance uses the original receipt and remains one row per worker/shift. Live occupancy counts unique devices.

Return opens 15 minutes before the original shift ends, including after a device switch. The outgoing worker confirms the return. If no incoming worker has selected that device, it returns to the pool; an incoming worker can later select it and retain the outgoing confirmation/notes on the same transfer. Night shift business dates follow Asia/Colombo 07:30/19:30 boundaries.

Historical handovers and allocations are retained. The pool page permits cancellation of old unstarted reservations, but the normal UI no longer creates named reservations. Existing legacy reservation APIs remain for compatibility. Training placement no longer grants physical custody or displays a hard-coded laptop asset; actual training equipment follows the same shared-device receipt flow.

## Verification

`backend/tests/shared-platform.test.js` covers monthly balances, permissions, stale platform checks, capacity rollback, cross-shift reuse, assignment persistence, device registration bounds/duplicates, actual receipt custody, switching, attendance deduplication, return and platform history. `src/data/tests/employeePlatformUI.test.tsx` covers contextual actions, submission, retained input on failure, role visibility and accessible chart values. The real-browser integration script covers the directory panel, balance, assignment/reload persistence and physical device registration with an isolated PostgreSQL-compatible database.
