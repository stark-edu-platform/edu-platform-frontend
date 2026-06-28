# PRP-25 — Per-role landing pages & dual-role merged nav

> **Status:** Proposed · **Phase:** 1 · **Severity:** 🔴 High · **Size:** M **Addresses:** P1-FE-3 (master-prp §7.2.3, decisions D13/§4 personas) · **Depends on:** PRP-10 (`deriveAbilities`/`activeSchoolId`/typed roles), PRP-11 (permission menu + guards), backend PRP-17 (permission contract + union resolution) · **Pairs with:** PRP-22 (SuperAdmin screens), PRP-24 (subscription banners on landing)

## 1. Problem / current state

Landing and navigation are keyed only on the global `systemRole`, so school roles are invisible:

- `src/lib/auth-redirect.ts` `getHomeRouteForSystemRole` returns `/developer/dashboard` for DEVELOPER and `/dashboard` for everyone else — an ADMIN, TEACHER, STAFF, PARENT, and STUDENT all land on the **same** `(school)/dashboard/page.tsx` placeholder.
- `src/constants/project.menu.ts` returns one of two arrays (`developer` | `user`); every non-developer sees the same 4 items (PRP-11 fixes the menu mechanism, but per-role landing + dual-role merge is this PRP).
- There is no notion of a **primary** vs **secondary** school role on the client, no `activeSchoolId`, and `user.schools` is `unknown[]` — all introduced by PRP-10. Decision D13 requires: land on the **primary** role's page, merge secondary-role nav sections in, and compute abilities as the **union** of all roles.

PRP-10 delivers `deriveAbilities(user, activeSchoolId) → Set<Permission>` and the active-school selection; PRP-11 delivers the permission-tagged menu (`getMenuList(abilities)`), `useCan`/`<Can>`, and `withPermission`. This PRP builds the **role landing pages** and the **dual-role behavior** on top of them.

## 2. Goal & non-goals

- **Goal:** distinct landing pages for Admin / Teacher / Staff / Parent / Student (+ the SuperAdmin dashboard) and the dual-role rule (D13) — a user lands on their **primary** role's page within the `activeSchool`, sees secondary-role nav sections merged into one menu, with abilities = union (already computed by `deriveAbilities`). Redirect logic resolves the landing route from the active school's primary role, not just `systemRole`.
- **Non-goals:** building out each role's full feature set (P2+ fills the dashboards — P1 ships meaningful but lightweight per-role landings); the menu/guard primitives (PRP-11); backend ability resolution (PRP-17); the subscription banner (PRP-24, which renders within these layouts).

## 3. Target design

### 3.1 Landing-route resolution (extend `src/lib/auth-redirect.ts`)

Add `getHomeRouteForUser(user, activeSchoolId)`:

- DEVELOPER (`systemRole`) → `APP_ROUTES.developer.dashboard` (unchanged).
- Otherwise resolve the **active** `UserSchool` (PRP-10) and switch on its `primaryRole` (`SchoolRole`): ADMIN → `/admin`, TEACHER → `/teacher`, STAFF → `/staff`, PARENT → `/parent`, STUDENT → `/student` (all under the `(school)` group; strings in `APP_ROUTES`). Keep `getHomeRouteForSystemRole` as a thin wrapper for the DEVELOPER/USER split that callers (`Login.tsx`, `AuthProvider`, `DefaultLayout`) currently use, and migrate those call sites to `getHomeRouteForUser` so landing follows the active-school role.
- If a user has no active school (edge case) fall back to a neutral `/dashboard` overview.

### 3.2 Per-role landing pages (`src/app/(school)/`)

Add a page per role under the `(school)` group (so they share `DefaultLayout` + the subscription banner from PRP-24). Each renders a role module from `src/modules/<feature>/`:

- `app/(school)/admin/page.tsx` → `modules/admin-dashboard` (school overview: members, subscription/trial summary, quick links to invite/billing — links gated by `<Can>`).
- `app/(school)/teacher/page.tsx` → `modules/teacher-dashboard` (placeholder for classes/attendance — P3 fills it; show "merged" staff sections if the user is also STAFF).
- `app/(school)/staff/page.tsx` → `modules/staff-dashboard`.
- `app/(school)/parent/page.tsx` → `modules/parent-dashboard` (multi-child placeholder — P3 fills it).
- `app/(school)/student/page.tsx` → `modules/student-dashboard`. P1 dashboards are intentionally light (welcome + role-appropriate quick links + the subscription banner), but **distinct per role** and driven by abilities, not hardcoded role checks where avoidable. Replace the generic `(school)/dashboard/page.tsx` placeholder or keep it as the no-active-school fallback.

### 3.3 Dual-role merged navigation (D13)

The menu is already permission-tagged (PRP-11: the real `MenuItem` type with its `rbacId?` permission field, `getMenuList(abilities)`). Because `deriveAbilities` returns the **union** of primary + secondary roles (PRP-10/PRP-17 §3.2), a teacher-who-is-also-staff naturally sees both teacher and staff entries from the **single filtered list** — no per-role array merging needed. This PRP's job is to ensure:

- the menu is built from `deriveAbilities(user, activeSchoolId)` (the union), and entries are **grouped/sectioned** so merged secondary capabilities read as coherent sections (e.g. a "Teaching" group and a "Staff" group) rather than a flat list. Extend the (consolidated) `MenuItem` type with an optional `section`/`group` label and have `Sidebar` (`src/components/layout/sidebar.tsx`) render grouped headings.
- landing still goes to the **primary** role's page (§3.1), even though secondary sections are present.

