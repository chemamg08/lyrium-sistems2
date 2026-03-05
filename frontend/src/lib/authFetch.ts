/**
 * Authenticated fetch wrapper that automatically adds JWT Bearer token
 * to all requests. Falls back to regular fetch if no token is available.
 */
export function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = sessionStorage.getItem('authToken');
  
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Check if user is authenticated (has a valid token stored)
 */
export function isAuthenticated(): boolean {
  return !!sessionStorage.getItem('authToken');
}

/**
 * Clear auth data and redirect to login
 */
export function logout(): void {
  sessionStorage.clear();
  window.location.href = '/login';
}
