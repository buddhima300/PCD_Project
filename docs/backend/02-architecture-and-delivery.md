# Node.js backend architecture and delivery

Updated 2026-10-16 after the instruction to implement using Node.js.

## Decision and alternatives

Use a modular monolith: JavaScript ES modules, Express 5 and PostgreSQL through `pg`. One deployable API and one relational database keep reservation, custody and approval transactions local. Feature modules keep workflows clearer than a single global controllers/services/models tree. Microservices add deployment and distributed transaction work without an established need. TypeScript remains possible later; this implementation uses JavaScript with runtime Zod validation.

Supervisor management is organization-wide initially, matching existing routes. Sensitive permissions remain explicit. Department/platform-restricted supervisor scopes require a reviewed scope model before deployment to teams needing those restrictions. The implementation instruction authorizes the foundation; unresolved retention, leave and invitation policies are not silently treated as approved.

## MVC responsibilities and structure

React is the view layer. The API returns JSON, so server-rendered templates are unnecessary. Routes compose access middleware and controllers. Controllers validate HTTP input and shape responses. Services own business transitions and transaction boundaries. Models contain persistence queries. Simple read queries currently live in controllers; extract read models as reporting grows.

```text
backend/
  package.json, package-lock.json   independent Node package
  .env.example, compose.yaml        configuration and optional local PostgreSQL
  migrations/                      ordered SQL changes
  scripts/                         migration and initial account provisioning
  src/
    server.js                      process lifecycle
    app.js                         HTTP security and error handling
    config.js                      environment validation
    routes.js                      versioned endpoint composition
    db/pool.js                     pool and transaction helper
    shared/                        validation, errors and cryptography
    modules/
      auth/                        controller, service, model and middleware
      accounts/                    account provisioning and permissions
      workforce/                   controller, service and model
      platforms/                   controller and setup service
      audit/                       transactional audit writes
  tests/                           HTTP and SQL integration tests
```

Request flow: input validation -> authenticated session -> role/action check -> service transaction -> model/PostgreSQL -> JSON. Every transaction uses one checked-out database client. Business updates and their audit events commit together. Roles, actor IDs and grants in client input never establish authority.

## Login and access matrix

| Action | Supervisor | Employee | Freelancer |
| --- | --- | --- | --- |
| Login, own session, logout, own password change | Yes | Yes | Yes |
| Read workforce | All | Linked own record | Linked own record |
| Create worker/change status | Yes | No | No |
| Platform/category setup and activation | Yes | No | No |
| Account administration | `accounts.manage` | No | No |
| Read audit records | `audit.read` | No | No |
| Notifications and read acknowledgment | Own | Own | Own |
| Disciplinary approval | Reserved grant plus assigned independent approver; workflow pending | Own response workflow pending | Own response workflow pending |
| Break policy/review, export, attendance correction | Reserved action grants; workflows pending | No | No |

Stored permission codes: `accounts.manage`, `audit.read`, `disciplinary.approve`, `breaks.policy`, `breaks.review`, `reports.export`, `attendance.correct`. Reserved grants do not create implemented endpoints. The bootstrap Supervisor receives only account management and audit read. New supervisors have no sensitive grants by default.

Passwords use salted asynchronous scrypt. Sessions use random opaque tokens; PostgreSQL stores only token digests. Cookies are HttpOnly and SameSite=Strict, with Secure and a __Host prefix in production. Writes require the exact configured Origin; authenticated writes also require the session CSRF header. Login and GET `/auth/me` return trusted identity, grants and CSRF token. Do not store session credentials in localStorage.

Password changes revoke all account sessions. Account access/permission changes revoke target sessions. Administrators cannot modify their own access through this endpoint; an active account administrator must remain. Worker suspension/inactivation locks the linked account and revokes sessions. Reactivation does not silently unlock the account. Worker account provisioning requires a matching type/email and an eligible unlinked worker.

There is no public registration, default demo password, invitation email or password recovery yet. Initial credentials currently require a separately agreed secure delivery process. Invitation/reset tokens and delivery are required before broad production onboarding.

## Database boundaries

Users are login identities; workers are operational people with an optional one-to-one user link. Sessions and permissions refer to users. Categories own platforms. Platform department capacities have separate morning/night targets bounded by physical seats. Notifications belong to one recipient. Audit events record actor and entity.

The foundation only models onboarding, production-active and inactive worker lifecycle values. Full recruitment/training lifecycle needs later migrations. No roster, seat assignments, handover or disciplinary evidence is fabricated. Capacity edits are setup-only until assignment-aware reservation checks exist. Platform activation requires positive configured capacity, but no staffing minimum.

Unique constraints protect normalized email, worker numbers and category/platform codes. Foreign keys and CHECK constraints enforce relationships and capacities. Row locks plus revision checks protect worker/platform writes. Migrations use an advisory transaction lock and checksums to detect edits to applied SQL.

## API contract

Base: `/api/v1`. UUIDs identify database rows; frontend business codes/worker numbers remain separate. Request schemas use camelCase; database responses currently use snake_case. A frontend adapter must map these deliberately. The API is not yet a drop-in replacement for the existing facade DTOs.

