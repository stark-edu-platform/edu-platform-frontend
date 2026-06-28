# PRP-22 — SuperAdmin console layout & screens

> **Status:** Proposed · **Phase:** 1 · **Severity:** 🔴 High · **Size:** L **Addresses:** P1-FE-1 (master-prp §7.2.1) · **Depends on:** PRP-10 (abilities/`activeSchoolId`), PRP-11 (permission menu/guards), backend PRP-16 (school lifecycle), PRP-17 (permission editor), PRP-18 (audit log), PRP-20 (SuperAdmin console APIs + impersonation) · **Pairs with:** PRP-25 (SuperAdmin landing)

## 1. Problem / current state

The developer (SuperAdmin) area is a thin shell that only lists schools:

- `src/app/developer/` has `layout.tsx` (just `<DefaultLayout>`), `dashboard/page.tsx` (an intro card) and `schools/page.tsx` (renders `SchoolList`). The other `APP_ROUTES.developer.*` targets (`userAccounts`, `schoolFeatures`, `accessControl`, `auditLogs`, `webAppSettings`) have **no pages** — they fall through to `app/[...slug]/page.tsx` ("not built yet").
- `src/modules/developer/manage-school/SchoolList.tsx` reads `useDeveloperStore().fetchSchools` via a single `useQuery({ queryKey: ['schools'] })` and renders a read-only `DataGrid` (`src/modules/developer/manage-school/utils.ts` columns). There is **no detail view, no lifecycle actions** (activate/suspend/lock/set-trial), no subscription management, no permission editor, no audit viewer, and no impersonation.
- `src/store/developer/` exposes only `fetchSchools` (GET `/developer/schools`) normalized into `schoolsById`/`schoolIds`. `School` (`developer.type.ts`) is missing subscription/trial/owner fields the new backend returns.
- The developer sidebar (`src/constants/project.menu.ts` `developer` array) hardcodes 4 paths and does not reflect these new sections.

Backend PRP-20 now exposes the full SuperAdmin surface (school management + lifecycle from PRP-16, subscription/plan management from PRP-15, permission editor from PRP-17, audit viewer from PRP-18, and an audited "login as" impersonation). This PRP builds the web console on top of it.

## 2. Goal & non-goals

- **Goal:** a dedicated SuperAdmin console under `src/app/developer/` consuming PRP-20: a **schools list + detail** with lifecycle actions (activate-with-trial-length / suspend / lock / reactivate / extend-trial), **subscription & plan management**, a **permission-matrix editor** (role × permission, backed by PRP-17), an **audit-log viewer**, and an **impersonation ("login as")** action. All wiring via `src/store/developer/` services + TanStack Query; all routes from `APP_ROUTES`.
- **Non-goals:** the SuperAdmin _landing_ page composition + dual-role nav (PRP-25 — this PRP delivers the screens, PRP-25 wires the role-aware shell); the public sign-up form (PRP-23); the Admin-facing billing page (PRP-24); backend endpoints (PRP-15/16/17/18/20). Per-school permission overrides are out of scope (PRP-17 is global-only in v1).

## 3. Target design

### 3.1 Routes (extend `APP_ROUTES.developer`)

Reuse the existing keys and add detail + subscription routes. New strings live **only** in `src/constants/routes.ts`:

- `developer.schools` (list) + `developer.schoolDetail(id)` → `/developer/schools/[schoolId]`
- `developer.subscriptions` → `/developer/subscriptions` (plans + per-school subscription mgmt)
- `developer.accessControl` (existing) → permission-matrix editor
- `developer.auditLogs` (existing) → audit viewer The catch-all (`app/[...slug]`) stops swallowing these once the pages exist.

### 3.2 State & services (`src/store/developer/`)

Extend the existing developer store/services (do not bypass it from components):

- **Types (`developer.type.ts`):** widen `School` with `ownerUserId`, `status` typed to the backend `SchoolStatus` union (`PENDING | INVITED | ACTIVE | READ_ONLY | LOCKED | SUSPENDED | INACTIVE`), and an embedded `subscription?: { status: SubscriptionStatus; cadence; trialDays; trialEndsAt; currentPeriodEnd; seatCount }`. Add `SubscriptionPlan`, `AuditLogEntry`, `RoleMatrix` (`Record<SchoolRole, PermissionKey[]>`) types mirroring PRP-15/17/18 shapes.
- **Services (`developer.services.ts`):** add functions that hit PRP-20 endpoints, each normalized through `helper.successResponse`/`helper.errorResponse`:
  - `fetchSchool(id)` GET `/developer/schools/:id`
  - `transitionSchool(id, action, body?)` POST `/developer/schools/:id/<action>` for `activate` (body `{ trialDays, planId?, cadence? }`), `suspend`, `lock`, `reactivate`, `extend-trial` (body `{ extraDays }`)
  - `fetchPlans()` / `createPlan` / `updatePlan` (`/developer/plans`)
  - `fetchPermissionMatrix()` GET + `setRolePermissions(role, keys[])` PUT `/developer/role-matrix/:role` (per PRP-20; **not** `/developer/permissions`)
  - `fetchAuditLogs(params)` GET `/developer/audit` (per PRP-20; **not** `/developer/audit-logs`) (paged/filterable)
  - `impersonate(userId)` POST `/developer/impersonate` + `stopImpersonation()` POST `/developer/impersonate/stop` (PRP-20; both audited server-side)
