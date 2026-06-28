import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import { isPublicPath, PROTECTED_PREFIXES } from '@/constants/route-access';

/**
 * Edge auth gate. In Next 16 this is the `proxy` file convention — the
 * replacement for the now-deprecated `middleware` file (do NOT rename this to
 * middleware.ts; Next errors if both exist). This is a coarse cookie-presence
 * check only; fine-grained status/role redirects are the client AuthProvider's
 * job via resolveRedirect.
 */
export function proxy(request: NextRequest) {
  const cookie = request.cookies.get('refreshToken');
  const { pathname } = request.nextUrl;
  const isPublic = isPublicPath(pathname);

  // Authenticated users shouldn't sit on the login / entry pages.
  if (cookie?.value && isPublic) {
    return NextResponse.redirect(new URL(APP_ROUTES.user.dashboard, request.url));
  }

  // Anonymous users can't reach protected areas.
  if (!cookie?.value && !isPublic) {
    return NextResponse.redirect(new URL(APP_ROUTES.login, request.url));
  }

  return NextResponse.next();
}

/**
 * Next statically analyzes `config` from the AST, so `matcher` MUST be a plain
 * literal array — an imported or computed value is silently ignored. The dev
 * assertion below guards this literal against drifting from PROTECTED_PREFIXES
 * (the route-access source of truth).
 */
export const config = {
  matcher: [
    '/',
    '/login',
    '/set-password',
    '/dashboard/:path*',
    '/school/:path*',
    '/profile/:path*',
    '/developer/:path*',
    '/staff/:path*',
    '/students/:path*',
    '/fees/:path*',
    '/classes/:path*',
    '/syllabus/:path*',
    '/exams/:path*',
    '/results/:path*',
    '/attendance/:path*',
  ],
};

if (process.env.NODE_ENV !== 'production') {
  const matcherCovers = (prefix: string) =>
    config.matcher.some((entry) => entry === prefix || entry === `${prefix}/:path*`);
  const missing = PROTECTED_PREFIXES.filter((prefix) => !matcherCovers(prefix));
  if (missing.length > 0) {
    console.warn(
      `[proxy] config.matcher is missing protected prefixes from route-access.ts: ${missing.join(', ')}. Add them to the literal matcher above.`,
    );
  }
}
