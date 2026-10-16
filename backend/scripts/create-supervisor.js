import { readConfig } from '../src/config.js';
import { createDatabase } from '../src/db/pool.js';
import { accountInput, accountsService } from '../src/modules/accounts/accounts.service.js';

// Trusted local provisioning, not a public registration or password-reset endpoint.
const parsed = accountInput.safeParse({
  name: process.env.SUPERVISOR_NAME,
  email: process.env.SUPERVISOR_EMAIL,
  password: process.env.SUPERVISOR_PASSWORD,
  role: 'SUPERVISOR',
  permissions: ['accounts.manage','audit.read'],
});
if (!parsed.success) {
  console.error('Set SUPERVISOR_NAME, a valid SUPERVISOR_EMAIL and SUPERVISOR_PASSWORD (12–128 characters) in backend/.env. No account was created.');
  process.exitCode = 1;
} else {
 const db = createDatabase(readConfig().DATABASE_URL);
 try {
  await accountsService(db).create({ id: null }, parsed.data);
  console.log('Real Supervisor account created with account management and audit access. Sign in with the email/password you supplied. Remove SUPERVISOR_PASSWORD from .env.');
} catch (error) {
  if (error.code === '23505') console.error('An account with that email already exists. No password or permissions were changed.');
  else console.error('Supervisor creation failed. Verify database setup and configuration.');
  process.exitCode = 1;
} finally { await db.end(); }
}
