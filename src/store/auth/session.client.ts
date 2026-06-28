import authService from './auth.services';
import helper from '@/utils/helper';

/**
 * Owns the in-memory access token and the single source-of-truth token refresh.
 *
 * Kept free of React/Zustand so both the axios interceptor and the auth store
 * can import it without import cycles. The access token deliberately lives only
 * in module memory (never localStorage); the httpOnly refresh cookie is the
 * source of truth across reloads.
 */

let accessTokenMemory: string | undefined;
let refreshPromise: Promise<string | undefined> | null = null;

export const getAccessToken = (): string | undefined => accessTokenMemory;

export const setAccessToken = (token?: string): void => {
  accessTokenMemory = token;
};

/**
 * The single refresh single-flight. Concurrent callers (e.g. several requests
 * that 401 at once, plus bootstrap) all share one in-flight `/auth/refresh`.
 * Resolves to the new access token, or `undefined` when the refresh failed —
 * callers should treat `undefined` as "session ended".
 */
export const refreshSession = (): Promise<string | undefined> => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await authService.refreshToken();
        const result = helper.successResponse(response, 'Token refreshed');
        const token = result?.data?.accessToken;
        setAccessToken(token);
        return token;
      } catch {
        setAccessToken(undefined);
        return undefined;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
};
