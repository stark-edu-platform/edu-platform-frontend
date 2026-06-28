import { create } from 'zustand';
import { registerResettable } from '@/store/reset-registry';

/**
 * Global, ephemeral UI state (Zustand). This is the client-state side of the
 * boundary documented in `src/store/README.md`: server data belongs in a
 * `<feature>.queries.ts` React Query hook, never here.
 */
interface UiState {
  isMobileMenuOpen: boolean;
  openMobileMenu: () => void;
  closeMobileMenu: () => void;
  toggleMobileMenu: () => void;
  reset: () => void;
}

const initialUiState = {
  isMobileMenuOpen: false,
};

export const useUiStore = create<UiState>()((set) => ({
  ...initialUiState,
  openMobileMenu: () => set({ isMobileMenuOpen: true }),
  closeMobileMenu: () => set({ isMobileMenuOpen: false }),
  toggleMobileMenu: () => set((state) => ({ isMobileMenuOpen: !state.isMobileMenuOpen })),
  reset: () => set({ ...initialUiState }),
}));

// Participate in the global client-state wipe (logout / unrecoverable 401).
registerResettable(() => useUiStore.getState().reset());
