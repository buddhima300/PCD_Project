# Break Management frontend handover

## Discovery and implementation plan

The inspected application is an existing React 18 / strict TypeScript / Vite 5 WFM prototype, installed with npm and a lockfile. It uses React Router 6, TanStack Query 5, Zustand session persistence, Tailwind, Zod, Sonner, and shared UI components. API calls currently terminate in development handlers under `src/services/mock`; there is no verified HTTP transport, permission refresh endpoint, feature flag platform, export job service, or server break contract. Roles are exactly `SUPERVISOR`, `EMPLOYEE`, and `FREELANCER`. Job titles are not permission grants. Existing workforce IDs, departments, notifications, session store, layouts, and disciplinary routes were inspected and reused.

No repository or ancestor AGENTS.md was found in the inspected project hierarchy. The working tree already contained substantial unrelated and disciplinary changes; these were retained. The before-you-build skill was applied briefly: the supplied operational need and current Telegram workaround are explicit, so implementation proceeded. The principal adoption risk is backend authorization and authoritative state, not missing product demand.

The implementation plan followed discovery, typed foundations, employee workflows, supervisor workflows, policy/report integration, then tests. Shared modifications are additive routes, capability-filtered navigation, dashboard summary, a notification type/filter, and a necessary accessible-dialog focus fix. No attendance, database, server endpoint, authorization engine, mail service, or parallel disciplinary module was introduced.

## Architecture and routes

`BreakManagementPage` orchestrates queries and uses shared Card, Button, Field, PageHeader and Dialog components. `WorkflowDialog` loads fresh records, validates a proposed command, shows a readable preview, reloads permissions and revisions immediately before submission, and awaits API confirmation. `components.tsx` contains allowance/timer/history/audit/status/error presentation. `BreakFilters` holds transient filters. TanStack Query owns server data; local component state owns filters, forms and dialogs. The existing Zustand store owns authenticated identity.

| Route | Existing role gate | Additional returned capability |
| --- | --- | --- |
| `/my/breaks` | Employee or freelancer | `capabilities.view` |
| `/breaks` | Supervisor | `capabilities.view` and `monitor` |
| `/breaks/reports` | Supervisor | Monitoring; export additionally requires `export` |
| `/breaks/policy` | Supervisor | `policy` |
| `/` | Existing dashboard | Break summary appears only with returned access |
| `/notifications` | Existing notification route | Existing recipient-scoped notification API |
| `/disciplinary` | Existing supervisor route | Returned case reference is displayed; no case is manufactured |

Capability properties are **proposed response fields, not invented production permission identifiers**. The integration team must map verified existing backend grants to them. Monitoring visibility does not grant correction, approval, review, policy, or export rights. Record action flags remain separate from module visibility.

Supervisor snapshot/monitor/session queries refresh every 30 seconds, on window focus, manually, and after mutations. Query keys include identity, role and filters; cancellation signals reach snapshot/monitor transport calls. Mutation retries are disabled. Sensitive data is hidden after refresh errors and caches are removed on account changes. Last-confirmed times and offline/stale state are visible. Employee history and operational lists are paginated; no workforce-wide browser fetch is required.

## Source hierarchy

```text
src/features/break-management/
  contracts.ts                 Zod schemas and inferred domain/API types
  config.ts                    Environment configuration and rollout boundary
  api.ts                       Validating facade and real-adapter registration
  mock.ts                      Development fixtures, simulated adapter and scenarios
  mock-workbook.ts             Development-only OOXML fixture encoder
  hooks.ts                     Identity-scoped queries and connectivity
  components.tsx               Timer, allowance, history, audit and status UI
  BreakFilters.tsx              Filter inputs
  WorkflowDialog.tsx            Confirmed employee/supervisor/policy operations
  BreakManagementPage.tsx       Employee, monitoring, reports and policy orchestration
  tests/setup.ts               Browser-equivalent test storage for Node 25
  tests/domain.test.ts          Contracts, time and deterministic adapter workflows
  tests/workflows.test.tsx      Observable component workflows
tests/break-management/workflows.spec.ts
vitest.config.ts
playwright.config.ts
docs/break-management/HANDOVER.md
```

## Proposed contracts and backend integration checklist

`BreakApi` is the single adapter interface. These signatures are proposals; **no endpoint paths have been assumed**. The production implementation is supplied through `registerRealBreakApi(verifiedAdapter)` before rendering. With no registered real transport the UI fails closed with an integration-required explanation. The validating facade is shared by mock and real adapters.

