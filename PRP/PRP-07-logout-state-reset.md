# PRP-07 — Reset-all-client-state on logout

> **Status:** Proposed · **Phase:** 1 · **Severity:** 🟠 Med · **Size:** S **Addresses:** SF4 · **Depends on:** PRP-06 (uses the consolidated session)

## 1. Problem / current state

`clearSession()` (`src/store/auth/auth.store.ts:131`) resets only the auth store. The `developer` store keeps `schoolsById`/`schoolIds` (`src/store/developer/developer.store.ts`) and the React Query cache (`src/lib/providers.tsx`) keeps everything. On the same browser tab, **the next user can see the previous user's data** until a full reload.

## 2. Goal & non-goals

- **Goal:** a single `resetAllClientState()` that wipes every feature store + the React Query cache, invoked on logout and on unrecoverable 401.
- **Non-goals:** clearing httpOnly cookies (the backend does that on `/auth/logout`).

## 3. Target design

A small registry the QueryClient and resettable stores opt into, so logout doesn't need to import every store (avoids cycles):

- Each Zustand store exposes a `reset()` and registers it.
- `resetAllClientState()` calls all registered resets + `queryClient.clear()`.

## 4. Implementation steps

1. Add `src/store/reset-registry.ts`: `registerResettable(fn)` + `resetAllClientState()`.
2. Give each store a `reset()` (`auth`, `developer`, future `ui`) and call `registerResettable` at module init.
3. Expose the `QueryClient` to non-React code: create it in `src/lib/query-client.ts`, import it in `providers.tsx`, and have `resetAllClientState()` call `queryClient.clear()`.
4. Call `resetAllClientState()` from `auth.store.logout()` (after the API call, in `finally`) and from the interceptor's unrecoverable-401 path (replacing ad-hoc `clearSession`).

## 5. Files added / changed

- **Add:** `src/store/reset-registry.ts`, `src/lib/query-client.ts`
- **Edit:** `store/auth/auth.store.ts`, `store/developer/developer.store.ts`, `lib/providers.tsx`, `interceptors/auth.interceptor.ts`

## 6. Acceptance criteria

- [ ] After logout, no feature store retains data and `queryClient` is empty.
- [ ] Logging in as user B after user A shows zero of A's cached data without a reload.
- [ ] No circular-import warnings.

## 7. Validation

- `yarn type-check && yarn lint`
- Manual: log in as A, load schools, log out, log in as B → verify clean state (React Query Devtools shows empty cache).

## 8. Risks & rollback

- Low risk. Rollback: revert; logout still clears auth as before.
