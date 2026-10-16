export function resolveBreakConfig(env: { PROD: boolean; VITE_BREAK_ENABLED?: string; VITE_BREAK_ADAPTER?: string }) {
  const enabled = env.VITE_BREAK_ENABLED === 'true' || (!env.PROD && env.VITE_BREAK_ENABLED !== 'false');
  const adapter = env.VITE_BREAK_ADAPTER ?? 'real';
  return { enabled: enabled && !(env.PROD && adapter === 'mock'), adapter, production: env.PROD };
}
export const breakConfig = resolveBreakConfig(import.meta.env);
