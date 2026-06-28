# PRP-08 — Single route-access source of truth

> **Status:** Proposed · **Phase:** 1 · **Severity:** 🟠 Med · **Size:** S **Addresses:** SF5 · **Depends on:** PRP-06 (resolveRedirect consumes it)

## 1. Problem / current state

"Which routes are protected" is declared in **three** places that will drift:

- `src/proxy.ts` `config.matcher` (the Next 16 middleware path list),
- `isProtectedAppPath()` in `src/lib/auth-redirect.ts:11` (hardcoded prefixes),
- implicitly in `src/constants/routes.ts` (`APP_ROUTES`).

> **CORRECTED (Next 16):** `src/proxy.ts` is **not** inert. Next 16 renamed the `middleware` file convention to `proxy` (verified in `next@16.2.1`), so `src/proxy.ts` (exporting `proxy()` + `config.matcher`) is the live convention and runs today. Do **not** rename it to `middleware.ts` — `middleware` is deprecated and Next errors if both files exist. This PRP therefore keeps `proxy.ts` and only reconciles its `config.matcher` to cover the real protected prefixes.

## 2. Goal & non-goals

- **Goal:** one declarative access map derived from `APP_ROUTES`; both the middleware matcher and `isProtectedAppPath`/`resolveRedirect` read from it.
- **Non-goals:** permission-level gating (that's PRP-11; this is coarse public/authed).

## 3. Target design

`src/constants/route-access.ts` exports a typed map classifying route prefixes as `public` / `authenticated` (and a slot for `roles?` to be filled by PRP-11). Helpers: `isPublicPath(pathname)`, `isProtectedAppPath(pathname)`, and `getMiddlewareMatcher()` returning the matcher array — so `proxy.ts` imports the matcher instead of re-listing it.

> Note: Next.js middleware `config.matcher` must be statically analyzable. Keep the matcher a plain exported array literal (built from constants at module scope), not a runtime-computed value.

## 4. Implementation steps

1. Add `src/constants/route-access.ts` built from `APP_ROUTES` (single declaration of public vs authed prefixes).
2. Rewrite `isProtectedAppPath` (`auth-redirect.ts`) to delegate to the map.
3. Keep `src/proxy.ts` (the live Next 16 convention — do not rename). Update its body to read `isPublicPath` from `route-access.ts`. **The `config.matcher` must stay a literal array** — Next extracts it from the AST (`extractExportedConstValue`), so an imported/computed value is silently ignored. To honor the single-source intent without violating that, add a module-load dev assertion in `proxy.ts` that the literal matcher covers `PROTECTED_PREFIXES`, so drift fails loudly instead of silently.
4. Reconcile the existing matcher (`/`, `/login`, `/developer/:path*`, `/school/:path*`, `/student/:path*`, `/teacher/:path*`, `/profile/:path*`, `/dashboard/:path*`) with `APP_ROUTES` — remove paths that don't exist, add any missing — so the matcher covers the real protected prefixes.

## 5. Files added / changed

- **Add:** `src/constants/route-access.ts`
- **Edit:** `src/constants/routes.ts` (add `setPassword`), `src/lib/auth-redirect.ts` (delegate `isProtectedAppPath`), `src/proxy.ts` (read route-access + reconcile matcher + dev drift-guard; **not** renamed)

## 6. Acceptance criteria

- [ ] Adding a protected route means editing one file.
- [ ] `proxy.ts` and `isProtectedAppPath` agree by construction.
- [ ] Middleware still builds (matcher remains static).

## 7. Validation

- `yarn type-check && yarn build` (build validates middleware matcher).
- Manual: hit a protected route unauthenticated → redirected; authenticated → allowed.

## 8. Risks & rollback

- Watch the static-matcher constraint. Rollback: revert; the three lists return.
