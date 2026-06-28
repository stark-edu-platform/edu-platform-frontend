# PRP-08 — Single route-access source of truth

> **Status:** Proposed · **Phase:** 1 · **Severity:** 🟠 Med · **Size:** S **Addresses:** SF5 · **Depends on:** PRP-06 (resolveRedirect consumes it)

## 1. Problem / current state

"Which routes are protected" is declared in **three** places that will drift:

- `src/proxy.ts` `config.matcher` (the Next 16 middleware path list),
- `isProtectedAppPath()` in `src/lib/auth-redirect.ts:11` (hardcoded prefixes),
- implicitly in `src/constants/routes.ts` (`APP_ROUTES`).

> **Middleware likely inert:** `src/proxy.ts` is not named `middleware.ts` and is referenced nowhere, so Next almost certainly never runs it (see PRP-06). This source-of-truth work must therefore also **rename/wire the middleware** (`src/proxy.ts` → `middleware.ts`, or configure Next's proxy-file rename) and make its `config.matcher` actually cover the real protected prefixes — otherwise the matcher this PRP centralizes governs a file that never executes.

## 2. Goal & non-goals

- **Goal:** one declarative access map derived from `APP_ROUTES`; both the middleware matcher and `isProtectedAppPath`/`resolveRedirect` read from it.
- **Non-goals:** permission-level gating (that's PRP-11; this is coarse public/authed).

## 3. Target design

`src/constants/route-access.ts` exports a typed map classifying route prefixes as `public` / `authenticated` (and a slot for `roles?` to be filled by PRP-11). Helpers: `isPublicPath(pathname)`, `isProtectedAppPath(pathname)`, and `getMiddlewareMatcher()` returning the matcher array — so `proxy.ts` imports the matcher instead of re-listing it.

> Note: Next.js middleware `config.matcher` must be statically analyzable. Keep the matcher a plain exported array literal (built from constants at module scope), not a runtime-computed value.

## 4. Implementation steps

1. Add `src/constants/route-access.ts` built from `APP_ROUTES` (single declaration of public vs authed prefixes).
2. Rewrite `isProtectedAppPath` (`auth-redirect.ts`) to delegate to the map.
3. Rename `src/proxy.ts` → `src/middleware.ts` (or configure Next's proxy-file rename) so the middleware actually runs (see PRP-06), and update it to import the matcher list (or the prefix constants) from `route-access.ts`; keep the exported `config.matcher` a static array.
4. Reconcile the existing matcher (`/`, `/login`, `/developer/:path*`, `/school/:path*`, `/student/:path*`, `/teacher/:path*`, `/profile/:path*`, `/dashboard/:path*`) with `APP_ROUTES` — remove paths that don't exist, add any missing — so the matcher covers the real protected prefixes.

## 5. Files added / changed

- **Add:** `src/constants/route-access.ts`
- **Edit:** `src/lib/auth-redirect.ts`, `src/proxy.ts` (rename → `src/middleware.ts` so it runs)

## 6. Acceptance criteria

- [ ] Adding a protected route means editing one file.
- [ ] `proxy.ts` and `isProtectedAppPath` agree by construction.
- [ ] Middleware still builds (matcher remains static).

## 7. Validation

- `yarn type-check && yarn build` (build validates middleware matcher).
- Manual: hit a protected route unauthenticated → redirected; authenticated → allowed.

## 8. Risks & rollback

- Watch the static-matcher constraint. Rollback: revert; the three lists return.
