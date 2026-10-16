import { ApiError } from '../../shared/errors.js';
import { digest, randomToken, hashPassword, verifyPassword } from '../../shared/security.js';
import { transaction } from '../../db/pool.js';
import { audit } from '../audit/audit.model.js';
import { userByEmail, publicUser, grants } from './auth.model.js';

export function createAuthService(db, config) {
  // Same expensive password verification for unknown addresses to reduce enumeration.
  const dummyHash = hashPassword(randomToken());
  return {
    async login(email, password, oldToken) {
      const candidate = await userByEmail(db, email);
      const valid = await verifyPassword(password, candidate?.password_hash ?? await dummyHash);
      if (!candidate || !valid || candidate.status !== 'ACTIVE') throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      return transaction(db, async client => {
        // Serialize login with password/account changes; recheck after hashing.
        const user = (await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [candidate.id])).rows[0];
        if (user.status !== 'ACTIVE' || user.password_hash !== candidate.password_hash) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
        const token = randomToken();
        const csrfToken = randomToken();
        if (oldToken) await client.query('DELETE FROM sessions WHERE token_hash=$1', [digest(oldToken)]);
        await client.query('DELETE FROM sessions WHERE expires_at <= now()');
        await client.query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+($4 * interval '1 hour'))", [digest(token), user.id, csrfToken, config.SESSION_HOURS]);
        await audit(client, user.id, 'LOGIN', 'user', user.id);
        return { token, csrfToken, user: publicUser(user), permissions: await grants(client, user.id) };
      });
    },
    async logout(auth) {
      await transaction(db, async client => {
        await client.query('DELETE FROM sessions WHERE token_hash=$1', [auth.tokenHash]);
        await audit(client, auth.user.id, 'LOGOUT', 'user', auth.user.id);
      });
    },
    async changePassword(auth, currentPassword, newPassword) {
      const replacement = await hashPassword(newPassword);
      await transaction(db, async client => {
        const user = (await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [auth.user.id])).rows[0];
        if (!await verifyPassword(currentPassword, user.password_hash)) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
        await client.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2', [replacement, user.id]);
        await client.query('DELETE FROM sessions WHERE user_id=$1', [user.id]);
        await audit(client, user.id, 'PASSWORD_CHANGED', 'user', user.id);
      });
    },
  };
}
