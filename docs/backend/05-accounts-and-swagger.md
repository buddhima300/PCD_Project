# Adding people, creating logins and using Swagger

## If you do not have a real account administrator

The old demo credentials do not authenticate against PostgreSQL. Create a real Supervisor with your own name, email and password from a trusted backend terminal. This also works when users already exist; the original bootstrap command only works on an empty users table.

1. Set SUPERVISOR_NAME, SUPERVISOR_EMAIL and SUPERVISOR_PASSWORD to your real details in `backend/.env`. Passwords must be 12–128 characters.
2. With PostgreSQL running and migrations applied, run `npm run supervisor:create` from `backend/`.
3. Open http://localhost:5173/login and sign in with that email/password.
4. Remove SUPERVISOR_PASSWORD from `.env` afterward.

The command creates a new Supervisor with account management and audit access. It records a local provisioning audit action. It does not seed sample people, replace users, reset passwords, or change permissions on an existing email. Duplicate email is rejected. There is no public unauthenticated administrator-creation endpoint.

## Add another Supervisor

1. Sign in as an account administrator.
2. Open your name menu -> **Account management · Add Supervisor**, or visit `/settings`.
3. Under **Add Supervisor**, enter the real person's name, work email and initial password.
4. Select **Allow this Supervisor to add and manage login accounts** if they need this authority. Audit access is a separate checkbox. Leave these unchecked for an operational Supervisor without sensitive grants.
5. Select **Create supervisor account**.

The new Supervisor signs in at the same `/login` page with their email and initial password. No worker number, department, internal worker ID or separate backend login is needed. Sensitive permissions are granted explicitly by an authorized administrator.

## Add an Employee or Freelancer with a login

1. Open your name menu -> **Add employee or freelancer**, or visit `/register`.
2. Enter their worker number, real name, email, worker type, department and joining date.
3. Set an initial password of 12–128 characters.
4. Select **Create worker and login**.

The workforce record and linked account are saved in one PostgreSQL transaction. Failure rolls back both changes. You do not need to copy IDs or create a second record manually. Employee/Freelancer accounts cannot receive supervisor management grants.

Share the work email and initial password privately. The worker opens http://localhost:5173/login and signs in with those credentials. The server determines their role from the saved account. They can change their password under **My profile**, which signs them out of all sessions. No invitation email is sent by this implementation.

## Workers registered earlier without logins

In `/settings`, find **Existing workers without a login**. Select **Create login** beside the correct name/worker number, enter an initial password, and select **Create worker login**. The saved name, email and type are used automatically. Suspended/inactive and already linked workers are excluded. The list is paginated; no UUID entry is needed.

## Insert data through Swagger UI

1. Restart the backend after the code/configuration update.
2. Open http://localhost:3001/api-docs/ at the exact API_ORIGIN. Development defaults to `http://localhost:3001`.
3. Expand **Authentication -> POST /api/v1/auth/login**, select **Try it out**, enter your real email/password, and select **Execute**. Expect HTTP 200.
4. Expand **Accounts -> POST /api/v1/accounts**, select **Try it out**, and choose the Supervisor, Employee, Freelancer or ExistingWorker request example. Replace example details with real names, email addresses, passwords and worker numbers.
5. Select **Execute**. HTTP 201 confirms creation. Other implemented creation endpoints work the same way.

You do not need to copy the HttpOnly cookie or CSRF token into Authorize. The browser retains the cookie; a request interceptor obtains the current session CSRF token before each authenticated write. Reloaded docs work while the session remains valid. Execute POST `/auth/logout` when done.

API_ORIGIN and FRONTEND_ORIGIN are exact trusted origins. Missing/foreign Origin, missing CSRF, expired sessions and insufficient permissions still fail. Set API_ORIGIN and restart if using a different host/port. Production API_ORIGIN must use HTTPS; if omitted in production, the API host is not implicitly trusted for Swagger writes. Do not use wildcard origins to solve errors.

## Verification

Backend tests cover Employee/Freelancer onboarding, Supervisor grants, rollback, denied grant escalation, and origin/CSRF enforcement. The browser test clicks real Swagger Try it out/Execute controls, logs in as a newly created Supervisor, creates a linked Freelancer, then logs in as that Freelancer. It also exercises one-step Employee onboarding and existing-worker login selection in the app.

Swagger uses the documented [request interceptor and credential options](https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/). Tests use isolated embedded PostgreSQL; they do not create users in your configured database.
