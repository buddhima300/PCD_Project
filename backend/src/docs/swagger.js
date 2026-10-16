// Serialized by swagger-ui-express and executed in the browser. Keep this function self-contained.
export async function swaggerRequestInterceptor(request) {
  const url = new URL(request.url, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/v1/')) return request;
  request.credentials = 'include';
  if (!['GET','HEAD','OPTIONS'].includes(request.method.toUpperCase()) && url.pathname !== '/api/v1/auth/login') {
    const response = await window.fetch('/api/v1/auth/me', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error('Sign in first: expand POST /api/v1/auth/login, select Try it out, enter your real email/password and Execute.');
    const session = await response.json();
    request.headers ??= {};
    request.headers['X-CSRF-Token'] = session.csrfToken;
  }
  return request;
}
