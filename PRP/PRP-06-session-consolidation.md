# PRP-06 — Session consolidation (single redirect authority + single refresh)

> **Status:** Proposed (refactor — the fragmented pieces all still exist; nothing consolidated yet) · **Phase:** 1 · **Severity:** 🔴 High · **Size:** M–L **Addresses:** SF1, SF2, SF6, SF7, SF8, LG2 · **Depends on:** none · **Unblocks:** PRP-07, PRP-08, PRP-10/11

## 1. Problem / current state

Auth orchestration is fragmented and race-prone:

- **Redirects fire from 4 navigation call-sites:** `src/components/providers/auth-provider.tsx` (bootstrap + redirect), `src/layouts/default.tsx:42-50` (a second dashboard→developer redirect effect), `src/interceptors/auth.interceptor.ts:58` (`window.location.replace`), and `src/modules/auth/Login.tsx:27` (`router.push`). They can fire on the same transition. (`src/lib/auth-redirect.ts` holds redirect **logic** — the target of `resolveRedirect`/`isProtectedAppPath` — not a navigator; and `src/proxy.ts`'s cookie gate is the Next middleware, see below.) **(SF1, SF7, LG2)**
- **Refresh single-flight exists 3×:** `auth.store.onRefresh`, `auth.store.bootstrapAuth` (`bootstrapPromise`), and the interceptor's `refreshPromise`. They can interleave. **(SF2)**
- **State can diverge:** `onRefresh` (`auth.store.ts:82-88`) sets `isAuthenticated: true` with no user; `accessTokenMemory` is a separate module global → 3 sources of truth. **(SF6)**
- `isAuthRoute` uses fragile `includes()` matching (`interceptor:9`). **(SF8)**

> **Verified still current (2026-06-28):** all three refresh single-flights, the four navigation call-sites, and the divergent `isAuthenticated`/`isBootstrapping`/`hasBootstrapped` booleans exist as described; `session.client.ts` and `resolveRedirect()` do not exist. None of the consolidation is done — the full PRP stands.

> **Middleware caveat:** `src/proxy.ts` is **not** named `middleware.ts` and is referenced nowhere, so Next's middleware convention almost certainly does **not** pick it up — the cookie gate likely does not run today. If the cookie-gate is meant to run, this PRP must rename `src/proxy.ts` → `middleware.ts` (or configure Next's proxy-file rename) so the middleware actually executes. (PRP-08 wires the matcher to the route-access source of truth and depends on this rename landing.)

## 2. Goal & non-goals

- **Goal:** one refresh single-flight, one redirect authority, one session status; the store holds state only.
- **Non-goals:** moving to server-side auth (that's the optional SF3 path — keep the polished-SPA model); changing the in-memory access-token strategy (keep it).

## 3. Target design

- **`src/store/auth/session.client.ts`** owns the access token (`getAccessToken`/`setAccessToken`) and the **single** `refreshSession()` with its single-flight promise. Everyone (interceptor, bootstrap) calls this one function.
- **Single status:** replace `isAuthenticated` / `isBootstrapping` / `hasBootstrapped` with one derived `status: 'unknown' | 'authenticating' | 'authenticated' | 'anonymous'`. "Has token, no user" ⇒ `authenticating`, never `authenticated`.
- **`resolveRedirect(pathname, { status, systemRole }) → string | null`** in `auth-redirect.ts` is the **only** place that decides navigation. `AuthProvider` runs bootstrap once, then applies `resolveRedirect`. Nothing else navigates for auth reasons.
- **Interceptor** stops navigating: on unrecoverable 401 it calls `clearSession()` and lets `AuthProvider` react. `isAuthRoute` becomes an exact-match set of auth pathnames.

## 4. Implementation steps

1. Add `src/store/auth/session.client.ts`: move `accessTokenMemory` + `getAccessToken`/`setAccessToken` here; add `refreshSession()` holding the only `refreshPromise` (single-flight; resets in `finally`).
2. Refactor `src/interceptors/auth.interceptor.ts` to call `refreshSession()` (delete its local `refreshPromise` duplication); remove the `window.location.replace` branch (`:58`); replace `isAuthRoute` substring checks with an exact `AUTH_PATHS` set.
3. Refactor `src/store/auth/auth.store.ts`: delete `bootstrapPromise` and the duplicate refresh logic; `bootstrapAuth()` calls `refreshSession()` then `fetchMe()`; expose `status` (derive or store) instead of the three booleans; keep `clearSession`/`logout`.
4. Add `resolveRedirect()` to `src/lib/auth-redirect.ts` (pure, unit-testable).
5. Rewrite the `AuthProvider` effect to: bootstrap once → compute `resolveRedirect(pathname, { status, systemRole })` → `router.replace` if non-null. Simplify `showLoader` to `status === 'unknown' || status === 'authenticating'` on gated routes.
6. Delete the redirect effect in `default.tsx:42-50` and the `router.push` in `Login.tsx:27` (login success flips `status`; `resolveRedirect` handles it).

## 5. Files added / changed

- **Add:** `src/store/auth/session.client.ts`
- **Edit:** `auth.interceptor.ts`, `auth.store.ts`, `lib/auth-redirect.ts`, `components/providers/auth-provider.tsx`, `layouts/default.tsx`, `modules/auth/Login.tsx`

## 6. Acceptance criteria

- [ ] Exactly one network refresh occurs when N concurrent requests 401 simultaneously.
- [ ] No double navigation on login or on session expiry.
- [ ] `status` is never `authenticated` without a `user`.
- [ ] Bootstrap on reload restores the session with a single refresh, no loader flash loop.
- [ ] Logout/expiry routes to `/login` via one path only.

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Unit-test `resolveRedirect` (authenticated-on-login → home; anonymous-on-protected → login; etc.).
- Manual: login, reload, let access token expire (or force a 401), logout — watch the network tab for a single `/auth/refresh` and a single redirect.

## 8. Risks & rollback

- Behavioral refactor on the critical path — do it as one focused PR with the `resolveRedirect` unit tests as the safety net.
- Rollback: revert the PR; no schema/store-shape persisted state is affected.
