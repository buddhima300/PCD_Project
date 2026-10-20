# Workspace theme

The authenticated application uses the supplied indigo (`#262262`), orange (`#f16623`) and lime (`#c6ff33`) references, with complementary blue and purple accents. Indigo provides depth; orange identifies actions; lime highlights selected navigation, progress and positive status. Warnings use blue treatments; errors use orange text on purple surfaces, retaining their descriptive labels and icons. Primary actions use black-to-orange gradients with white text; secondary actions use a quieter version of that gradient. Brown and dark orange subcard tints are replaced with indigo and purple.

`src/elite-theme.css` layers translucent panels, radial gradient borders, linear action gradients, softly lit backgrounds and restrained motion over the existing application. Headings use the already imported Manrope family, body text uses Inter, and operational IDs retain monospace. Nested cards, tables, forms, roster views, dialogs and notifications share the same tokens. Dense workflows retain their useful information and scrollable tables.

`src/button-effects.css` applies the subsequently supplied reflective button treatment over the base action gradients: a white-lit outer rim, dark radial inner surface, cyan/blue glow at the lower left, and soft reflected light at the upper right. It combines the supplied decorative layers into pseudo-elements, preserving existing button dimensions, labels, icons, loading indicators, focus outlines and event targets. Shared `Button` variants and prominent action links receive the effect; disabled controls suppress the glow. The treatment is scoped to authenticated workspaces.

`AppShell` adds the `elite-theme` class to the document while an authenticated workspace is mounted, and removes it on unmount. This also themes overlays and toast notifications. The login screen, its CSS, and the original `agency-theme.css` are preserved.

`RadialProgress` provides gradient SVG rings for platform activity, workforce vacancies, off-day balances, freelancer workload and profile statistics. Each ring has a unique gradient ID and a named progressbar with a textual value. Empty capacity and values above capacity are handled without invalid arcs. Counts come from existing APIs.

Keyboard focus uses lime outlines. Mobile controls, wrapping banners, reduced motion, reduced transparency and opaque backdrop fallbacks are included. Continuous animation is limited to decorative background elements and disabled on mobile and when reduced motion is requested.

## Verification

Run the production build and the affected component tests:

```sh
node node_modules/vite/bin/vite.js build
node node_modules/vitest/vitest.mjs run src/data/tests/employeePlatformUI.test.tsx src/data/tests/workforceFlowUI.test.tsx --config vitest.config.ts
```

Run the browser suite using real sessions and an isolated embedded database:

```sh
node backend/tests/elite-theme.e2e.js
```

The browser suite checks 55 destinations across all three roles at desktop and mobile widths, captures dashboards at 375, 768, 1024 and 1440 pixels, checks the mobile navigation dialog, detects runtime errors and page overflow, and compares login screenshots byte for byte before sign-in and after sign-out. Screenshots are saved under `test-results/elite-theme/`.

The repository's standard typecheck currently reports existing unused imports and parameters. Type checking with those diagnostics disabled passes:

```sh
node node_modules/typescript/bin/tsc --noEmit --noUnusedLocals false --noUnusedParameters false
```
