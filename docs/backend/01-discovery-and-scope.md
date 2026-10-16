# Backend discovery and scope

Date: 2026-10-14. Status: awaiting scope confirmation before architecture design.

Update 2026-10-16: the user instructed implementation using Node.js. This document preserves the original discovery checkpoint. Current implementation decisions, assumptions and remaining delivery work are in [architecture and delivery](02-architecture-and-delivery.md).

## Understanding summary

- Build the backend for the existing PortCity Digital workforce and operations system.
- Use Node.js and PostgreSQL, with a separate root-level `backend/` directory.
- Organize the backend using MVC responsibilities and readable workflow boundaries.
- Replace mock data and browser-held state with shared, durable operational records.
- Design login and access around the existing Supervisor, Employee and Freelancer experiences.
- Cover current workflows, including sensitive approvals and personal records, rather than login alone.
- Review architecture documents and an implementation plan before writing backend application code.

## Evidence reviewed

The root README is still the generated frontend template. No existing `docs/adr/` directory or AGENTS.md was found in the project or inspected ancestor directories.

Primary sources: `src/App.tsx`, `src/types/domain.ts`, `src/types/disciplinary.ts`, `src/data/navigation.ts`, `src/hooks/useSessionStore.ts`, `src/components/layout/RequireRole.tsx`, `src/services/api.ts`, mock core/rules/disciplinary/profile handlers, break contracts and adapter documentation, and existing platform/login/handover/profile documentation.

The frontend uses React, TypeScript, Vite, TanStack Query and Zustand. `src/services/api.ts` imports mock handlers directly. Break management has a separate validating adapter boundary. Session identity is persisted in browser storage and passed to mock authorization. These mechanisms are development behavior, not production authentication or server authorization.

Some operational mocks reset on reload. Break fixtures and profile records use localStorage. There is no verified database, HTTP backend, shared session service, email delivery or durable job processor in the inspected implementation.

## Current workflow inventory

| Workflow | Existing behavior and access evidence | Backend planning concern |
| --- | --- | --- |
| Login and account access | Three role experiences; seeded demo sign-in and browser session | Trusted identity, account lifecycle, session expiry and revocation |
| Recruitment and onboarding | Candidate selection, staff registration, onboarding | Candidate identity versus provisioned account; duplicate email/worker handling |
| Workforce and profiles | Employee/freelancer records; own photo editing; supervisor leave ledger | Account/worker identity mapping, personal field visibility, historical balances |
| Platform setup | Categories, departments, platform creation, capacity, explicit activation | Atomic creation and reservation checks; setup versus operational state |
| Placement and training | Queue, demand, shift seats, evaluations and explicit promotion | Qualification is separate from production assignment; concurrent reservations |
| Scheduling | Roster, shifts, rotation, employee off-days | Authoritative dated assignments, group capacity and historical changes |
| Freelancer availability | Own availability, priority and workload constraints | Worker-owned edits; eligibility and competing assignments |
| Replacements | Planned/emergency search, selection, assignment and confirmation | Eligibility checks and assignment/resource consistency |
| Equipment | Workstation pools, laptops, custody and incidents | Physical assets differ from planned seat capacity |
| Handover and attendance | Incoming/outgoing confirmations, self-confirmation exceptions and corrections | Participant access, immutable evidence, atomic custody changes and revisions |
| Break management | Shared allowance, extra requests, monitoring, policy, review and export | Action grants separate from visibility; durable timers and conflict handling |
| Disciplinary | Case preparation, independent approval, worker response, finding, warning and appeal | Separation of duties, record/state permissions and restricted evidence |
| Notifications | Recipient-specific in-app records and delivery status | Shared delivery, operational events and independent read acknowledgment |
| Reports and audits | Filtered operational reports and exports; audit history | Authorized queries/downloads and durable audit evidence |
| Settings and reference data | Supervisor configuration and dashboard scope | Define which configuration rights supervisors actually receive |

## Existing access boundaries to preserve

`Role` currently contains only `SUPERVISOR`, `EMPLOYEE` and `FREELANCER`. Job titles and employment types are separate concepts. A senior approver demo account remains a Supervisor; the current disciplinary workflow checks the assigned approver and prohibits initiator self-approval.

Employee routes include their own schedule and off-days. Freelancer routes include their own availability and assignments. Both use personal platform/workstation, handover, disciplinary and break views. Supervisors have operational management routes. Notifications and profiles are shared routes with identity-sensitive data.

