import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { authenticate, requireRole, requirePermission } from './modules/auth/auth.middleware.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { authController } from './modules/auth/auth.controller.js';
import { accountsService, accountInput, accountChange } from './modules/accounts/accounts.service.js';
import { workforceService } from './modules/workforce/workforce.service.js';
import { workforceController } from './modules/workforce/workforce.controller.js';
import { platformsService } from './modules/platforms/platforms.service.js';
import { platformsController } from './modules/platforms/platforms.controller.js';
import { pagination, uuid } from './shared/validation.js';
import { ApiError } from './shared/errors.js';
import { operationsRoutes } from './modules/operations/routes.js';
import { registerStaff, registrationInput } from './modules/workforce/registration.service.js';

export function routes(db, config, cookieName) {
  const router = Router();
  const auth = authController(createAuthService(db, config), config, cookieName);
  const accounts = accountsService(db);
  const workforce = workforceController(db, workforceService(db));
  const platforms = platformsController(db, platformsService(db));
  const supervisor = requireRole('SUPERVISOR');
  /**
   * @openapi
   * /api/v1/auth/login:
   *   post:
   *     tags: [Authentication]
   *     summary: Sign in and create a cookie session
   *     description: Requires the configured frontend or API Origin. Limited to 20 attempts per IP per 15 minutes. Client-supplied roles are rejected. Swagger stores the session cookie for subsequent requests.
   *     security: []
   *     requestBody: {$ref: '#/components/requestBodies/Login'}
   *     responses:
   *       '200': {$ref: '#/components/responses/Session'}
   *       default: {$ref: '#/components/responses/Error'}
   */
  router.post('/auth/login', rateLimit({ windowMs: 15 * 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'RATE_LIMIT', message: 'Too many sign-in attempts. Try again later.' } } }), auth.login);
  router.use(authenticate(db, cookieName));
  /**
   * @openapi
   * /api/v1/staff/register:
   *   post:
   *     tags: [Workforce]
   *     summary: Register staff and login from the existing workforce intake form
   *     description: Requires accounts.manage. Atomically creates the candidate, workforce record, login and ownership link, preserving the placement/training workflow.
   *     security: [{sessionCookie: [], csrfToken: []}]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             additionalProperties: false
   *             required: [name, email, password, dept, employmentType, position, interviewResult]
   *             properties:
   *               name: {type: string, maxLength: 200}
   *               email: {type: string, format: email}
   *               password: {type: string, minLength: 12, maxLength: 128, writeOnly: true}
   *               phone: {type: string, maxLength: 50}
   *               dept: {type: string, enum: [GS, DP, WD, SAFETY]}
   *               employmentType: {type: string, enum: [PERMANENT, FREELANCER]}
   *               position: {type: string}
   *               interviewResult: {type: string, enum: [SELECTED, RECOMMENDED, PENDING]}
   *               notes: {type: string, maxLength: 2000}
   *     responses:
   *       '201': {description: Staff, candidate, login and mapping committed together. No credentials are returned.}
   *       default: {$ref: '#/components/responses/Error'}
   */
  router.post('/staff/register', requirePermission('accounts.manage'), async (req,res) => res.status(201).json(await registerStaff(db,req.auth.user,registrationInput.parse(req.body))));
  /**
   * @openapi
   * /api/v1/operations/{group}/{method}:
   *   post:
   *     tags: [Operations]
   *     summary: Execute an original frontend workflow against PostgreSQL
   *     description: Uses server identity and module role/owner checks. Demo login and configuration controls are excluded. Query and command operations use the existing positional frontend contracts, with atomic database persistence.
   *     security: [{sessionCookie: [], csrfToken: []}]
   *     parameters:
   *       - {in: path, name: group, required: true, schema: {type: string, enum: [workflows, breaks]}}
   *       - {in: path, name: method, required: true, schema: {type: string}}
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [args]
   *             additionalProperties: false
   *             properties:
   *               args: {type: array, maxItems: 12, items: {}}
   *           example: {args: [{month: '2026-09'}]}
   *     responses:
   *       '200': {description: Original frontend response contract; committed before responding.}
   *       default: {$ref: '#/components/responses/Error'}
   * /api/v1/operations/links:
   *   get:
   *     tags: [Accounts]
   *     summary: List login mappings and available operational workers (accounts.manage)
   *     responses:
   *       '200': {description: Accounts with current mappings and workforce choices.}
   *       default: {$ref: '#/components/responses/Error'}
   * /api/v1/operations/links/{userId}:
   *   put:
   *     tags: [Accounts]
   *     summary: Link an employee or freelancer login to a worker and revoke its sessions
   *     security: [{sessionCookie: [], csrfToken: []}]
   *     parameters:
   *       - {in: path, name: userId, required: true, schema: {type: string, format: uuid}}
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: {type: object, required: [workerId], additionalProperties: false, properties: {workerId: {type: string}}}
   *     responses:
   *       '204': {description: Mapping saved. The user must log in again.}
   *       default: {$ref: '#/components/responses/Error'}
   */
  router.use('/operations', operationsRoutes(db));
  /**
   * @openapi
   * /api/v1/auth/me:
   *   get:
   *     tags: [Authentication]
   *     summary: Restore current identity, grants and CSRF token
   *     responses:
   *       '200': {$ref: '#/components/responses/Session'}
   *       default: {$ref: '#/components/responses/Error'}
   */
  router.get('/auth/me', auth.me);
  /**
   * @openapi
   * /api/v1/auth/logout:
   *   post:
   *     tags: [Authentication]
   *     summary: Revoke the current session and clear its cookie
   *     security: [{sessionCookie: [], csrfToken: []}]
   *     responses:
   *       '204': {description: Session revoked. No response body.}
   *       default: {$ref: '#/components/responses/Error'}
   */
  router.post('/auth/logout', auth.logout);
  /**
   * @openapi
   * /api/v1/auth/change-password:
   *   post:
   *     tags: [Authentication]
   *     summary: Change own password and revoke all account sessions
   *     security: [{sessionCookie: [], csrfToken: []}]
   *     requestBody: {$ref: '#/components/requestBodies/ChangePassword'}
   *     responses:
   *       '204': {description: Password changed. Sign in again.}
   *       default: {$ref: '#/components/responses/Error'}
   */
  router.post('/auth/change-password', auth.changePassword);
  /**
   * @openapi
   * /api/v1/accounts:
   *   get:
   *     tags: [Accounts]
   *     summary: List accounts (Supervisor with accounts.manage)
   *     parameters:
   *       - {$ref: '#/components/parameters/Page'}
   *       - {$ref: '#/components/parameters/PageSize'}
   *     responses:
   *       '200': {$ref: '#/components/responses/Page'}
   *       default: {$ref: '#/components/responses/Error'}
   *   post:
   *     tags: [Accounts]
   *     summary: Provision an account (Supervisor with accounts.manage)
   *     description: Create a Supervisor without worker fields; optional explicit permissions grant account management or audit access. For an Employee/Freelancer, provide either a matching nested worker to register both atomically, or workerId for an existing eligible unlinked worker. Employee/Freelancer accounts cannot receive management grants. Login uses the supplied email and initial password immediately. No invitation email is sent.
   *     security: [{sessionCookie: [], csrfToken: []}]
   *     requestBody: {$ref: '#/components/requestBodies/CreateAccount'}
   *     responses:
   *       '201':
   *         description: Account provisioned.
   *         content:
   *           application/json:
   *             schema: {$ref: '#/components/schemas/User'}
   *       default: {$ref: '#/components/responses/Error'}
   */
  router.get('/accounts', requirePermission('accounts.manage'), async (req,res) => {
    const { page,pageSize } = pagination.parse(req.query);
    const items = (await db.query('SELECT id,email,name,title,role,status,created_at FROM users ORDER BY created_at,id LIMIT $1 OFFSET $2',[pageSize,(page-1)*pageSize])).rows;
    const total = Number((await db.query('SELECT count(*) AS total FROM users')).rows[0].total);
    res.json({ items,total,page,pageSize });
  });
  router.post('/accounts', requirePermission('accounts.manage'), async (req,res) => res.status(201).json(await accounts.create(req.auth.user, accountInput.parse(req.body))));
  router.patch('/accounts/:id/access', requirePermission('accounts.manage'), async (req,res) => res.json(await accounts.change(req.auth.user, uuid.parse(req.params.id), accountChange.parse(req.body))));
  /**
   * @openapi
   * /api/v1/accounts/{id}/access:
   *   patch:
   *     tags: [Accounts]
   *     summary: Update access (Supervisor with accounts.manage)
   *     description: Cannot change own access. Revokes target sessions. Worker suspension prevents unlocking. At least one active account administrator must remain.
   *     security: [{sessionCookie: [], csrfToken: []}]
   *     parameters:
   *       - {$ref: '#/components/parameters/Id'}
   *     requestBody: {$ref: '#/components/requestBodies/AccountAccess'}
   *     responses:
   *       '200':
   *         description: Account access updated.
   *         content:
   *           application/json:
   *             schema: {$ref: '#/components/schemas/User'}
   *       default: {$ref: '#/components/responses/Error'}
   * /api/v1/workers:
   *   get:
   *     tags: [Workforce]
   *     summary: List all workers for Supervisors or own linked record for staff
   *     parameters:
   *       - name: workerType
   *         in: query
   *         schema: {type: string, enum: [EMPLOYEE, FREELANCER]}
   *       - name: unlinked
   *         in: query
   *         description: Return eligible registered workers who do not yet have a login.
   *         schema: {type: boolean, default: false}
   *       - {$ref: '#/components/parameters/Page'}
   *       - {$ref: '#/components/parameters/PageSize'}
   *     responses:
   *       '200': {$ref: '#/components/responses/Page'}
   *       default: {$ref: '#/components/responses/Error'}
   *   post:
   *     tags: [Workforce]
   *     summary: Register an operational worker (Supervisor)
   *     description: Creates an onboarding worker record without a login account.
   *     security: [{sessionCookie: [], csrfToken: []}]
   *     requestBody: {$ref: '#/components/requestBodies/CreateWorker'}
   *     responses:
   *       '201': {$ref: '#/components/responses/Created'}
   *       default: {$ref: '#/components/responses/Error'}
   */
  router.get('/workers', workforce.list);
  router.post('/workers', supervisor, workforce.create);
  router.patch('/workers/:id/status', supervisor, workforce.status);
  /**
   * @openapi
   * /api/v1/workers/{id}/status:
   *   patch:
   *     tags: [Workforce]
   *     summary: Change worker status (Supervisor)
   *     description: Requires current revision and reason. Suspension/inactivation locks the linked account and revokes sessions. Reactivation does not unlock the account automatically.
   *     security: [{sessionCookie: [], csrfToken: []}]
   *     parameters:
   *       - {$ref: '#/components/parameters/Id'}
   *     requestBody: {$ref: '#/components/requestBodies/WorkerStatus'}
   *     responses:
   *       '200': {$ref: '#/components/responses/Record'}
   *       default: {$ref: '#/components/responses/Error'}
   * /api/v1/departments:
   *   get:
   *     tags: [Platforms]
   *     summary: List department reference data (Supervisor)
   *     responses:
   *       '200':
   *         description: Department reference records, without pagination.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 items:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       code: {type: string}
   *                       name: {type: string}
   *       default: {$ref: '#/components/responses/Error'}
   */
  router.get('/departments', supervisor, async (_req,res) => res.json({ items: (await db.query('SELECT * FROM departments ORDER BY code')).rows }));
  /**
   * @openapi
   * /api/v1/platform-categories:
   *   get:
   *     tags: [Platforms]
   *     summary: List categories (Supervisor)
   *     parameters:
   *       - {$ref: '#/components/parameters/Page'}
   *       - {$ref: '#/components/parameters/PageSize'}
   *     responses:
   *       '200': {$ref: '#/components/responses/Page'}
   *       default: {$ref: '#/components/responses/Error'}
   *   post:
   *     tags: [Platforms]
   *     summary: Create a category (Supervisor)
   *     security: [{sessionCookie: [], csrfToken: []}]
   *     requestBody: {$ref: '#/components/requestBodies/CreateCategory'}
   *     responses:
   *       '201': {$ref: '#/components/responses/Created'}
   *       default: {$ref: '#/components/responses/Error'}
   */
  router.get('/platform-categories', supervisor, platforms.categories);
  router.post('/platform-categories', supervisor, platforms.category);
  /**
   * @openapi
   * /api/v1/platforms:
   *   get:
   *     tags: [Platforms]
   *     summary: List platforms (Supervisor)
   *     parameters:
   *       - {$ref: '#/components/parameters/Page'}
   *       - {$ref: '#/components/parameters/PageSize'}
   *     responses:
   *       '200': {$ref: '#/components/responses/Page'}
   *       default: {$ref: '#/components/responses/Error'}
   *   post:
   *     tags: [Platforms]
   *     summary: Create an inactive SETUP platform (Supervisor)
   *     security: [{sessionCookie: [], csrfToken: []}]
   *     requestBody: {$ref: '#/components/requestBodies/CreatePlatform'}
   *     responses:
   *       '201': {$ref: '#/components/responses/Created'}
   *       default: {$ref: '#/components/responses/Error'}
   */
  router.get('/platforms', supervisor, platforms.list);
  router.post('/platforms', supervisor, platforms.create);
  /**
   * @openapi
   * /api/v1/platforms/{id}/capacity:
   *   put:
   *     tags: [Platforms]
   *     summary: Configure SETUP platform capacity (Supervisor)
   *     description: Revision checked. Only supplied departments are upserted. Operational platforms reject capacity changes until reservation-aware checks are implemented.
   *     security: [{sessionCookie: [], csrfToken: []}]
   *     parameters:
   *       - {$ref: '#/components/parameters/Id'}
   *     requestBody: {$ref: '#/components/requestBodies/Capacity'}
   *     responses:
   *       '200': {$ref: '#/components/responses/Record'}
   *       default: {$ref: '#/components/responses/Error'}
   * /api/v1/platforms/{id}/activate:
   *   post:
   *     tags: [Platforms]
   *     summary: Activate a platform (Supervisor)
   *     description: Requires current revision and positive configured seats. Staffing gaps do not block activation.
   *     security: [{sessionCookie: [], csrfToken: []}]
   *     parameters:
   *       - {$ref: '#/components/parameters/Id'}
   *     requestBody: {$ref: '#/components/requestBodies/Activate'}
   *     responses:
   *       '200': {$ref: '#/components/responses/Record'}
   *       default: {$ref: '#/components/responses/Error'}
   */
  router.put('/platforms/:id/capacity', supervisor, platforms.configure);
  router.post('/platforms/:id/activate', supervisor, platforms.activate);
  /**
   * @openapi
   * /api/v1/notifications:
   *   get:
   *     tags: [Notifications]
   *     summary: List own notifications
   *     parameters:
   *       - name: unreadOnly
   *         in: query
   *         schema: {type: boolean, default: false}
   *       - {$ref: '#/components/parameters/Page'}
   *       - {$ref: '#/components/parameters/PageSize'}
   *     responses:
   *       '200': {$ref: '#/components/responses/Page'}
   *       default: {$ref: '#/components/responses/Error'}
   * /api/v1/notifications/{id}/read:
   *   patch:
   *     tags: [Notifications]
   *     summary: Mark an own notification read
   *     description: Repeat acknowledgment preserves the first read time. Other recipients' IDs return 404.
   *     security: [{sessionCookie: [], csrfToken: []}]
   *     parameters:
   *       - {$ref: '#/components/parameters/Id'}
   *     requestBody: {$ref: '#/components/requestBodies/Empty'}
   *     responses:
   *       '200': {$ref: '#/components/responses/Record'}
   *       default: {$ref: '#/components/responses/Error'}
   */
  router.get('/notifications', async (req,res) => {
    const {page,pageSize} = pagination.parse(req.query);
    const { unreadOnly } = z.object({ unreadOnly: z.enum(['true','false']).default('false') }).parse(req.query);
    const unread = unreadOnly === 'true' ? ' AND read_at IS NULL' : '';
    const items = (await db.query(`SELECT * FROM notifications WHERE recipient_id=$1${unread} ORDER BY created_at DESC,id LIMIT $2 OFFSET $3`,[req.auth.user.id,pageSize,(page-1)*pageSize])).rows;
    const total = Number((await db.query(`SELECT count(*) AS total FROM notifications WHERE recipient_id=$1${unread}`,[req.auth.user.id])).rows[0].total);
    res.json({items,total,page,pageSize});
  });
  router.patch('/notifications/:id/read', async (req,res) => {
    z.object({}).strict().parse(req.body);
    const result = await db.query('UPDATE notifications SET read_at=coalesce(read_at,now()) WHERE id=$1 AND recipient_id=$2 RETURNING *',[uuid.parse(req.params.id),req.auth.user.id]);
    if (!result.rows[0]) throw new ApiError(404,'NOT_FOUND','Notification not found.');
    res.json(result.rows[0]);
  });
  /**
   * @openapi
   * /api/v1/audit:
   *   get:
   *     tags: [Audit]
   *     summary: List audit events (Supervisor with audit.read)
   *     parameters:
   *       - {$ref: '#/components/parameters/Page'}
   *       - {$ref: '#/components/parameters/PageSize'}
   *     responses:
   *       '200': {$ref: '#/components/responses/Page'}
   *       default: {$ref: '#/components/responses/Error'}
   */
  router.get('/audit', requirePermission('audit.read'), async (req,res) => {
    const {page,pageSize} = pagination.parse(req.query);
    const items = (await db.query('SELECT * FROM audit_events ORDER BY created_at DESC,id LIMIT $1 OFFSET $2',[pageSize,(page-1)*pageSize])).rows;
    const total = Number((await db.query('SELECT count(*) AS total FROM audit_events')).rows[0].total);
    res.json({items,total,page,pageSize});
  });
  return router;
}