| Method | Proposed behavior and requirements |
| --- | --- |
| `snapshot(signal)` | Authenticated identity access, runtime availability, server time, business timezone, active policy/history, assigned shift, authoritative shared allowance, active session, own requests, capability/action flags and restrictions |
| `monitor(filters, signal)` | Authorized global visibility, backend filters/pagination, independently scoped record actions, counts and authorized filter options |
| `history(page, pageSize)` | Own authorized paginated history; preserve assignment at event and scheduled shift-start date |
| `session(id)` / `request(id)` | Fresh authorized versioned record and immutable event/correction history |
| `execute(command, key)` | Explicit confirmation response `{ confirmed: true }`; no optimistic state, automatic retry or silent queue |
| `export(filters, format, key)` | Authorized, audited job; full current filters, historical/current assignment context, CSV or genuine XLSX |
| `exportStatus(id)` | Authorized job status, progress, failure details and a time-limited HTTPS download URL |

Commands include start, end, extra request, withdrawal, individual approval/rejection, correction, three-outcome overrun review and policy update. Approval/rejection, correction and every review require a reason. Mutations include revisions or policy versions; the backend must also enforce authorization and state atomically. The form performs a fresh check but does not pretend that this closes the race between check and commit.

Backend integration must supply:

1. Verified authenticated transport and account/permission refresh, mapped to the existing identity and permission system. Never trust role names or fixture grants for action authorization.
2. UTC/offset-bearing ISO 8601 timestamps, validated business timezone, assigned shift-start date and shift-end timestamp. Do not derive shifts from browser timezone or current assignments for history.
3. Server-computed consumed/remaining allowance, session elapsed time, exhausted/overrun state, eligibility and restriction messages. The browser interpolates only the visual timer using `performance.now`, capped at returned shift end.
4. Server shift-end closure and unresolved-closure records. Corrections preserve original events and append actor, timestamp, reason, previous and resulting state.
5. Atomic revision/ETag conflict rejection and idempotency key support. Return 409 for concurrent updates/changed shifts and 403 for revoked rights. A start must never create a duplicate active session, including across tabs/devices.
6. Extra-break request maximum, expiry, granted duration, one-use approval consumption and own pending withdrawal authorization. Approval does not reset original allowance or excuse existing violations.
7. Effective-dated policy evaluation including active shifts, versioned policy history, employee/supervisor notices and refreshed allowance calculations. Historical events remain intact.
8. Review decisions `Confirmed`, `Not a policy violation`, `Needs further review`. Only confirmed violations may be escalation eligible. The backend counts qualifying events and creates/updates an existing pending-review disciplinary case; return its reference. Never interpret raw timing as misconduct.
9. Existing notification service integration: policy-controlled supervisor 45/55/60-minute warnings, employee 55/60-minute warnings, every overrun, pending requests and decisions. Existing read/unread acknowledgment must remain separate from operational decisions. Email recipients use the existing configured supervisor group, full operational details according to the specified delivery policy, one attempt, logged failure and in-app fallback. The frontend sends no email.
10. Authorized asynchronous export jobs, audit events, failures, progress, filtered CSV/XLSX generation, safe expiry and download access revalidation. Do not return arbitrary script/blob URLs; the UI accepts HTTPS for real downloads.
11. Retention, deactivated-account restrictions and protected investigation/audit records implemented by the backend. The frontend displays returned history and never purges audit events.
12. Bounded pagination and filter indexes for over 1,600 workforce members; monitoring counts must remain consistent with documented scope. Request queues must apply the same authorized operational scope.

Error contract: normalize transport failures to `BreakError(code, message, status, uncertain)`. Recommended codes include `FORBIDDEN`, `CONFLICT`, `SHIFT_CHANGED`, `VALIDATION`, `START_BLOCKED`, `INVALID_RESPONSE`, `DISABLED`, `INTEGRATION_REQUIRED`, and `UNCERTAIN`. These codes are proposed frontend integration labels, not existing endpoint codes. Unknown network outcomes trigger authoritative refresh and an explanation; they are never blindly resubmitted. Malformed responses/timestamps disable dependent actions.

## Development fixtures and setup

Run `npm install` then `npm run dev`. Development defaults to enabled/mock. Default fixture identities reuse existing `EMP-00421` and `FL-00124`; `USR-SUP-001` and `USR-MGR-014` have explicitly **simulated** record action/export grants for these workers. Only the existing policy-administrator fixture `USR-SUP-001` has simulated policy access. Other supervisors retain read-only global visibility. Production must replace all these grants with verified backend responses.

