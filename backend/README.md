# PortCity Digital backend

Status: real login and the original frontend workflows are connected to PostgreSQL. See [original workflow persistence, import/reset and login mappings](../docs/backend/06-original-workflows.md).

JavaScript ES modules, Express and PostgreSQL implement login/sessions, roles and action grants, account management, workforce records, platform setup, own notifications and audit reads. The React frontend remains at the repository root.

Start with [the discovery document](../docs/backend/01-discovery-and-scope.md).

Read [architecture, access matrix, endpoints and remaining delivery plan](../docs/backend/02-architecture-and-delivery.md) and [the architecture decision](../docs/adr/0001-node-postgres-mvc-foundation.md).

## Local setup

Use Node.js 22 or newer and PostgreSQL. From this directory:

```powershell
npm ci
Copy-Item .env.example .env
```

Edit `.env` with your database connection, frontend origin and chosen initial account credentials. PostgreSQL must be running. With Docker available, optionally set `$env:POSTGRES_PASSWORD` to your local database password and run `docker compose up -d`. Use the same password in DATABASE_URL, URL-encoded if necessary. `.env` is ignored by Git.

```powershell
npm run migrate
npm run bootstrap
npm run dev
```

Bootstrap works only with an empty users table. It creates a Supervisor with `accounts.manage` and `audit.read`. Passwords must be 12-128 characters. No demo password is seeded. Remove bootstrap credentials from `.env` afterward. `npm start` runs without watch mode.

If users already exist and you need a real account administrator, set SUPERVISOR_NAME, SUPERVISOR_EMAIL and SUPERVISOR_PASSWORD in `.env`, then run `npm run supervisor:create`. This creates a new authorized Supervisor without replacing existing users. Remove that password afterward. See [account creation and login](../docs/backend/05-accounts-and-swagger.md) for all three roles.

## Calling the API

Swagger UI is available at [http://localhost:3001/api-docs/](http://localhost:3001/api-docs/). The generated OpenAPI 3.0 specification is available at [http://localhost:3001/api-docs.json](http://localhost:3001/api-docs.json). `swagger-jsdoc` reads `@openapi` annotations in `src/routes.js` and `src/app.js` at startup; reusable schemas and security definitions live in `src/docs/openapi.js`. Restart the server after annotation changes (`npm run dev` watches source files).

The documentation covers implemented routes only. Try it out/Execute is enabled. First execute `/auth/login` with a real account; Swagger retains the cookie and automatically adds CSRF to subsequent authenticated writes. Open docs at the exact API_ORIGIN (development defaults to http://localhost:3001). Foreign origins and insufficient permissions remain blocked. See [Swagger steps and role-specific examples](../docs/backend/05-accounts-and-swagger.md).

Base URL: `http://localhost:3001/api/v1`. POST `/auth/login` with `{email,password}` and `Origin: http://localhost:5173`. The response sets an HttpOnly cookie and returns `{user,permissions,csrfToken}`. Browsers must send `credentials: 'include'`. Include `X-CSRF-Token` on authenticated mutations. GET `/auth/me` restores identity and CSRF. Client role fields are rejected. Scripts must also send the configured Origin on writes.

Production requires an HTTPS frontend origin and a same-site HTTPS API for Secure SameSite cookies. Configure trusted PostgreSQL TLS where required; do not disable certificate validation. GET `/health` reports process health; `/ready` checks database/schema access.

## Verification

```powershell
npm test
```

Tests exercise the real Express app and SQL through embedded PostgreSQL (PGlite). They do not require a running PostgreSQL service and do not establish deployment/TLS, multi-client concurrency or backup recovery. Verify migrations/bootstrap against real PostgreSQL before rollout.

The original scheduling, recruitment, placement/training, equipment/attendance, breaks, disciplinary, report and profile workflows now run through authenticated PostgreSQL-backed operations. External email delivery remains unconnected. See [dataset import and workflow architecture](../docs/backend/06-original-workflows.md) for setup, mappings, verification and current implementation limits.
