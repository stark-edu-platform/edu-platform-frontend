import { QueryClient } from '@tanstack/react-query';
import { registerResettable } from '@/store/reset-registry';

/**
 * Single QueryClient instance, exposed as a module singleton so non-React code
 * (the reset registry) can clear it. All server-state fetching in this app is
 * client-only (axios + in-memory access token), so there is no SSR query cache
 * to leak across requests.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 1,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

registerResettable(() => queryClient.clear());
