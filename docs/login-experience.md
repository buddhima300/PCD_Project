# Welcoming login experience

The login page uses a generated double-exposure portrait and coastal skyline, with the existing charcoal/orange identity and PortCity Digital logo. A restrained translucent sign-in panel stays visually separate from the background. Operational pages retain their data-first layout.

Motion includes a slow background drift, subtle light breathing, entrance transitions, role-selection movement and changing welcome copy. Pause/Resume motion controls the decorative background and subsequent interaction transitions. The device's reduced-motion preference disables continuous CSS motion and animated entrances. No timed role carousel or automatic welcome-message rotation is used.

Three role shortcuts represent Supervisor, Employee and Freelancer. All four existing demo accounts remain available through the help dialog, including the senior approver account. Account selection fills the existing form, and Quick Sign-in still uses the existing login API. API authentication, session persistence and route guards are unchanged.

Visible field labels, associated validation errors, password visibility, Caps Lock feedback, pending-submit feedback and keyboard-accessible help support sign-in. Help uses the shared focus-trapping dialog with Escape dismissal and focus restoration. Remember my email stores only the email preference under `portcity-login-email`; no password is stored by that preference.

Assets: `public/images/login-double-exposure.png`. Login-specific styles: `src/login-experience.css`, imported after the shared theme. The original generated asset remains preserved outside the project; the project uses its own copied asset.

Validation: seven browser checks covering all role destinations plus login interaction, widths 375/768/1024/1440, validation, password visibility, keyboard help, motion pause, reduced motion and successful email preference persistence. Targeted ESLint and TypeScript with pre-existing unused-symbol checks disabled passed. Production build retains the existing large-chunk warning.
