const API_URL = import.meta.env.VITE_API_URL;
const QUICK_ACCESS_KEY = 'lyrium_quick_access_until';

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  country?: string;
  type: 'main' | 'subaccount';
  role?: string;
  parentAccountId?: string;
  plan?: string;
  planDowngradedAt?: string | null;
}

export function setQuickAccessPreference(enabled: boolean): void {
  if (!enabled) {
    localStorage.removeItem(QUICK_ACCESS_KEY);
    return;
  }

  const expiresAt = Date.now() + 14 * 24 * 60 * 60 * 1000;
  localStorage.setItem(QUICK_ACCESS_KEY, String(expiresAt));
}

export function hasQuickAccessPreference(): boolean {
  const raw = localStorage.getItem(QUICK_ACCESS_KEY);
  if (!raw) return false;

  const expiresAt = Number(raw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    localStorage.removeItem(QUICK_ACCESS_KEY);
    return false;
  }

  return true;
}

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

export function persistUserSession(user: SessionUser): void {
  sessionStorage.setItem('userId', user.id);
  sessionStorage.setItem('userName', user.name);
  sessionStorage.setItem('userEmail', user.email);
  sessionStorage.setItem('userType', user.type);
  sessionStorage.setItem('country', user.country || 'ES');
  if (user.plan) {
    sessionStorage.setItem('plan', user.plan);
  } else {
    sessionStorage.removeItem('plan');
  }
  if (user.planDowngradedAt) {
    sessionStorage.setItem('planDowngradedAt', user.planDowngradedAt);
  } else {
    sessionStorage.removeItem('planDowngradedAt');
  }

  if (user.role === 'admin') {
    sessionStorage.setItem('userRole', 'admin');
    sessionStorage.setItem('accountId', user.id);
    sessionStorage.removeItem('parentAccountId');
    return;
  }

  sessionStorage.removeItem('userRole');

  if (user.type === 'subaccount' && user.parentAccountId) {
    sessionStorage.setItem('parentAccountId', user.parentAccountId);
    sessionStorage.setItem('accountId', user.parentAccountId);
  } else {
    sessionStorage.removeItem('parentAccountId');
    sessionStorage.setItem('accountId', user.id);
  }
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
    localStorage.removeItem(QUICK_ACCESS_KEY);
    sessionStorage.clear();
    window.location.href = '/login';
  });
}
