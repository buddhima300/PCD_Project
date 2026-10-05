import type { Role } from '../../types/domain';

export const mockConfig = { latencyMs: 320, simulateNetworkFailure: false };

export class ApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, string | number>;
  constructor(code: string, message: string, status = 400, details?: Record<string, string | number>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

let auth: {role: Role;userId: string;name: string;} | null = null;

export function setAuthContext(a: {role: Role;userId: string;name: string;} | null): void {
  auth = a;
}

export function currentAuth(): {role: Role;userId: string;name: string;} {
  if (!auth) throw new ApiError('UNAUTHENTICATED', 'Your session has expired. Sign in again.', 401);
  return auth;
}

export function requireRole(...roles: Role[]) {
  const a = currentAuth();
  if (!roles.includes(a.role)) {
    throw new ApiError('FORBIDDEN', 'Your role is not permitted to perform this operation.', 403);
  }
  return a;
}

export function respond<T>(fn: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const delay = mockConfig.latencyMs * (0.6 + Math.random() * 0.8);
    setTimeout(() => {
      if (mockConfig.simulateNetworkFailure) {
        reject(new ApiError('NETWORK_FAILURE', 'Unable to reach the Relay operations API. Check your connection and retry.', 0));
        return;
      }
      try {
        resolve(structuredClone(fn()));
      } catch (e) {
        reject(e);
      }
    }, delay);
  });
}