- **Server state via TanStack Query** (per PRP-09): convert `fetchSchools` to a proper `useQuery`/`useMutation` set with query keys `['developer','schools']`, `['developer','school',id]`, `['developer','plans']`, `['developer','permissions']`, `['developer','audit', params]`. Mutations `invalidateQueries` on success. Keep the Zustand store for any cross-cutting UI state only; the list normalization (`schoolsById`) can remain as a selector but the cache of record is React Query.

### 3.3 UI modules (`src/modules/developer/`)

Each screen is a module; pages in `app/developer/**` stay thin and render the module (mirroring how `schools/page.tsx` renders `SchoolList`). Reuse primitives from `src/components/ui/` (`Button`, `Modal`, `InputBox`, `SelectInput`, `Checkbox`, `Loader`), `DataGrid`, `MainWrapper`, `appToast`, and `cn()`.

- **`manage-school/SchoolList.tsx`** (extend existing): add a row action column (a `GRID_COLUMN_TYPE.CUSTOM` cell) linking to detail and surfacing primary lifecycle actions; surface a "Pending activation" filter/badge so the activation queue is visible.
- **`manage-school/SchoolDetail.tsx`** (new): header card (name/subdomain/board/status badge, owner admin), a **lifecycle action bar** (Activate → opens a modal with a **trial-length** input defaulting to 60 days + optional plan/cadence; Suspend; Lock; Reactivate; Extend trial), and a subscription summary panel (status, `trialEndsAt`, `currentPeriodEnd`, seat count). Actions call the `transitionSchool` mutation and toast the result.
- **`subscription/PlansScreen.tsx`** (new): list `SubscriptionPlan`s in a `DataGrid`; create/edit plan in a `Modal` (per-student rate, allowed cadences, active flag). Per-school subscription edits are reachable from `SchoolDetail`.
- **`access-control/PermissionMatrix.tsx`** (new): a role × permission grid. Rows = the canonical `PermissionKey`s (from the FE shared permission module reconciled in PRP-10, which mirrors backend PRP-17 §3.4); columns = the five `SchoolRole`s; cells = `Checkbox`. Editing a column batches into `setRolePermissions(role, keys[])`; a "Save" per role (or optimistic toggle) persists. Show a notice that the matrix is **global** (applies to all schools) and that `admin.transfer_ownership`/`school.manage_billing` are owner-only runtime gates (not matrix-toggleable).
- **`audit/AuditLogViewer.tsx`** (new): a `DataGrid` over `fetchAuditLogs` with filters (actor, action, entity type, date range, schoolId) and pagination; read-only.
- **`manage-school/ImpersonateAction.tsx`** (new): a guarded "Login as" button (in `SchoolDetail`/`SchoolList` row) that confirms via `Modal`, calls `impersonate(userId)`, then on success swaps the session (set access token + `bootstrapAuth`/`fetchMe`) and redirects to that user's role landing (`getHomeRouteForSystemRole`/PRP-25). Show a persistent "Impersonating <user> — exit" affordance (a small banner via the UI store, PRP-24's banner slot or a local one). All impersonation is audited server-side by PRP-20.

### 3.4 Guarding & menu

- All `developer/*` pages are DEVELOPER-only. Gate the `app/developer/layout.tsx` with the PRP-11 layout guard (DEVELOPER `systemRole`), so non-developers can't reach the console even if they guess a URL (server still enforces via PRP-20).
- Add the new sections to the developer menu. Per PRP-11, `project.menu.ts` becomes a single permission/role-tagged list using `APP_ROUTES` only — add Subscriptions, Access Control, Audit Logs entries pointing at the new routes (no hardcoded strings).

## 4. Implementation steps

