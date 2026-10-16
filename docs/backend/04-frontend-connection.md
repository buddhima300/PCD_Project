# Frontend connection to the Node.js backend

## Running the connected app

Start PostgreSQL and the backend as described in `backend/README.md`. In one terminal:

```powershell
cd "E:\Projects\PCD Project\Project V2\PCD_Project\backend"
npm run dev
```

In another terminal, from the repository root:

```powershell
npm run dev
```

Open http://localhost:5173. Use the actual account created by `npm run bootstrap`, or an account provisioned through Account management. The demo accounts/passwords no longer sign in. The initial Supervisor can register worker records, create their matching login accounts, and manage account access under Settings.

The defaults work without a frontend `.env`. `.env.example` documents optional settings. Vite proxies `/api` to `http://localhost:3001` and preserves the browser's Origin. Port 5173 is strict so Vite cannot silently move to an origin the backend rejects. The backend's FRONTEND_ORIGIN must be `http://localhost:5173` for this setup. Use the same hostname consistently: localhost and 127.0.0.1 have different origins/cookie hosts.

If the API port differs, set the PowerShell environment variable `PCD_API_TARGET` before starting Vite. `VITE_API_BASE_URL` can point to a separately hosted API, but its CORS, same-site cookie and HTTPS settings must match the deployment. Production hosting needs a reverse proxy for `/api/v1`; Vite's development proxy is not part of a production build. Never embed DATABASE_URL or backend credentials in a VITE variable.

## Connected features

| Screen | Server requests |
| --- | --- |
| Login/session restoration | POST `/auth/login`, GET `/auth/me` |
| Dashboard/workforce/employees/freelancers | GET `/workers` with bounded pagination and optional worker type |
| Add employee/freelancer with login | POST `/accounts` with matching nested worker, saved atomically |
| Worker status | PATCH `/workers/:id/status` with revision/reason |
| Categories | GET/POST `/platform-categories` |
| Platforms/capacity | GET/POST `/platforms`, PUT `/platforms/:id/capacity` |
| Activation | POST `/platforms/:id/activate` with revision |
| Settings/account management | GET/POST `/accounts`, PATCH `/accounts/:id/access` |
| Notifications/badge | GET `/notifications`, optional unread filter, PATCH own read acknowledgment |
| Audit | GET `/audit`, explicit permission required |
| Profile/password | Server account identity; POST `/auth/change-password` |
| Sign out/switch worker | POST `/auth/logout` before clearing local identity |

The connected foundation workspace renders only actual backend fields. The richer legacy operational pages remain in source, but are not mounted with real sessions because their contracts include assignments, schedules, metrics and state transitions the foundation does not implement. Existing navigation destinations without a completed backend display an unavailable message. No empty simulated records, fabricated counts, fake writes or mock API fallback are used for those workflows.

The API facade's former mock-handler imports are now type-only. Unsupported facade methods reject with INTEGRATION_REQUIRED. Dedicated foundation DTOs in `src/services/backend.ts` preserve actual snake_case fields and keep account UUIDs separate from worker numbers/worker UUIDs. The root route tree does not import the legacy demo pages.

## Identity and security behavior

Account management now has a dedicated Add Supervisor form and a paginated picker for existing workers without logins. New employee/freelancer registration creates both records in one step. See [onboarding and Swagger instructions](05-accounts-and-swagger.md). Swagger Try it out supports authenticated writes from the configured API origin; session and CSRF protections remain enforced.

`src/services/http.ts` sends cookies with `credentials: include`, keeps CSRF in memory, and adds X-CSRF-Token to writes. The browser supplies Origin; JavaScript does not spoof it. There are no automatic mutation retries or optimistic write confirmations. Lost write responses explain that the server state must be checked before retrying.

Session identity is not persisted by Zustand. At startup, `/auth/me` restores server identity and grants. The old demo identity key is removed. Server 401 responses clear local identity and cached queries. Logout must succeed on the server (or confirm the session is already invalid) before local sign-out completes. Password changes invalidate all sessions and return to sign-in.

Account changes cancel pending requests and remove identity-specific caches. Late responses from a previous session are rejected. Cross-tab login/logout/password changes publish a non-secret storage marker. Other tabs and window focus revalidate identity and permissions. Sensitive cached screens are hidden during revalidation. No credentials or CSRF tokens are written to localStorage.

Break management defaults to disabled/real. Its development adapter is lazy and requires explicit fixture configuration; it is not registered with the connected workspace. Legacy unit tests opt into fixture handlers explicitly instead of relying on production session code to authenticate mock APIs.

## Verification

- `npm run test:backend` at the root: nine frontend HTTP/session tests.
- `npm run test:breaks` at the root: 110 existing domain/component regression tests, with explicit isolated fixtures.
- `npm test` in backend: 14 API/SQL/OpenAPI regression tests.
- `npm run test:frontend` in backend: full-stack Chrome test using actual Vite proxy, React, Express and isolated embedded PostgreSQL. Covers login/reload, persistent worker/account/category/platform writes, activation, CSRF, audits, unsupported workflow state, logout and employee access. Requires root dependencies and installed Chrome; PCD_TEST_BROWSER can choose another installed Playwright channel.
- Production build and TypeScript validation are run separately. The repository-wide strict typecheck already reports many unused declarations in legacy pages; validation with unused-declaration checks disabled distinguishes actual type errors from that existing backlog.

The browser smoke test does not connect to the user's database or seed real credentials. Embedded SQL verification does not establish deployed PostgreSQL TLS, backups or multi-client race behavior.
