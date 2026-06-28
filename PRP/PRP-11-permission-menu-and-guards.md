# PRP-11 — Permission-driven menu & route guards

> **Status:** Proposed · **Phase:** 3 · **Severity:** 🔴 High · **Size:** M **Addresses:** RB3, RB4, RB5 · **Depends on:** PRP-10 (abilities), PRP-08 (route map)

## 1. Problem / current state

- **RB3:** `src/constants/project.menu.ts` `getMenuList(systemRole)` returns only a `developer` or `user` menu. Every non-developer gets the same 4 items regardless of being ADMIN/TEACHER/STUDENT/PARENT — it cannot express role-specific navigation.
- **RB4:** the menu hardcodes paths (`/developer/users`, `/developer/modules`, `/user/staff`, `/user/students` — `project.menu.ts:19,26,46,52`) instead of `APP_ROUTES`, violating the house rule; `APP_ROUTES.school.*` is duplicative/unused.
- **RB5:** there's no client-side permission gate (`useCan` / `<Can>`) and no per-route guard tied to permissions.

## 2. Goal & non-goals

- **Goal:** one permission-tagged menu config filtered by `deriveAbilities`; `useCan`/`<Can>`; a `withPermission` route guard. All paths from `APP_ROUTES`.
- **Non-goals:** server enforcement (backend PRP-12 — FE gating is UX only).

## 3. Target design

- **Menu config:** the real type is **`MenuItem`** (currently duplicated in `src/components/layout/layout.type.ts` and `src/types/menu.type.ts` — consolidate to one definition as part of this work). Its existing `rbacId?` field is the permission seam: tag each entry `rbacId?: Permission` (a string from the PRP-10 canonical map) and have `getMenuList(abilities)` return the entries whose `rbacId` is satisfied — a single list, filtered, not per-role arrays. Paths come from `APP_ROUTES`.
- **`useCan(permission)`** reads the session's derived abilities (PRP-10). **`<Can permission>`** conditionally renders. **`withPermission(Component, permission)`** (or a layout-level guard) redirects/renders-not-authorized for gated pages.
- Reuse the route-access map (PRP-08), extending it with optional `requires` per route so guard + menu share one declaration.

## 4. Implementation steps

1. Refactor `project.menu.ts` to the single tagged config using `APP_ROUTES` constants (remove hardcoded strings); collapse the duplicative `APP_ROUTES.school.*` maps in `routes.ts`. Consolidate the duplicated `MenuItem` type (`src/components/layout/layout.type.ts` + `src/types/menu.type.ts`) to a single definition and tag entries via its `rbacId?` field.
2. **Own the middleware matcher (route collapse):** because this PRP introduces the real feature routes, it owns `config.matcher` in the (renamed) middleware (PRP-06/PRP-08) — add ALL new feature route prefixes so the cookie gate covers them: `/academic`, `/staff`, `/students`, `/fees`, `/attendance`, `/parent`, `/exams`, `/results`, `/admissions`, `/promotion`, `/imports`, `/notices`, `/events`, `/messages`, `/ptm`, `/homework`, `/materials`, `/syllabus`, `/settings` (or land them under an already-matched route group so the existing matcher covers them). Keep the matcher a static array (PRP-08).
3. Change `getMenuList` to accept `abilities` (from `deriveAbilities`) and filter by each entry's `rbacId`. Update `src/layouts/default.tsx` (currently `getMenuList(role)`).
4. Add `src/lib/permissions/useCan.ts` + `src/components/Can.tsx`.
5. Add `withPermission` (HOC) or a guard in the gated layouts (`app/(school)/layout.tsx`, `app/developer/layout.tsx`) using the route map's `requires`.
6. Extend `route-access.ts` (PRP-08) entries with optional `requires: Permission[]`.

## 5. Files added / changed

- **Add:** `src/lib/permissions/useCan.ts`, `src/components/Can.tsx`, `withPermission`
- **Edit:** `src/constants/project.menu.ts`, `src/constants/routes.ts`, `src/constants/route-access.ts`, the (renamed) middleware `config.matcher` (PRP-06/08), the consolidated `MenuItem` type (`src/components/layout/layout.type.ts` + `src/types/menu.type.ts`), `src/layouts/default.tsx`, gated layouts

## 6. Acceptance criteria

- [ ] Menu items render per the user's derived permissions/active-school role, not just systemRole.
- [ ] No hardcoded paths remain in `project.menu.ts` (all from `APP_ROUTES`).
- [ ] `<Can>` hides unauthorized UI; `withPermission` blocks unauthorized pages (client UX).
- [ ] A TEACHER and a STUDENT see different menus in the same school.

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Manual: switch active-school role (or mock abilities) and confirm menu + gated pages change.

## 8. Risks & rollback

- FE gating is **not** security — ensure backend PRP-12 enforces server-side before relying on it for sensitive data.
- Rollback: revert to the systemRole menu.
