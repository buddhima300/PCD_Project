import { ApiError } from '../../shared/errors.js';
import { digest, equal } from '../../shared/security.js';
import { grants, publicUser } from './auth.model.js';

export function authenticate(db, cookieName) {
  return async (req, _res, next) => {
    const token = req.cookies[cookieName];
    if (typeof token !== 'string' || token.length > 128) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    const tokenHash = digest(token);
    const record = (await db.query('SELECT u.*,s.csrf_token FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status=$2', [tokenHash, 'ACTIVE'])).rows[0];
    if (!record) throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired. Sign in again.');
    req.auth = { user: publicUser(record), tokenHash, csrfToken: record.csrf_token, permissions: await grants(db, record.id) };
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !equal(req.get('X-CSRF-Token'), record.csrf_token)) {
      throw new ApiError(403, 'CSRF', 'A valid session CSRF token is required.');
    }
    next();
  };
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.auth.user.role)) throw new ApiError(403, 'FORBIDDEN', 'Your role cannot perform this operation.');
  next();
};
export const requirePermission = permission => (req, _res, next) => {
  if (req.auth.user.role !== 'SUPERVISOR' || !req.auth.permissions.includes(permission)) throw new ApiError(403, 'FORBIDDEN', 'The required permission has not been granted.');
  next();
};
