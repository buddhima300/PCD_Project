import { randomUUID } from 'node:crypto';
import { readConfig } from '../src/config.js';
import { createDatabase, transaction } from '../src/db/pool.js';
import { hashPassword } from '../src/shared/security.js';
import { email, password, text } from '../src/shared/validation.js';
import { audit } from '../src/modules/audit/audit.model.js';

const input = { email: email.parse(process.env.BOOTSTRAP_EMAIL), password: password.parse(process.env.BOOTSTRAP_PASSWORD), name: text.parse(process.env.BOOTSTRAP_NAME) };
const hash = await hashPassword(input.password);
const db = createDatabase(readConfig().DATABASE_URL);
try {
  await transaction(db,async client => {
    await client.query('LOCK TABLE users IN EXCLUSIVE MODE');
    if ((await client.query('SELECT 1 FROM users LIMIT 1')).rows.length) throw new Error('Bootstrap is allowed only on an empty users table. Use an authorized account administrator.');
    const id = randomUUID();
    await client.query("INSERT INTO users(id,email,name,title,role,password_hash) VALUES($1,$2,$3,'Account administrator','SUPERVISOR',$4)",[id,input.email,input.name,hash]);
    await client.query("INSERT INTO user_permissions(user_id,permission) VALUES($1,'accounts.manage'),($1,'audit.read')",[id]);
    await audit(client,id,'BOOTSTRAP_ACCOUNT_CREATED','user',id);
  });
  console.log('Initial Supervisor account created. Remove bootstrap credentials from .env.');
} finally { await db.end(); }