1. **Routes:** add `schoolDetail(id)` and `subscriptions` to `APP_ROUTES.developer` in `src/constants/routes.ts` (keep existing keys; never hardcode paths in pages/menu).
2. **Types:** extend `src/store/developer/developer.type.ts` — widen `School`, add `SubscriptionPlan`, `AuditLogEntry`, `RoleMatrix`, and a `SchoolStatus`/`SubscriptionStatus` union mirroring PRP-15/16/17. Import the `SchoolRole`/`PermissionKey` types from the PRP-10 RBAC module rather than redefining.
3. **Services:** extend `src/store/developer/developer.services.ts` with `fetchSchool`, `transitionSchool`, plan CRUD, `fetchPermissionMatrix`/`setRolePermissions`, `fetchAuditLogs`, `impersonate` — all through `apiClient` + `helper.*` (components never call axios directly).
4. **Query layer:** refactor `manage-school/SchoolList.tsx` and add hooks (`src/store/developer/developer.queries.ts` or inline) using TanStack Query keys from §3.2; mutations invalidate on success (PRP-09 boundary).
5. **Pages (thin):** add `app/developer/schools/[schoolId]/page.tsx`, `app/developer/subscriptions/page.tsx`, `app/developer/access-control/page.tsx`, `app/developer/audit-logs/page.tsx` — each renders its module.
6. **Modules:** add `SchoolDetail.tsx`, `subscription/PlansScreen.tsx`, `access-control/PermissionMatrix.tsx`, `audit/AuditLogViewer.tsx`, `manage-school/ImpersonateAction.tsx`; extend `SchoolList.tsx` with the actions column + activation queue filter. Build the activate/extend-trial modals with `Modal` + `InputBox`/`SelectInput`.
7. **Impersonation session swap:** add a store action (auth or developer) that accepts the impersonation token, sets it via `setAccessToken`, runs `fetchMe`, and records an "impersonating" flag in `ui.store.ts` (currently an empty stub — give it a minimal shape) so the exit banner can render. Wire exit to call `stopImpersonation()` (`POST /developer/impersonate/stop`), clear the impersonation flag, and re-bootstrap as the SuperAdmin (or force re-login per PRP-20's contract).
8. **Menu + guard:** add the new developer sections to `project.menu.ts` (via `APP_ROUTES`, per PRP-11) and apply the PRP-11 DEVELOPER guard to `app/developer/layout.tsx`.

## 5. Files added / changed

- **Add:** `src/app/developer/schools/[schoolId]/page.tsx`, `src/app/developer/subscriptions/page.tsx`, `src/app/developer/access-control/page.tsx`, `src/app/developer/audit-logs/page.tsx`; `src/modules/developer/manage-school/SchoolDetail.tsx`, `src/modules/developer/manage-school/ImpersonateAction.tsx`, `src/modules/developer/subscription/PlansScreen.tsx`, `src/modules/developer/access-control/PermissionMatrix.tsx`, `src/modules/developer/audit/AuditLogViewer.tsx`, optional `src/store/developer/developer.queries.ts`
- **Edit:** `src/store/developer/developer.services.ts`, `src/store/developer/developer.type.ts`, `src/store/developer/developer.store.ts` (trim to React-Query boundary), `src/modules/developer/manage-school/SchoolList.tsx` (+ `utils.ts` columns), `src/constants/routes.ts`, `src/constants/project.menu.ts`, `src/app/developer/layout.tsx`, `src/store/ui.store.ts` (impersonation flag)

## 6. Acceptance criteria

- [ ] SuperAdmin sees a schools list with a visible **activation queue** (PENDING schools) and can open a detail page per school.
- [ ] Activating a school opens a modal with a **trial-length** field (default 60 days, may be 0) plus optional plan/cadence and calls PRP-20's activate endpoint; suspend / lock / reactivate / extend-trial all work and reflect the new status without a manual refresh.
- [ ] Subscription/plan management lists plans and supports create/edit (per-student rate, cadences); per-school subscription state is visible on the detail page.
- [ ] The permission-matrix editor renders role × permission, persists edits via PRP-17's editor endpoint, and shows the "global / owner-only" notices; the strings match the backend PRP-17 contract.
- [ ] The audit-log viewer lists entries with working filters + pagination (read-only).
- [ ] "Login as" performs an audited impersonation, swaps the session, lands on the impersonated user's role page, and offers a clear "exit impersonation" affordance.
- [ ] No page calls `axios` directly; all data flows through `store/developer/*.services.ts` + TanStack Query; no hardcoded route strings (all from `APP_ROUTES`).

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Manual (against a backend with PRP-15/16/17/18/20): seed a PENDING school → activate with `trialDays: 60` → confirm status flips and subscription shows TRIALING; toggle a permission and confirm it persists; filter the audit log; impersonate an Admin and exit.

## 8. Risks & rollback

- **API shape coupling:** depends on PRP-20's exact response envelopes — land after PRP-15/16/17/18/20 or stub the services behind a feature flag. Keep all shapes in `developer.type.ts` so a contract change is one-file.
- **Impersonation safety:** the session swap must never leave a half-set state — fail closed (clear session) on any error, and surface the impersonation banner so the operator can't forget they're acting as someone else. Server-side audit (PRP-20) is the source of truth; FE gating is UX only.
- **Permission-string drift:** the matrix rows must come from the PRP-10 shared module (which mirrors PRP-17); do not hand-type keys.
- Rollback: the new pages/routes are additive; revert the module/service additions and the catch-all reclaims the unused routes. Do not revert the shared `routes.ts`/RBAC changes that PRP-23–26 also depend on.