### 3.4 Active-school awareness

All of the above key off `activeSchoolId` (PRP-10). When the school switcher (PRP-10) changes the active school, the derived abilities, the menu, and the appropriate landing all recompute. The redirect-on-login (`Login.tsx`) and `AuthProvider` post-bootstrap redirect both call `getHomeRouteForUser` so a fresh session lands on the active school's primary-role page.

### 3.5 SuperAdmin landing

The SuperAdmin (DEVELOPER) lands on `developer/dashboard` (the cross-school ops dashboard). This PRP can flesh that dashboard slightly (counts of schools by status / pending-activation queue link) but the console screens themselves are PRP-22. Keep DEVELOPER on its own `developer/` subtree (not the `(school)` group).

## 4. Implementation steps

1. **Redirect resolver:** add `getHomeRouteForUser(user, activeSchoolId)` to `src/lib/auth-redirect.ts`; keep `getHomeRouteForSystemRole` as a wrapper. Migrate call sites: `src/modules/auth/Login.tsx` (post-login push), `src/components/providers/auth-provider.tsx` (post-bootstrap redirect), `src/layouts/default.tsx` (dev-away redirect).
2. **Routes:** add `school.admin`/`teacher`/`staff`/`parent`/`student` landing paths to `APP_ROUTES` (collapse the duplicative per-role `APP_ROUTES.school.*` maps per PRP-11 into clean landing routes). **Cover them in the middleware matcher:** add the new landing prefixes (`/admin`, `/teacher`, `/staff`, `/parent`, `/student`) to the (renamed) middleware `config.matcher` (PRP-06/PRP-08), or land them under an already-matched route group, so the cookie gate protects them. The route-collapse owns this matcher update alongside the feature prefixes PRP-11 lists.
3. **Landing pages (thin):** add `app/(school)/{admin,teacher,staff,parent,student}/page.tsx`, each rendering its module. Decide whether to keep `(school)/dashboard` as the no-active-school fallback.
4. **Role modules:** add `src/modules/{admin,teacher,staff,parent,student}-dashboard/` with a light, ability-driven landing each (welcome + `<Can>`-gated quick links + the PRP-24 banner). Avoid hardcoded role conditionals; prefer `useCan`.
5. **Sectioned menu:** extend the consolidated `MenuItem` type (PRP-11; note it is duplicated in `src/components/layout/layout.type.ts` + `src/types/menu.type.ts` and is consolidated to one definition there) with an optional `section` label; group entries so merged secondary-role sections render under headings. Update `Sidebar` (`src/components/layout/sidebar.tsx`) to render grouped headings.
6. **Verify union:** confirm `getMenuList(deriveAbilities(user, activeSchoolId))` yields merged entries for a dual-role user; add a fixture/dev mock if PRP-10's `deriveAbilities` ships with tests (extend them with a primary+secondary case landing on the primary page).

## 5. Files added / changed

- **Add:** `src/app/(school)/admin/page.tsx`, `.../teacher/page.tsx`, `.../staff/page.tsx`, `.../parent/page.tsx`, `.../student/page.tsx`; `src/modules/admin-dashboard/*`, `teacher-dashboard/*`, `staff-dashboard/*`, `parent-dashboard/*`, `student-dashboard/*`
- **Edit:** `src/lib/auth-redirect.ts`, `src/constants/routes.ts`, the (renamed) middleware `config.matcher` (PRP-06/08; add the new landing prefixes), `src/constants/project.menu.ts`, `src/components/layout/sidebar.tsx`, the consolidated `MenuItem` type (`src/components/layout/layout.type.ts` + `src/types/menu.type.ts`), `src/modules/auth/Login.tsx`, `src/components/providers/auth-provider.tsx`, `src/layouts/default.tsx`

## 6. Acceptance criteria

- [ ] An ADMIN, TEACHER, STAFF, PARENT, and STUDENT each land on a **distinct** page after login (resolved from the active school's primary role, not `systemRole`).
- [ ] A user with primary TEACHER + secondary STAFF lands on the **teacher** page and sees both teaching and staff nav sections in one menu; abilities are the union (proven by the merged menu + a `deriveAbilities` test case).
- [ ] Switching the active school (PRP-10) recomputes the menu and the correct landing for that school's primary role.
- [ ] The SuperAdmin still lands on `developer/dashboard`.
- [ ] Menu entries come from `getMenuList(deriveAbilities(...))` (no per-role hardcoded arrays); all paths from `APP_ROUTES`; quick links use `<Can>`.

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Unit: extend PRP-10's `deriveAbilities` tests with a dual-role union + a landing-resolution test for `getHomeRouteForUser`. Manual: log in as each role (or mock `user.schools`) and confirm distinct landings + merged nav for a dual-role user.

## 8. Risks & rollback

- **Depends on PRP-10/PRP-11 shapes:** `UserSchool.primaryRole`/`secondaryRoles`, `activeSchoolId`, and the tagged menu must exist first — land after them. If PRP-10's `deriveAbilities` isn't ready, the landings can't be ability-driven; do not ship partial.
- **Primary-vs-union subtlety (D13):** abilities are the union, but landing is the **primary** role's page — keep these two concerns separate (union drives the menu/gates; primary drives the redirect).
- **Active-school edge cases:** users with zero active memberships (e.g. all schools suspended) need the neutral fallback — don't crash the redirect.
- Rollback: revert the landing pages + the resolver migration; `getHomeRouteForSystemRole` keeps the old single-dashboard behavior.
