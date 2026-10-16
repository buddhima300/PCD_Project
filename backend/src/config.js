import { z } from 'zod';

export function readConfig(env = process.env) {
  const config = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.string().min(1),
    FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
    API_ORIGIN: z.string().url().optional(),
    SESSION_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  }).parse(env);
  if (new URL(config.FRONTEND_ORIGIN).origin !== config.FRONTEND_ORIGIN) {
    throw new Error('FRONTEND_ORIGIN must be an origin without a path or trailing slash.');
  }
  if (config.NODE_ENV === 'production' && !config.FRONTEND_ORIGIN.startsWith('https://')) {
    throw new Error('Production FRONTEND_ORIGIN must use HTTPS.');
  }
  config.API_ORIGIN ??= config.NODE_ENV === 'production' ? undefined : `http://localhost:${config.PORT}`;
  if (config.API_ORIGIN && (new URL(config.API_ORIGIN).origin !== config.API_ORIGIN || (config.NODE_ENV === 'production' && !config.API_ORIGIN.startsWith('https://')))) {
    throw new Error('API_ORIGIN must be an exact origin without a path, and must use HTTPS in production.');
  }
  return config;
}
