import swaggerJsdoc from 'swagger-jsdoc';
import { fileURLToPath } from 'node:url';

const string = { type: 'string' };
const uuid = { type: 'string', format: 'uuid' };
const text = { type: 'string', minLength: 1, maxLength: 200 };
const email = { type: 'string', format: 'email', maxLength: 254 };
const password = { type: 'string', minLength: 12, maxLength: 128, writeOnly: true };
const revision = { type: 'integer', minimum: 1 };
const role = { type: 'string', enum: ['SUPERVISOR','EMPLOYEE','FREELANCER'] };
const department = { type: 'string', enum: ['GS','DP','WD','SAFETY'] };
const code = { type: 'string', minLength: 1, maxLength: 40, pattern: '^[A-Za-z0-9_-]+$', description: 'Normalized to uppercase.' };
const description = { type: 'string', maxLength: 2000, default: '' };
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const json = schema => ({ 'application/json': { schema } });

export function createOpenApi(config) {
  const schemas = {
    Login: object({ email, password: { type: 'string', minLength: 1, maxLength: 128, writeOnly: true } }),
    ChangePassword: object({ currentPassword: { type: 'string', minLength: 1, maxLength: 128, writeOnly: true }, newPassword: password }),
    CreateAccount: object({ email, password, name: text, title: text, role, workerId: uuid, worker: ref('CreateWorker'), permissions: { type: 'array', maxItems: 20, items: { type: 'string', enum: ['accounts.manage','audit.read','disciplinary.approve','breaks.policy','breaks.review','reports.export','attendance.correct'] }, default: [] } }, ['email','password','name','role']),
    AccountAccess: object({ status: { type: 'string', enum: ['ACTIVE','LOCKED'] }, permissions: { type: 'array', maxItems: 20, items: { type: 'string', enum: ['accounts.manage','audit.read','disciplinary.approve','breaks.policy','breaks.review','reports.export','attendance.correct'] } } }, ['status']),
    CreateWorker: object({ workerNumber: text, name: text, email, phone: { type: 'string', maxLength: 40, default: '' }, workerType: { type: 'string', enum: ['EMPLOYEE','FREELANCER'] }, departmentCode: department, position: { type: 'string', maxLength: 200, default: '' }, joinedAt: { type: 'string', format: 'date' } }, ['workerNumber','name','email','workerType','departmentCode','joinedAt']),
    WorkerStatus: object({ status: { type: 'string', enum: ['ACTIVE','ON_LEAVE','SUSPENDED','INACTIVE'] }, revision, reason: text }),
    CreateCategory: object({ code, name: text, description }, ['code','name']),
    CreatePlatform: object({ code, name: text, categoryId: uuid, description }, ['code','name','categoryId']),
    Capacity: object({ revision, departments: { type: 'array', minItems: 1, maxItems: 4, description: 'Unique departments. Each shift target must be no greater than seats. Only supplied departments are upserted.', items: object({ departmentCode: department, seats: { type: 'integer', minimum: 0, maximum: 10000 }, morningTarget: { type: 'integer', minimum: 0 }, nightTarget: { type: 'integer', minimum: 0 } }) } }),
    Activate: object({ revision }),
    Empty: object({}),
    User: object({ id: uuid, name: string, email, title: string, role, status: { type: 'string', enum: ['ACTIVE','LOCKED','INVITED'] } }),
    Session: object({ user: ref('User'), permissions: { type: 'array', items: string }, csrfToken: { type: 'string', description: 'Send as X-CSRF-Token on authenticated writes. Not a session cookie.' } }),
    Error: { type: 'object', properties: { error: { type: 'object', properties: { code: string, message: string, details: { type: 'array', items: object({ path: string, message: string }) } }, required: ['code','message'] }, requestId: string }, required: ['error'] },
    Record: { type: 'object', additionalProperties: true, description: 'Database record with snake_case fields. No password hashes or session credentials are returned.' },
    Page: object({ items: { type: 'array', items: ref('Record') }, total: { type: 'integer', minimum: 0 }, page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100 } }),
  };
  const spec = swaggerJsdoc({
    failOnErrors: true,
    definition: {
      openapi: '3.0.3',
      info: { title: 'PortCity Digital API', version: '0.1.0', description: 'Start by executing POST /api/v1/auth/login with your real account credentials. Swagger keeps the HttpOnly session cookie and automatically fetches/adds the session CSRF token to authenticated writes. Open these docs at the configured API_ORIGIN. To add a Supervisor, POST /accounts with role SUPERVISOR and no worker details. To register an Employee/Freelancer and their login together, supply matching nested worker details. All account creation requires accounts.manage; ordinary Supervisors cannot grant themselves access. Responses use snake_case database fields except the session DTO. Only implemented workflows are listed.' },
      servers: [{ url: '/', description: 'Current API host; paths include /api/v1' }],
      security: [{ sessionCookie: [] }],
      tags: ['Authentication','Accounts','Workforce','Platforms','Notifications','Audit','Health'].map(name => ({ name })),
      components: {
        schemas,
        securitySchemes: {
          sessionCookie: { type: 'apiKey', in: 'cookie', name: config.NODE_ENV === 'production' ? '__Host-pcd_session' : 'pcd_session', description: 'HttpOnly cookie set by login. Secure in production; SameSite=Strict. Not a bearer token.' },
          csrfToken: { type: 'apiKey', in: 'header', name: 'X-CSRF-Token', description: 'Swagger adds this automatically after cookie login. Other HTTP clients must use the token returned by login or GET /api/v1/auth/me.' },
        },
        parameters: {
          Id: { name: 'id', in: 'path', required: true, schema: uuid },
          Page: { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          PageSize: { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
        },
        requestBodies: Object.fromEntries(['Login','ChangePassword','CreateAccount','AccountAccess','CreateWorker','WorkerStatus','CreateCategory','CreatePlatform','Capacity','Activate','Empty'].map(name => [name, { required: true, content: json(ref(name)) }])),
        responses: {
          Error: { description: 'Request rejected. 400 malformed JSON; 401 invalid/expired session; 403 permission, Origin or CSRF; 404 missing record; 409 duplicate/stale/state conflict; 413 oversized body; 422 invalid input; 429 throttled login; 500 internal failure. Error details never expose SQL or credentials.', content: json(ref('Error')) },
          Page: { description: 'Bounded page of authorized records.', content: json(ref('Page')) },
          Record: { description: 'Authorized record. Database fields use snake_case.', content: json(ref('Record')) },
          Created: { description: 'Record created.', content: json(ref('Record')) },
          Session: { description: 'Trusted session identity, grants and CSRF token. Login also sets the HttpOnly session cookie.', content: json(ref('Session')) },
        },
      },
    },
    // Absolute paths keep generation independent of the process working directory, including Windows.
    apis: ['../routes.js','../app.js'].map(path => fileURLToPath(new URL(path,import.meta.url)).replaceAll('\\','/')),
  });
  spec.components.requestBodies.CreateAccount.content['application/json'].examples = {
    Supervisor: { summary: 'Add a Supervisor (replace details with the real person)', value: { name: 'Your Supervisor Name', email: 'supervisor@yourcompany.com', password: 'ChooseYourOwnPassword123!', role: 'SUPERVISOR', permissions: ['accounts.manage','audit.read'] } },
    Employee: { summary: 'Add employee and login in one transaction', value: { name: 'Your Employee Name', email: 'employee@yourcompany.com', password: 'ChooseYourOwnPassword123!', role: 'EMPLOYEE', worker: { workerNumber: 'EMP-001', name: 'Your Employee Name', email: 'employee@yourcompany.com', workerType: 'EMPLOYEE', departmentCode: 'DP', joinedAt: '2026-10-16' } } },
    Freelancer: { summary: 'Add freelancer and login in one transaction', value: { name: 'Your Freelancer Name', email: 'freelancer@yourcompany.com', password: 'ChooseYourOwnPassword123!', role: 'FREELANCER', worker: { workerNumber: 'FL-001', name: 'Your Freelancer Name', email: 'freelancer@yourcompany.com', workerType: 'FREELANCER', departmentCode: 'DP', joinedAt: '2026-10-16' } } },
    ExistingWorker: { summary: 'Create a login for a worker already registered', value: { name: 'Match the saved worker name', email: 'worker@yourcompany.com', password: 'ChooseYourOwnPassword123!', role: 'EMPLOYEE', workerId: '00000000-0000-4000-8000-000000000001' } },
  };
  return spec;
}
