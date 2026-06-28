import { APP_ROUTES } from '@/constants/routes';
import { isProtectedAppPath } from '@/constants/route-access';
import type { SessionStatus } from '@/types/session.types';

// Route-access classification lives in one place (PRP-08); re-exported here so
// existing importers of isProtectedAppPath keep their import path.
export { isProtectedAppPath };

export function getHomeRouteForSystemRole(systemRole?: string | null) {
  if (systemRole?.toUpperCase() === 'DEVELOPER') {
    return APP_ROUTES.developer.dashboard;
  }

  return APP_ROUTES.user.dashboard;
}

// Entry/auth pages that an authenticated user should be bounced away from.
const AUTH_PAGES: string[] = [APP_ROUTES.login, APP_ROUTES.home];

/**
 * The single authority for auth-driven navigation. Returns the path to redirect
 * to, or `null` to stay put. Pure + synchronous so it is trivially unit-testable
 * (the test file lands with the PRP-74 harness).
 */
export function resolveRedirect(
  pathname: string,
  { status, systemRole }: { status: SessionStatus; systemRole?: string | null },
): string | null {
  // Session not resolved yet — never navigate on a guess.
  if (status === 'unknown' || status === 'authenticating') {
    return null;
  }

  if (status === 'authenticated') {
    const home = getHomeRouteForSystemRole(systemRole);

    // Bounce away from login / entry pages to the role home.
    if (AUTH_PAGES.includes(pathname)) {
      return home;
    }

    // The edge proxy lands every authenticated user on the user dashboard (it
    // can't see role from the cookie); forward DEVELOPERs to their console home.
    if (systemRole?.toUpperCase() === 'DEVELOPER' && pathname === APP_ROUTES.user.dashboard) {
      return home;
    }

    return null;
  }

  // anonymous: keep them out of protected areas and off the bare entry page.
  if (isProtectedAppPath(pathname) || pathname === APP_ROUTES.home) {
    return APP_ROUTES.login;
  }

  return null;
}
