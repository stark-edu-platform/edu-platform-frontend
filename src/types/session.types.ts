import { Permission } from '@/constants/permissions';
import { Role } from '@/constants/roles';

/**
 * The single derived session status (replaces the old
 * isAuthenticated / isBootstrapping / hasBootstrapped booleans).
 *
 * - `unknown`        — not bootstrapped yet (initial load)
 * - `authenticating` — a token exists but the user profile isn't loaded yet
 *                      (also the in-flight login/bootstrap state)
 * - `authenticated`  — token + user present
 * - `anonymous`      — no session
 *
 * Invariant: status is never `authenticated` without a `user`.
 */
export type SessionStatus = 'unknown' | 'authenticating' | 'authenticated' | 'anonymous';

export interface RoleAssignment {
  role: Role;
  permissions: Permission[];
  homePath: string;
  scope: 'platform' | 'school';
  schoolId?: string | null;
}

export interface UserDetails {
  firstName?: string | null;
  lastName?: string | null;
}
