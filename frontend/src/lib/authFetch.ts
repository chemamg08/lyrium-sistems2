const API_URL = import.meta.env.VITE_API_URL;

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/accounts/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Authenticated fetch wrapper that uses httpOnly cookies.
 * Automatically refreshes the access token on 401.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});

  let response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  // If 401 (token expired), try refreshing
  if (response.status === 401) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = tryRefreshToken();
    }

    const refreshed = await refreshPromise;
    isRefreshing = false;
    refreshPromise = null;

    if (refreshed) {
      // Retry original request with new token
      response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });
    }
  }

  return response;
}

/**
 * Check if user is authenticated (has session data stored)
 */
export function isAuthenticated(): boolean {
  return !!sessionStorage.getItem('userId');
}

/**
 * Clear auth data and redirect to login
 */
export function logout(): void {
  // Call backend to clear httpOnly cookie
  fetch(`${API_URL}/accounts/logout`, {
    method: 'POST',
    credentials: 'include',
  }).finally(() => {
    sessionStorage.clear();
    window.location.href = '/login';
  });
}
