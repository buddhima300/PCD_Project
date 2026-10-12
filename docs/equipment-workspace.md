# Equipment workspace pilot

The supervisor Equipment landing page now opens the asset inventory directly. Seven compact destination links retain access to inventory, capacity, pools, incidents, platforms, categories and configuration. Summary metrics show global laptop totals from the resource API, with maintenance and incident statuses combined under Needs attention. Retired assets remain included in Total laptops.

Inventory retains its existing search, scope filters, status filters and 25-row pagination. Comfortable/compact density and Clear filters controls support routine scanning. Selecting a row by mouse or Enter opens a right-side dialog containing resource assignments and recent history. Closing with Escape returns focus to the selected row and retains filters, page and density. Open full record preserves access to the complete laptop history. No bulk mutation or new backend capability was introduced.

Equipment routes suppress decorative illustration headers and use flatter panels. Other feature areas retain their existing layout pending review of this pilot. Capacity, configuration and incident workflows continue to use their existing data and authorization rules.

Validation: targeted ESLint, TypeScript with the repository's existing unused-symbol checks disabled, six Playwright checks covering the pilot and supervisor navigation, and production build. The browser test includes responsive widths 375, 768 and 1440 pixels, actual asset selection, preserved search and keyboard focus restoration.
