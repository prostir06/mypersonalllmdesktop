import axios from 'axios';
import { toast } from 'react-toastify';
import type { AuthRefreshResponse } from '../../types/api';
import { setAccessToken } from '../authToken';

export const API_URL = import.meta.env.VITE_API_URL || '/api';

let refreshPromise: Promise<string> | null = null;

/** Clear token, toast, redirect to login (no-op on auth pages). */
function notifySessionExpired(): void {
  setAccessToken(null);
  const onAuthPage = ['/login', '/register'].includes(window.location.pathname);
  if (!onAuthPage) {
    toast.warn('Сесія закінчилася. Будь ласка, увійдіть знову.');
    setTimeout(() => {
      window.location.href = '/login';
    }, 1500);
  }
}

/**
 * Single-flight refresh: concurrent callers share one POST /auth/refresh.
 * On failure clears the access token and rejects (caller may rethrow).
 */
export function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = axios
    .post<AuthRefreshResponse>(`${API_URL}/auth/refresh`, {}, { withCredentials: true })
    .then(({ data }) => {
      setAccessToken(data.token);
      return data.token;
    })
    .catch((err: unknown) => {
      notifySessionExpired();
      throw err;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}
