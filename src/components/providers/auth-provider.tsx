'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isProtectedAppPath, resolveRedirect } from '@/lib/auth-redirect';
import { useAuthStore } from '@/store/auth/auth.store';
import { Loader } from '@/components';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const bootstrapAuth = useAuthStore((state) => state.bootstrapAuth);

  // Bootstrap exactly once (the store guards re-entry via its status flip).
  useEffect(() => {
    if (status === 'unknown') {
      void bootstrapAuth();
    }
  }, [status, bootstrapAuth]);

  // The only place that navigates for auth reasons.
  useEffect(() => {
    const target = resolveRedirect(pathname, { status, systemRole: user?.systemRole });
    if (target && target !== pathname) {
      router.replace(target);
    }
  }, [pathname, status, user?.systemRole, router]);

  // Only block the UI while the session is still resolving on a gated route.
  const showLoader =
    (status === 'unknown' || status === 'authenticating') && isProtectedAppPath(pathname);

  if (showLoader) {
    return <Loader fullScreen label="Verifying session..." />;
  }

  return <>{children}</>;
}
