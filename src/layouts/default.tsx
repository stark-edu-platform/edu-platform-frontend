'use client';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { usePathname, useRouter } from 'next/navigation';
import { getMenuList } from '../constants/project.menu';
import { Header, MobileDrawer, Sidebar, ProfileActions, UtilityActions } from '@/components/layout';
import { useAuthStore } from '@/store/auth/auth.store';

const getUtilityPageMeta = (pathname: string) => {
  if (pathname === APP_ROUTES.profile) {
    return {
      name: 'Profile',
      description: 'Review your workspace identity, account details, and personal settings.',
    };
  }

  if (pathname === APP_ROUTES.developer.webAppSettings) {
    return {
      name: 'Settings',
      description: 'Manage workspace preferences and application settings.',
    };
  }

  return undefined;
};

export default function Layout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const role = user?.systemRole?.toUpperCase() === 'DEVELOPER' ? 'developer' : 'user';
  const menu = useMemo(() => getMenuList(role), [role]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  useEffect(() => {
    for (const item of menu) {
      router.prefetch(item.path);
    }
  }, [menu, router]);
  const activeItem = menu.find((item) => item.path === pathname);
  const utilityPageMeta = getUtilityPageMeta(pathname);

  const userName = user?.name ?? 'User';
  const userTitle =
    user?.systemRole?.toUpperCase() === 'DEVELOPER' ? 'Platform Administrator' : 'School Workspace';
  const userInitials = 'PU';
  const profileActions = ProfileActions.map((action) => ({
    ...action,
    onSelect: async () => {
      setIsMobileMenuOpen(false);
      if (action.label === 'Logout') {
        // AuthProvider's resolveRedirect routes to /login once status → anonymous.
        await logout();
        return;
      }
    },
  }));

  return (
    <div className="h-screen overflow-hidden bg-base text-text">
      <div className="mx-auto flex h-full max-w-[1600px] flex-col lg:flex-row">
        <aside className="hidden border-r border-surfaceSoft bg-surface px-5 py-5 lg:flex lg:h-full lg:w-[270px] lg:shrink-0 lg:flex-col">
          <Sidebar
            menu={menu}
            pathname={pathname}
            userName={userName}
            userTitle={userTitle}
            userInitials={userInitials}
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Header
            activeItem={activeItem}
            utilityPageMeta={utilityPageMeta}
            utilityActions={UtilityActions}
            onMenuToggle={() => setIsMobileMenuOpen((current) => !current)}
            isMobileMenuOpen={isMobileMenuOpen}
            profileActions={profileActions}
            userName={userName}
            userTitle={userTitle}
          />

          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-1">
            <div className="mx-auto max-w-[1280px] h-full">{children}</div>
          </main>
        </div>
      </div>

      <MobileDrawer isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)}>
        <Sidebar
          menu={menu}
          pathname={pathname}
          userName={userName}
          userTitle={userTitle}
          userInitials={userInitials}
          onNavigate={() => setIsMobileMenuOpen(false)}
        />
      </MobileDrawer>
    </div>
  );
}
