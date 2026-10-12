# Data-first workspace rollout

The Equipment pilot was reviewed and its compact navigation, summary strip, filter toolbar, working data view and quick-inspection pattern extended to the other supervisor areas.

## Working views

- Workforce opens the virtualized employee directory, with live workforce totals and expandable category/department coverage. Employee rows open a right-side inspection panel; the full record remains available for schedule and history workflows. Search, pagination, sorting and scroll state remain mounted while inspecting a record. Density changes remeasure virtualized rows.
- Scheduling opens the existing monthly/daily/platform/department roster. Its summary explicitly describes today's unfiltered roster, independent of the selected roster month or scope. Compatible category, platform and department filters carry into off-day approvals; unrelated tabs and dates do not leak.
- Operations opens a platform table rather than platform image cards. Its summary follows the selected platform filters and occupancy mode. The attention sort prioritizes incident counts, then pending replacements, then pending handovers. Platform inspection shows live department coverage and pending work while leaving scope and mode intact.
- Insights & Tools opens the existing report workspace with actual report metadata, notification and audit totals. Report changes preserve URL scope. Small screens use a compact report selector; desktop retains the grouped report directory. CSV export continues to use the existing report results. Invalid report keys resolve to a valid default.
- Equipment retains its inventory, compact summary and laptop inspection panel, now using the shared summary component.

## Consistency

Root and detail pages use compact text/icon navigation, flatter panels and restrained charcoal/orange styling. Decorative artwork was removed from shared panel headers, platform tiles and staff dashboards. The supervisor dashboard's platform grid is now a comparative table. Login branding and illustration remain outside the operational workspace.

Existing routes, authorization, scheduling rules, break permissions, approval forms and backend methods remain authoritative. Longer record workflows still use their full pages. Summary failures do not prevent the independent underlying directories or reports from loading. No new bulk mutations or backend capabilities are implied by this rollout.

## Verification

The initial browser suite passed 15 checks, including all 51 legacy role destinations, navigation, Equipment, employee inspection, platform inspection, roster scope transfer and CSV export. Final workspace checks cover the refined priority sort and mobile report layout. Responsive checks use 375, 768 and 1440 pixel widths. The 43 navigation unit checks passed, as did targeted ESLint and TypeScript with the repository's existing unused-symbol checks disabled. Production build retains the existing large-main-chunk warning.