Fixture assignments use an explicitly simulated Morning shift, 07:30–19:30 in Asia/Colombo. Night-shift tests select an explicit scenario, 19:30–07:30, and retain the scheduled start date across midnight. These fixture calculations live only inside the mock adapter. They are not frontend production policy evaluation. The default policy is 60 minutes shared across sessions. One historical unreviewed overrun is seeded, so current employee allowance begins unconsumed. Unavailable current shift time blocks new starts rather than inventing a current assignment.

Development sessions/requests/policies use localStorage key `relay-break-demo-v1` so browser reload and sign-out/sign-in preserve the simulated active session. This is solely demo persistence; production timers continue on the backend. Removing that key or calling `resetBreakDemo()` resets fixtures. Demo notification events use existing mock notifications and mark email `NOT_SENT`. The existing mock notification database resets on reload; production retention and delivery are backend responsibilities.

`breakScenarios` supports injected server time, Morning/Night assignment, network failure, lost response after commit, malformed data, runtime disable, permission revocation and missing shift-end processing. Test files operate on this adapter directly for deterministic fixture setup; real production transports are never contacted.

Environment configuration:

```dotenv
# Development defaults; do not copy the mock adapter into production.
VITE_BREAK_ENABLED=true
VITE_BREAK_ADAPTER=mock
```

```dotenv
# Production: ONLY after backend/auth/permission integration is ready.
VITE_BREAK_ENABLED=true
VITE_BREAK_ADAPTER=real
```

Production defaults to disabled/real. A production/mock combination is disabled even when the flag is true. Missing/unknown adapters never fall back to mock. Build-time flags require a rebuild; runtime disable and revoked access come from the adapter availability/permission response and are refreshed while open. Unrelated routes remain available.

## Test instructions and accessibility

`npm run test:breaks` runs Vitest/jsdom unit and component tests. `npm run test:breaks:e2e` runs Playwright with a local Vite server, fixed business time, isolated browser contexts and deterministic fixture setup. The browser config defaults to installed Chrome because the Chromium CDN download failed on this host; set `BREAK_BROWSER_CHANNEL=chromium` when using Playwright-managed Chromium or `msedge` for installed Edge. Tests do not use production data. Node 25 requires the test storage shim before Zustand imports.

`npm run typecheck`, `npm run lint`, and `npm run build` perform repository checks. The repository already has many unused-import/typecheck and lint violations outside the feature; results must distinguish these from introduced errors. On this Windows host Vite/Vitest filesystem operations needed execution outside the sandbox; that is an environment restriction, not a bypass in the application.

Accessibility implementation includes semantic tables/captions/headings, labeled forms, textual states independent of color, error/status roles, keyboard actions, focus trapping/restoration, and responsive horizontally scrolling tables. The shared dialog now uses a unique title ID, excludes disabled controls from the trap and does not reset focus on every input edit. No per-second live region announcements are emitted. A complete WCAG 2.2 AA certification, screen-reader audit and contrast audit remain pending; do not describe implementation notes as certification.

## Known limitations

- No real break API, server policies, timer/assignment engine, verified fine-grained grants, notification delivery, background export service or disciplinary automation exists in the inspected repo. Those production dependencies are deliberately blocked.
- Local demo storage is unsuitable for sensitive production records or multi-device concurrency. Revisions model conflict responses within the single simulated adapter; production must enforce atomic revisions across processes/devices.
- Mock exports are bounded development fixtures and complete immediately. The frontend supports queued/processing/ready/failed responses from the real adapter, but only a backend can provide durable, audited production jobs.
- Production notifications/auth across the whole existing prototype must also be integrated before enabling real break workflows. Do not silently combine a real break view with demo operational delivery or mock authentication.
- Frontend history does not impose retention or deactivate workers; authorized backend contracts must determine which records may be returned.

## Files and scope

New files are the feature tree above, test configs/specs, `src/vite-env.d.ts`, and this handover. Modified existing files: `src/App.tsx`, `src/data/navigation.ts`, `src/components/layout/Sidebar.tsx`, `src/components/layout/MobileNav.tsx`, `src/pages/dashboard/DashboardHome.tsx`, `src/components/ui/Dialog.tsx`, `src/types/domain.ts`, `src/pages/system/Notifications.tsx`, `package.json`, and `package-lock.json`. Unrelated pre-existing changes were preserved.

See `VERIFICATION.md` for actual executed commands, final results and the requirement status matrix.