Break management already distinguishes view, monitor, policy, export and record actions. Fixture account IDs simulate special grants. Those IDs must not become production permission rules. Route visibility alone cannot authorize approval, correction, policy changes or downloads.

The review must settle supervisor operational scope, independent approval eligibility, account/permission administration and ownership checks. A fourth administrator login role is not an existing requirement.

## Business decisions already documented

- Supervisors can create categories and platforms without a separate approval handoff.
- Platforms begin in SETUP and activate explicitly; staffing gaps do not block activation.
- Physical seats are shared between morning/night shifts. Staffing targets are per shift. Training occupies seats but does not satisfy production targets.
- Hardware provisioning is separate from seat planning. Training completion does not automatically activate production assignment.
- Candidate accounts are provisioned with invited status on promotion in the documented platform workflow. Reconcile this with registration before designing account creation.
- Handover confirmations establish attendance evidence. Missing confirmations do not automatically establish absence.
- Asia/Colombo is the business timezone. Morning runs 07:30-19:30; night runs 19:30-07:30 the next day.
- Attendance punctuality uses device-supplied timestamp evidence by existing agreement. Backend receipt timestamps are separate audit evidence. Break duration uses authoritative backend time; do not silently combine these rules.
- Corrections preserve original evidence and require reasons, actor metadata and stale-edit protection.
- Disciplinary approval requires an independent assigned approver. Raw break timing is not itself a confirmed misconduct finding.
- Profile registration details are read-only in the current personal experience. Workers can update their own photo.

## Proposed planning assumptions, not approved requirements

| Area | Working assumption for review |
| --- | --- |
| Product scope | One organization with the existing departments and platforms; no tenant separation or public customer registration |
| User scale | Plan for at least 1,600 workforce records, as cited in the break handover; initially assume 200 simultaneous active users |
| Performance | Paginated interactive reads target p95 below 500 ms on agreed staging load; writes below one second, excluding asynchronous work |
| Security/privacy | Personal, attendance and disciplinary records require server-side identity, least privilege, scoped access and audited sensitive actions |
| Reliability | Operational state survives restarts and multi-device use; no silent success after a failed or uncertain write |
| Recovery | Provisional production targets: at most 15 minutes of data loss and recovery within four hours; validate cost and deployment feasibility |
| Maintenance | One team owns frontend and backend; document local setup, migrations, deployment and operational recovery |
| Scope limits | No payroll, biometric attendance, native mobile app or additional business workflows in the first backend scope |
| Language | TypeScript is a candidate because the existing frontend contracts use it; user selected Node.js but has not selected JavaScript versus TypeScript |
| Delivery | Incremental backend integration preserving frontend workflow contracts, with production mocks disabled |

These are review inputs, not performance promises or approved architecture decisions.

## Unresolved policy and product questions

1. Can every Supervisor manage all departments/platforms, or should management and reports be limited to assigned scope?
2. Who may approve disciplinary cases, edit break policy, export sensitive records and manage accounts? Are these separate grants within Supervisor?
3. Should invitation/account creation happen at registration, promotion, or different milestones for different worker types?
4. What hosting environment, expected concurrency, backup budget and operational owner are available?
5. What are the approved retention periods for disciplinary evidence, attendance, audit records, photos and exports?
6. Existing profile docs leave the informed-absence enforcement period and supervisor off-day period undefined. Historical leave usage must be migrated before balances become authoritative.
7. Should existing profile half-day accrual and provisional monthly allowance rules become production policy without changes?

## Decision log

| Item | Status | Basis |
| --- | --- | --- |
| Node.js and PostgreSQL | User selected | Explicit request |
| Separate `backend/` directory | Created, documentation only | Explicit request |
| MVC organization | User requested; detailed layout pending | Explicit request |
| Three current role experiences | Observed; production grants pending | Domain type, routes and navigation |
| Scope and non-functional assumptions | Pending confirmation | This discovery review |
| Framework, ORM, sessions, schema and module layout | Not decided | Evaluate alternatives after scope confirmation |

## Next review deliverables

After scope confirmation, compare two or three backend approaches. Document a recommended MVC structure, role/action/scope matrix, login lifecycle, PostgreSQL relationships and transaction rules, API contracts, migration strategy and phased implementation plan with acceptance checks. Capture reviewed choices in numbered ADRs.

No backend dependencies, runtime files, database migrations or frontend authentication changes have been introduced. Existing unrelated profile changes were preserved. Runtime tests are not applicable to this documentation-only step.
