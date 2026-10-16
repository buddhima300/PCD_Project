import { ApiError } from './errors';
import type { SessionUser } from '../types/domain';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '');
let csrfToken: string | null = null;
let generation = 0;
const pending = new Set<AbortController>();
export const SESSION_EXPIRED = 'pcd-session-expired';
export const SESSION_STORAGE_KEY = 'pcd-session-changed';
export function announceSessionChange() {
  try { localStorage.setItem(SESSION_STORAGE_KEY, crypto.randomUUID()); } catch { /* Storage is optional; focus and server 401 still revalidate identity. */ }
}
export interface ServerSession { user: SessionUser; permissions: string[]; csrfToken: string }

export function clearTransportSession() {
  generation++;
  csrfToken = null;
  pending.forEach(controller => controller.abort());
  pending.clear();
}

export async function request<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const epoch = generation;
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  pending.add(controller);
  const method = options.method ?? 'GET';
  try {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (!['GET', 'HEAD'].includes(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken;
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method, headers, credentials: 'include', signal: controller.signal,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (epoch !== generation) throw new ApiError('SESSION_CHANGED', 'The signed-in account changed. Reload this view.', 401);
    let data: unknown;
    if (response.status !== 204) {
      try { data = await response.json(); }
      catch { throw new ApiError('INVALID_RESPONSE', 'The backend returned an invalid response. Check the API URL and development proxy.', response.status); }
    }
    if (!response.ok) {
      const payload = data as { error?: { code?: string; message?: string } };
      const error = new ApiError(payload?.error?.code ?? 'REQUEST_FAILED', payload?.error?.message ?? 'The backend request failed.', response.status);
      if (response.status === 401 && path !== '/auth/login') {
        clearTransportSession();
        window.dispatchEvent(new Event(SESSION_EXPIRED));
      }
      throw error;
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new ApiError('REQUEST_CANCELLED', 'Request cancelled. Refresh to confirm the latest state before retrying a change.', 0);
    throw new ApiError('NETWORK_FAILURE', method === 'GET' ? 'Cannot reach the backend. Check that it is running and try again.' : 'The server response was lost. Refresh to confirm whether the change was saved before trying again.', 0);
  } finally {
    pending.delete(controller);
    options.signal?.removeEventListener('abort', abort);
  }
}

export async function restoreSession(): Promise<ServerSession> {
  const session = await request<ServerSession>('/auth/me');
  csrfToken = session.csrfToken;
  return session;
}

export async function login(email: string, password: string): Promise<ServerSession> {
  clearTransportSession();
  const session = await request<ServerSession>('/auth/login', { method: 'POST', body: { email, password } });
  csrfToken = session.csrfToken;
  announceSessionChange();
  return session;
}

export async function logout() {
  try { await request<void>('/auth/logout', { method: 'POST' }); }
  catch (error) { if (!(error instanceof ApiError) || error.status !== 401) throw error; }
  clearTransportSession();
  announceSessionChange();
}

export function queryString(values: Record<string, unknown>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== '' && value !== undefined && value !== null) params.set(key, String(value)); });
  return params.size ? `?${params}` : '';
}
