# Supervisor navigation redesign

## Audit and decisions

The original sidebar exposed 29 destinations in ten groups, with Break Management appearing before Dashboard. Desktop and mobile duplicated their visibility filters. Primary active states did not identify a feature area when users opened related lists or records. A hardcoded Q3 rotation banner could show stale dates.

The application uses React 18, TypeScript, Vite, React Router 6, TanStack Query, Zustand, Tailwind and Lucide. App.tsx owns lazy-loaded routes; AppShell owns the persistent layout. RequireRole and server authorization retain access enforcement. The application defines SUPERVISOR, EMPLOYEE and FREELANCER roles; it has no separate administrator role or general granular navigation permission system. Break Management additionally uses verified server capabilities and feature/adapter restrictions.

Existing list pages use the api service and reference-data hooks, pagination where already supported, QueryView states, and shared headers/tables/dialogs. Records already have dedicated employee, freelancer, platform, category, pool, laptop and replacement detail routes. Equipment incidents and disciplinary investigations use their existing focused dialogs and case views. Those workflows remain distinct; no new incident record route or duplicate case system is introduced. Existing disciplinary document, findings, warning-letter and escalation actions remain in the disciplinary module.

## Complete feature mapping

All original supervisor destinations retain their original route and SUPERVISOR guard (Notifications remains authenticated for all roles as before). Break links additionally require view and monitor capabilities; policy also requires policy capability. Dashboard remains the existing overview. Workforce reuses its existing live metrics; other hubs offer direct actions without speculative metrics or aggregate API requests.

| Primary area / hub | Existing destinations |
| --- | --- |
| Dashboard `/` | Dashboard |
| Workforce `/workforce` | Workforce overview; Candidates `/candidates`; Register Staff `/register`; Platform Demand `/platform-demand`; Placement Queue `/placement-queue`; Employees `/employees`; Freelancers `/freelancers`; On-Platform Training `/training`; Departments `/departments` |
| Scheduling `/scheduling` | Shifts `/shifts`; Rotation `/rotation`; Roster `/roster`; Off-days `/off-days` |
| Operations `/supervisor-operations` | Platform Operations `/operations`; Replacements `/replacements`; Break Management `/breaks`, history `/breaks/reports`, policy `/breaks/policy`; Incident & Disciplinary `/disciplinary` |
| Equipment `/equipment` | Platform Categories `/categories`; Platforms `/platforms`; Platform Configuration `/platform-config`; Platform Capacity `/capacity`; Workstation Pools `/pools`; Laptops `/laptops`; equipment Incidents `/incidents` |
| Insights & Tools `/insights` | Notifications `/notifications`; Reports `/reports`; Audit Logs `/audit`; Settings `/settings` |

Positions remain the existing Departments tab and `/positions` compatibility redirect. Profile remains available through the topbar and belongs to Insights for location highlighting. Handover and Report Issue are staff workflows, not supervisor routes; supervisor privileges were not expanded. Freelancer coverage remains the existing Replacements workflow.

## Consolidation and compatibility

Only navigation entry points were consolidated. No business screens were merged: platform operations, workforce demand, capacity, recruitment and placement serve different stages; equipment incidents and conduct investigations serve different processes. Each remains independently accessible within its area. Existing record layouts, identifiers, actions and breadcrumbs are reused, with a shared feature breadcrumb and contextual navigation above them. Existing roster employee and replacement links still open the original detail routes.

Four additive supervisor-only hub routes require no redirects. `/operations` keeps its original platform overview; the operations hub uses `/supervisor-operations` to avoid breaking links. Every original route and parameter remains valid, including `/positions`. Nested records highlight their owning primary area. Client-side links preserve browser history. Sidebar collapse leaves the URL untouched.

Roster date/month and roster/off-day scope filters use URL state. Switching scheduling tabs preserves these parameters. Between roster and off-days, only shared category/platform/department filters transfer; workflow tabs, search terms, and record identifiers do not leak. Existing local state for unrelated filters remains unchanged. No global state or routing dependency was added.

## Implementation files

- `src/data/navigation.ts`: compact supervisor primary navigation; existing staff metadata preserved.
- `src/data/supervisorNavigation.ts`: typed areas, legacy destination mapping, boundary-aware active matching, break visibility and compatible context links.
- `src/components/layout/Sidebar.tsx`, `MobileNav.tsx`: six primary choices, nested active states and keyboard focus styling; mobile reuses the existing focus-trapping/Escape Dialog.
- `src/components/layout/SupervisorContext.tsx`, `AppShell.tsx`: feature breadcrumbs and contextual navigation on existing pages.
- `src/pages/system/SupervisorHub.tsx`, `src/pages/workforce/WorkforceOverview.tsx`, `src/App.tsx`: direct feature links, reused workforce overview and additive guarded routes.
- `src/hooks/useUrlScope.ts`, scheduling Roster/OffDays: shareable scope filters with history support.
- `src/components/ui/Dialog.tsx`: navigation links qualify for initial dialog focus.
- Navigation unit and browser tests; Vitest includes navigation regression tests alongside existing break tests.

No API, backend, database, operational validation, production records, attendance functionality or new dependencies were introduced. Rotation, replacement eligibility, off-day capacity, workload limits and laptop allocation remain in the existing service layer.

## Verification

- Production Vite build: passed; existing large main-bundle warning remains.
- Navigation inventory/permission unit tests and existing break domain/workflow tests: 74 passed.
- TypeScript with unused-local/parameter diagnostics disabled: passed. The standard typecheck reports existing unused imports/variables throughout the repository; unrelated cleanup is outside this redesign.
- Targeted ESLint for changed files: no errors; the existing off-day mutation non-null assertion warning remains.
- Browser tests: 4 passed, covering desktop hub discovery, nested active states, sidebar collapse, shared filters, Back/Forward, mobile dialog focus/Escape and role-restricted hub access.

## Scope limits

The new hubs do not invent counts or require extra business API calls. Production break access remains unavailable unless the existing integration/configuration permits it. Existing workforce pagination and table performance are reused; no new 1,600-record aggregate rendering is added. Existing focused incident dialogs remain available, rather than inventing unsupported incident identifiers or backend detail contracts. No approval-dependent business decisions are outstanding.
