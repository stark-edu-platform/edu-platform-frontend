import { create } from 'zustand';
import { User } from '@/types/user.type';
import { ErrorResponse } from '@/types/api.types';
import { SessionStatus } from '@/types/session.types';
import authService from './auth.services';
import helper from '@/utils/helper';
import { LoginPayload, FetchUserResponse } from './auth.type';
import { getAccessToken, setAccessToken, refreshSession } from './session.client';
import { registerResettable, resetAllClientState } from '@/store/reset-registry';

interface AuthState {
  user: User | null;
  status: SessionStatus;
  onLogin: (credentials: LoginPayload) => Promise<FetchUserResponse | ErrorResponse>;
  bootstrapAuth: () => Promise<boolean>;
  fetchMe: () => Promise<FetchUserResponse | ErrorResponse>;
  clearSession: () => void;
  reset: () => void;
  logout: () => Promise<ErrorResponse | void>;
  validateSetPasswordToken: (token: string) => Promise<FetchUserResponse | ErrorResponse>;
  setUserPassword: (token: string, password: string) => Promise<FetchUserResponse | ErrorResponse>;
}

const anonymousState = {
  user: null,
  status: 'anonymous' as SessionStatus,
};

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  status: 'unknown',

  onLogin: async (credentials) => {
    set({ status: 'authenticating' });
    try {
      const response = await authService.login(credentials);
      const result = helper.successResponse(response, 'Login successful');
      setAccessToken(result?.data?.accessToken ?? '');
      const profile = await get().fetchMe();
      if (!profile.success) {
        get().clearSession();
      }
      return profile;
    } catch (error) {
      get().clearSession();
      return helper.errorResponse(error);
    }
  },

  fetchMe: async () => {
    try {
      const response = await authService.fetchMe();
      const result = helper.successResponse(response, 'Profile fetched successfully');
      // "Token but no user" must never read as authenticated.
      set({ user: result?.data?.user ?? null, status: 'authenticated' });
      return result;
    } catch (error) {
      console.error('Fetching profile failed:', error);
      get().clearSession();
      return helper.errorResponse(error, 'Failed to fetch profile');
    }
  },

  bootstrapAuth: async () => {
    // Bootstrap runs once. The synchronous status flip below dedupes re-entry;
    // the actual network refresh is deduped by refreshSession's single-flight.
    if (get().status !== 'unknown') {
      return get().status === 'authenticated';
    }
    set({ status: 'authenticating' });

    const token = getAccessToken() ?? (await refreshSession());
    if (!token) {
      set({ ...anonymousState });
      return false;
    }

    const profile = await get().fetchMe();
    return profile.success;
  },

  clearSession: () => {
    setAccessToken(undefined);
    set({ ...anonymousState });
  },

  reset: () => {
    get().clearSession();
  },

  logout: async () => {
    try {
      await authService.logout();
    } catch (error) {
      return helper.errorResponse(error, 'Logout failed');
    } finally {
      // Wipe every feature store + the query cache, not just auth.
      resetAllClientState();
    }
  },

  validateSetPasswordToken: async (token: string) => {
    try {
      const response = await authService.validateSetPasswordToken(token);
      return helper.successResponse(response, 'Token is valid');
    } catch (error) {
      return helper.errorResponse(error, 'Invalid or expired token');
    }
  },

  setUserPassword: async (token: string, password: string) => {
    try {
      const response = await authService.setPassword(token, password);
      return helper.successResponse(response, 'Password set successfully');
    } catch (error) {
      return helper.errorResponse(error, 'Failed to set password');
    }
  },
}));

// Participate in the global client-state wipe (logout / unrecoverable 401).
registerResettable(() => useAuthStore.getState().reset());