| Method/path | Purpose/input |
| --- | --- |
| POST `/auth/login` | `{email,password}` -> `{user,permissions,csrfToken}` and cookie |
| GET `/auth/me` | Restore trusted identity and CSRF |
| POST `/auth/logout` | Revoke current session |
| POST `/auth/change-password` | `{currentPassword,newPassword}`; revoke all sessions |
| GET/POST `/accounts` | Page accounts / create `{email,password,name,title?,role,workerId?,worker?,permissions?}`; new worker and account creation is atomic |
| PATCH `/accounts/:id/access` | `{status,permissions?}`; ACTIVE or LOCKED |
| GET/POST `/workers` | Own/management list / create worker; see worker schema |
| PATCH `/workers/:id/status` | `{status,revision,reason}` |
| GET `/departments` | Supervisor reference data |
| GET/POST `/platform-categories` | Page/create `{code,name,description?}` |
| GET/POST `/platforms` | Page/create `{code,name,categoryId,description?}` |
| PUT `/platforms/:id/capacity` | `{revision,departments:[{departmentCode,seats,morningTarget,nightTarget}]}`; upsert supplied departments |
| POST `/platforms/:id/activate` | `{revision}` |
| GET `/notifications` | Own recipient records |
| PATCH `/notifications/:id/read` | `{}`; own record only |
| GET `/audit` | Explicitly granted Supervisor list |

GET `/health` and `/ready` are outside the API prefix. Readiness checks database/schema access. Lists accept `page` and `pageSize` (maximum 100) and return `{items,total,page,pageSize}`. Errors return `{error:{code,message,details?},requestId}`. Statuses include 401 credentials/session, 403 access/CSRF/origin, 404 missing/inaccessible record, 409 conflict, 422 invalid input, 429 login throttling and 503 unavailable readiness. Unknown fields are rejected on command bodies. SQL/password details are not returned.

## Implementation plan and acceptance gates

1. **Foundation — implemented:** independent package, migrations, session login, roles/grants, account lifecycle, workforce records, platform setup, own notifications and audits. Verify authorization failures, rollback, constraints, revisions and revocation.
2. **Frontend integration:** real transport with credentials/CSRF, DTO and user/worker identity mapping, session initialization via `/auth/me`, server logout, cache clearing and removal of demo shortcuts in real mode. Never combine real login with mock operational data. Add invitation/password recovery and settle secure delivery.
3. **Recruitment, placement and training:** candidates, onboarding, effective-dated assignments, seat reservations, evaluations and explicit production promotion. Confirm account creation milestone. Test simultaneous placement into the last seat.
4. **Scheduling and replacements:** dated shifts, roster, rotation, off-days, freelancer availability, eligibility and workload. Add transactional allocation constraints and idempotency. Test overnight shifts, competing requests and historical assignment preservation.
5. **Equipment/attendance:** assets, custody, roster-generated handovers, participant confirmations, incidents and immutable correction evidence. Preserve agreed device-time punctuality separately from server receipt time. Test both confirmation orders, stale corrections and retries after unknown commit.
6. **Break management:** real adapter, server allowance/timers, extra approvals, effective-dated policies, durable shift-end closure and versioned review. Enforce one active session and one-use approval consumption. Only reviewed confirmed violations may escalate.
7. **Disciplinary:** evidence, independent assigned approval, versioned worker responses, findings, warnings and appeals. Test every forbidden transition and self-approval. Retention must be decided before purging evidence.
8. **Reporting/delivery:** authorized asynchronous CSV/XLSX, protected object storage, photos, outbox/email, deduplicated delivery and visible failures. Migrate historical leave usage and resolve absence-period rules before publishing authoritative balances.
9. **Production:** real PostgreSQL migration/race/load tests, HTTPS/proxy configuration, least-privilege database credentials, distributed login throttling if multiple instances are deployed, scheduled session cleanup, monitoring and backup/restore drill. Confirm concurrency, retention and recovery targets from discovery.

## Verification and limitations

The HTTP/SQL integration suite runs the actual Express app against embedded PostgreSQL (PGlite). It does not establish real PostgreSQL transport/TLS, advisory migration locking, multi-client concurrency or backup recovery. A deployed PostgreSQL service was not available through psql/Docker on this host during implementation.

The frontend now connects the supported foundation through cookie/CSRF HTTP requests; see [frontend connection](04-frontend-connection.md). Unsupported operational workflows are blocked, and legacy detailed pages are retained in source for later integration. This foundation does not implement the entire operational backend. No production deployment is performed. In-flight authorized requests may finish when access is revoked; new requests refresh session/grants from the database. Stronger per-transition authorization checks belong in sensitive approval services as they are built.

## Technical references

[Express async error handling](https://expressjs.com/en/5x/guide/error-handling/) supports central handling of rejected route promises. [node-postgres transactions](https://node-postgres.com/features/transactions) requires transaction work to use one checked-out client, as this implementation does.
