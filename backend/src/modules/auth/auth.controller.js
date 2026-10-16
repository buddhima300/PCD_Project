import { z } from 'zod';
import { email, password } from '../../shared/validation.js';

export function authController(service, config, cookieName) {
  const cookieOptions = { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'strict', path: '/' };
  return {
    async login(req, res) {
      const input = z.object({ email, password: z.string().min(1).max(128) }).strict().parse(req.body);
      const result = await service.login(input.email, input.password, req.cookies[cookieName]);
      res.cookie(cookieName, result.token, { ...cookieOptions, maxAge: config.SESSION_HOURS * 3600000 });
      res.json({ user: result.user, permissions: result.permissions, csrfToken: result.csrfToken });
    },
    me(req, res) { res.json({ user: req.auth.user, permissions: req.auth.permissions, csrfToken: req.auth.csrfToken }); },
    async logout(req, res) {
      await service.logout(req.auth);
      res.clearCookie(cookieName, cookieOptions).status(204).end();
    },
    async changePassword(req, res) {
      const input = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }).strict().parse(req.body);
      await service.changePassword(req.auth, input.currentPassword, input.newPassword);
      res.clearCookie(cookieName, cookieOptions).status(204).end();
    },
  };
}
