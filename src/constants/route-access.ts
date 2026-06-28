import { APP_ROUTES } from './routes';

/**
 * Single source of truth for **coarse** route access (public vs authenticated).
 * Both the client redirect logic (`resolveRedirect` / `isProtectedAppPath`) and
 * the Next proxy (`src/proxy.ts`) read from here, so the two can never drift.
 *
 * Permission-level (role) gating is layered on top of this in PRP-11; this file
 * only answers "does this path require a session?".
 */

// Pages reachable without a session.
export const PUBLIC_PATHS: readonly string[] = [APP_ROUTES.login, APP_ROUTES.setPassword];

// The bare entry path; `resolveRedirect` / the proxy send it to login or the
// role home depending on auth state.
export const HOME_PATH: string = APP_ROUTES.home;

// Every distinct top-level segment used by school-scoped role routes, derived
// from APP_ROUTES so adding a feature route there auto-protects it.
const schoolFeaturePrefixes = Object.values(APP_ROUTES.school)
  .flatMap((roleRoutes) => Object.values(roleRoutes))
  .map((path) => `/${path.split('/')[1] ?? ''}`)
  .filter((prefix) => prefix.length > 1);

// Authenticated route prefixes (coarse gate). A path is protected when it equals
// a prefix or sits beneath it. Add new protected areas to APP_ROUTES, not here.
export const PROTECTED_PREFIXES: readonly string[] = Array.from(
  new Set<string>([
    APP_ROUTES.user.dashboard,
    APP_ROUTES.user.school,
    APP_ROUTES.profile,
    APP_ROUTES.developer.root,
    ...schoolFeaturePrefixes,
  ]),
);

export const isPublicPath = (pathname: string): boolean =>
  pathname === HOME_PATH || PUBLIC_PATHS.includes(pathname);

export const isProtectedAppPath = (pathname: string): boolean =>
  PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
