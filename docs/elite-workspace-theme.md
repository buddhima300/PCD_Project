# Workspace theme

The authenticated application uses the supplied indigo (`#262262`), orange (`#f16623`) and lime (`#c6ff33`) references, with complementary blue and purple accents. Indigo provides depth; orange identifies actions; lime highlights selected navigation, progress and positive status. Warnings use blue treatments; errors use orange text on purple surfaces, retaining their descriptive labels and icons. Primary actions use black-to-orange gradients with white text; secondary actions use a quieter version of that gradient. Brown and dark orange subcard tints are replaced with indigo and purple.

`src/elite-theme.css` layers translucent panels, radial gradient borders, linear action gradients, softly lit backgrounds and restrained motion over the existing application. Headings use the already imported Manrope family, body text uses Inter, and operational IDs retain monospace. Nested cards, tables, forms, roster views, dialogs and notifications share the same tokens. Dense workflows retain their useful information and scrollable tables.

`src/button-effects.css` applies the subsequently supplied reflective button treatment over the base action gradients: a white-lit outer rim, dark radial inner surface, cyan/blue glow at the lower left, and soft reflected light at the upper right. It combines the supplied decorative layers into pseudo-elements, preserving existing button dimensions, labels, icons, loading indicators, focus outlines and event targets. Shared `Button` variants and prominent action links receive the effect; disabled controls suppress the glow. The treatment is scoped to authenticated workspaces.

`AppShell` and `Login` apply the `elite-theme` class while mounted, giving the public login and authenticated workspaces the same palette and reflective button treatment. Login uses a matching indigo glass card, lime focus states and orange accents. Sign-in, remembered email, validation, password visibility, help and motion controls retain their existing behavior. The original `agency-theme.css` remains available as the base layer.

`RadialProgress` provides gradient SVG rings for platform activity, workforce vacancies, off-day balances, freelancer workload and profile statistics. Each ring has a unique gradient ID and a named progressbar with a textual value. Empty capacity and values above capacity are handled without invalid arcs. Counts come from existing APIs.

Keyboard focus uses lime outlines. Mobile controls, wrapping banners, reduced motion, reduced transparency and opaque backdrop fallbacks are included. Continuous animation is limited to decorative background elements and disabled on mobile and when reduced motion is requested.

## Verification

Login-specific responsive and interaction checks:

The sculpted login treatment is implemented in `src/login-sculpted-glass.css`. A second glass edge, layered shadows, a reflective front surface and inset fields give the existing wallpaper and form a dimensional composition. `Login` uses the already installed Framer Motion springs for a pointer-driven tilt bounded to 2.4 degrees and a moving light reflection. Tilt resets on pointer leave and form focus, and is disabled for touch/coarse pointers, narrow screens, reduced motion, the help dialog and the existing pause control. No WebGL or new dependencies are required. The wallpaper remains stationary.

```sh
node scripts/verify-login-theme.mjs
```

## Login wallpaper

The login also blends the video supplied via [Pinterest pin 1044412969835883841](https://www.pinterest.com/pin/1044412969835883841/) over the wallpaper. Its playable MP4 rendition is stored locally at `public/videos/login-abstract-blue.mp4` (about 5.5 MB), so playback does not require a Pinterest embed or a streaming dependency. `LoginBackgroundVideo` loops it muted and inline, fades it in after playback starts, and uses a screen blend at 32% opacity (24% on mobile). The existing motion control pauses/resumes it, hidden tabs pause it, and reduced-motion visitors do not load it. Playback or network failure leaves the wallpaper visible and the form usable. Source rendition: `https://v1.pinimg.com/videos/mc/720p/00/b7/1a/00b71ac95a485aac1af1fc72f3415c6a.mp4`.

The supervisor dashboard additionally uses the supplied reference image at `public/images/supervisor-glass-reference.png`. Its treatment lives in `src/supervisor-dashboard-glass.css`, scoped to `[data-workspace='dashboard']`. The decorative fixed background is blended at 20% opacity (14% on mobile). Dashboard cards and subcards use translucent indigo/blue fills, reflective gradient edges, backdrop blur and soft shadows; reduced-transparency and unsupported-backdrop fallbacks use opaque surfaces. Other workspaces and the login keep their own backgrounds.

Created with the built-in image generation tool and saved as `public/images/login-double-exposure-indigo.png`. The original wallpaper is retained. This new landscape image is a background asset, with the sign-in form rendered as live HTML above it.

Generation prompt:

> Create a premium photorealistic double-exposure wallpaper for PortCity Digital workforce operations login. Landscape 16:9 wide composition. Left 55 percent contains an elegant side-profile silhouette of a professional person blended photographically with a luminous modern coastal city skyline and subtle workplace architecture, true double exposure with seamless translucent overlays. Surround with sparse floating optically clear fluted glass rectangles, tall thin glass prisms and a few small iridescent glass spheres inspired by luxury blue glass product photography. Deep midnight indigo #262262 and near-black #0e0d1d base, electric cobalt blue and violet light, restrained cyan refractions and tiny orange #f16623 edge-light accents. Professional, sophisticated, cinematic, realistic materials, layered depth, tasteful bloom, refined visual hierarchy. Art concentrated upper-left and left-center; lower-left subdued dark space for white headline overlaid later. Rightmost 45 percent should fade smoothly to very dark indigo negative space for a login form. No text, no lettering, no logos, no boxes with branding, no interface, no watermark. A full-bleed website wallpaper, not a screenshot or mockup.

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
