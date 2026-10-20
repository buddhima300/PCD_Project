# Shift equipment allocation

Approved scope: supervisors allocate existing pool hardware to staff assigned to a platform, department, business date and morning/night shift. Reuse the existing pool assignment dialog, platform cards, operations table and worker handover screens. Login, staff registration and permission tables are preserved.

## Decisions

- Store reservations in a dedicated PostgreSQL table. Partial unique indexes protect workers, assets and workstations per date/shift. All mutations use the existing operations transaction and advisory lock.
- Keep reservations separate from physical custody. Morning and night may reserve the same equipment; existing receipt confirmation changes custody. Future reservations create pending handover tasks, never attendance evidence.
- Use Asia/Colombo boundaries (07:30/19:30); after midnight the night shift belongs to the preceding date. Existing historical handovers remain intact. The backend stops automatically inventing new handovers from fixture slot numbers.
- Preserve cancellation records and actor/reason/timestamps. Cancellation after either side starts confirming is rejected. Cancel and reserve again to reassign before handover starts.
- Show production/training separately from equipment live/pending/reserved/free counts. Blue #2563EB, green #15803D, violet #7C3AED, amber #B45309, red #B91C1C, slate #CBD5E1. Counts and text accompany colors.
- Lifecycle remains Setup/Active/Inactive. Shift readiness reports Conflict, Equipment shortage, Needs allocation, Staffing gap, Handover pending, Ready, Operating in priority order. Allocated/capacity stays explicit.
- Existing hardware is the inventory; configuring seats never creates laptops. Existing historical reservations are represented by their original handovers, without fabricating current-day receipts.

## Validation and operational expectations

Supervisor-only APIs remain behind authenticated cookie sessions and CSRF checks. Validate eligible active staff, approved absences, replacements, department/shift membership, usable hardware and capacity within one transaction. SQL uniqueness protects concurrent writes. Preserve historical evidence and do not reset development data. Current screens refresh every 15 seconds; allocation reads should remain below two seconds for the current dataset. Test database constraints, conflict rollback, cross-shift sharing, custody separation, cancellation, permissions, Colombo night dates, persistence and summaries.

Implementation verification: migration 004 applied without resetting operational or authentication tables; production build and TypeScript check passed (existing unused-code checks disabled). Backend suite: 23 passing tests. Existing frontend/domain regressions: 110 passing tests; HTTP transport: 9 passing tests. Real browser integration exercised assignment from the existing pool dialog, staff search, reload persistence, cancellation with a reason, and unchanged custody before receipt, alongside existing registration/login/password and platform setup flows.
