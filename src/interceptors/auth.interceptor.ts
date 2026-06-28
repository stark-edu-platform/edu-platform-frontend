import { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { getAccessToken, refreshSession } from '@/store/auth/session.client';
import { resetAllClientState } from '@/store/reset-registry';

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

// Exact-match set (no substring matching). These endpoints must never trigger a
// refresh-and-retry: refresh/logout are the refresh machinery itself, and login
// failures are credential errors, not expired sessions.
const AUTH_PATHS = new Set(['/auth/login', '/auth/refresh', '/auth/logout']);
const isAuthRoute = (url?: string): boolean => !!url && AUTH_PATHS.has(url);

export const setupApiInterceptors = (client: AxiosInstance): void => {
  client.interceptors.request.use((config) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config as RetryableRequestConfig;

      if (
        error.response?.status === 401 &&
        !originalRequest?._retry &&
        !isAuthRoute(originalRequest?.url)
      ) {
        originalRequest._retry = true;

        // Single source of truth for refresh; everyone shares one in-flight call.
        const token = await refreshSession();
        if (token) {
          originalRequest.headers = originalRequest.headers ?? {};
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return client(originalRequest);
        }

        // Unrecoverable: wipe all client state and let AuthProvider navigate.
        // (No window.location.replace here — redirects have a single authority.)
        resetAllClientState();
      }

      if (error.response?.status === 401 && isAuthRoute(originalRequest?.url)) {
        resetAllClientState();
      }

      return Promise.reject(error);
    },
  );
};
