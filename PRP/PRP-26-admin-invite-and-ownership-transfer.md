# PRP-26 — Additional-admin invite & ownership-transfer UI

> **Status:** Proposed · **Phase:** 1 · **Severity:** 🟠 Med · **Size:** M **Addresses:** P1-FE-5 (master-prp §7.2.5, decision D16) · **Depends on:** backend PRP-21 (invite additional admins + ownership-transfer endpoints; owner-only guard) · **Pairs with:** PRP-10/PRP-11 (abilities + `<Can>`/guards), PRP-17 (permission strings `admin.invite`, `admin.transfer_ownership`), PRP-25 (Admin landing)

## 1. Problem / current state

There is **no Admin-facing member management** on the web. A school's only admin is the founding owner created at onboarding; the frontend has no screen to **invite additional Admins** and no way to **transfer ownership** to another admin. The developer area lists schools (`src/modules/developer/manage-school/`) but that's SuperAdmin tooling, not the in-school Admin experience. The `(school)` group has only dashboard/profile/school placeholders.

Backend PRP-21 adds: invite additional `ADMIN`s (reusing the PASSWORD_RESET invite flow), an ownership-transfer endpoint (reassign `School.ownerUserId`), and an **owner-only** guard for billing/transfer. Per PRP-17, `admin.invite` is in the ADMIN matrix but `admin.transfer_ownership` and `school.manage_billing` are **owner-only runtime gates** (an ADMIN holds them only if they are the `ownerUserId`). This PRP builds the Admin screens on top of PRP-21.

## 2. Goal & non-goals

- **Goal:** an Admin "Administrators / members" screen to **invite additional Admins** (email/name → triggers the backend invite) and a **transfer-ownership** action (owner-only) that reassigns ownership to another existing admin, with appropriate confirmation. All wiring through a `store/admin/` (or `store/members/`) service + TanStack Query; gated by `<Can>` (PRP-11) and the owner-only check.
- **Non-goals:** full staff/teacher/student management (P2 — this is Admin-on-Admin only); the SuperAdmin console (PRP-22); the setup-password screen invitees land on (already exists at `(school)/../(auth)/set-password`); backend endpoints (PRP-21). General member/role editing beyond admins is out of scope for P1.

## 3. Target design

### 3.1 Routes (`src/constants/routes.ts`)

Add an Admin members route under the `(school)` group: `school.admins` → `/admins` (or `/settings/admins`). Strings only in `APP_ROUTES`.

### 3.2 State & services (`src/store/admin/`)

New feature folder (house split):

- `admin.type.ts`: `AdminMember = { userId; name; email; status; isOwner: boolean }`, `InviteAdminPayload = { name; email; phone? }`, and an `ownerUserId` reference on the school. Reuse PRP-10's `UserSchool`/role types where possible.
- `admin.services.ts` (through `apiClient` + `helper.*`). The active school is resolved server-side from `request.schoolContext` (carried by the PRP-10 active-school transport), so **never put `schoolId` in a request body** — keep it only as a client query-key dimension:
  - `fetchAdmins()` → GET the admins list (PRP-21 surface; school from context)
  - `inviteAdmin(payload)` → POST invite — body is `{ name; email; phone? }` only (no `schoolId`); server sends the PASSWORD_RESET invite email and the FE just confirms acknowledgement
  - `transferOwnership(toUserId)` → POST ownership-transfer — body is `{ toUserId }` only (no `schoolId`); owner-only server-side
- Server state via TanStack Query (`['admins', schoolId]` — `schoolId` here is a **cache-key dimension** so the list refetches per active school, not a request-body field); `inviteAdmin`/`transferOwnership` are `useMutation`s that `invalidateQueries(['admins', schoolId])` on success.

### 3.3 UI module (`src/modules/admin-members/`)

- `AdminMembers.tsx`: a `MainWrapper` + `DataGrid` listing administrators (name/email/status, an "Owner" badge for the `ownerUserId`). Page actions:
  - **Invite Admin** (`<Can permission="admin.invite">`): opens a `Modal` with `InputBox` fields (name, email, optional phone); on submit calls `inviteAdmin`, toasts success ("Invite sent — they'll receive an email to set their password"), and refreshes the list. The invitee follows the existing set-password flow on activation.
  - **Transfer ownership** (owner-only): a per-row "Make owner" action, visible only when the current user is the owner (`isOwner` from the active membership / `ownerUserId`). Opens a confirm `Modal` ("Transfer ownership to <name>? You will remain an Admin but lose owner-only abilities like billing.") and calls `transferOwnership`. On success, re-fetch admins and re-run `fetchMe`/`bootstrapAuth` so the current user's owner-derived abilities (billing, transfer) update.
- Reuse `Button`, `Modal`, `InputBox`, `DataGrid`, `appToast`, `cn()`.

### 3.4 Gating (PRP-11 + owner-only)

- The screen and the menu entry are gated by `<Can permission="admin.invite">` / route guard so only Admins see it.
- The **transfer-ownership** control is additionally owner-only: derive `isOwner` from the active school's `ownerUserId` vs `user.userId` (PRP-10 types `user.schools`/active membership; coordinate exposing `ownerUserId` on the membership or the admins list). This mirrors PRP-17's runtime owner gate — the matrix does not grant `admin.transfer_ownership`; it's a runtime check. Server (PRP-21) is authoritative; the FE hides the control as UX.
- Add an "Administrators" entry to the Admin menu (`project.menu.ts`, tagged `requires: ['admin.invite']`, `APP_ROUTES` only).

## 4. Implementation steps

1. **Routes:** add `school.admins` to `src/constants/routes.ts`.
2. **Types/service:** add `src/store/admin/{type,services}.ts` with `fetchAdmins()`, `inviteAdmin(payload)`, `transferOwnership(toUserId)`, normalized via `helper.*`. Reuse PRP-10 role/membership types. No request body carries `schoolId` — the active school rides the PRP-10 transport into `request.schoolContext`.
3. **Query hooks:** add the `['admins', schoolId]` query + invite/transfer mutations (in the module or `src/store/admin/admin.queries.ts`), invalidating on success (PRP-09 boundary).
4. **Module:** add `src/modules/admin-members/AdminMembers.tsx` (+ a local `utils.ts` for grid columns), with the invite modal and owner-only transfer confirm modal.
5. **Page (thin):** add `src/app/(school)/admins/page.tsx` rendering `AdminMembers`.
6. **Owner-derived abilities refresh:** after a successful transfer, call `useAuthStore().fetchMe()` (or `bootstrapAuth`) so the acting user's owner-only abilities (billing/transfer) re-resolve; ensure the billing menu/guard (PRP-24) reacts.
7. **Menu + guard:** add the "Administrators" entry to `project.menu.ts` (tagged `admin.invite`) and gate the page via PRP-11 (`<Can>` / route guard).

## 5. Files added / changed

- **Add:** `src/store/admin/admin.type.ts`, `src/store/admin/admin.services.ts` (optional `admin.queries.ts`), `src/modules/admin-members/AdminMembers.tsx`, `src/modules/admin-members/utils.ts`, `src/app/(school)/admins/page.tsx`
- **Edit:** `src/constants/routes.ts`, `src/constants/project.menu.ts`

## 6. Acceptance criteria

- [ ] An Admin can open the Administrators screen, see the current admins (with the owner badged), and invite a new Admin by name/email; the server sends the invite and the list refreshes.
- [ ] The **transfer-ownership** control appears only to the current owner; transferring reassigns ownership (PRP-21), and the previous owner's owner-only abilities (billing/transfer) disappear after the post-transfer `fetchMe`.
- [ ] A non-owner Admin cannot see the transfer control; a non-Admin cannot reach the screen (PRP-11 gate; server authoritative via PRP-21).
- [ ] All data flows through `store/admin/*.services.ts` + TanStack Query (no direct axios); routes from `APP_ROUTES`; classes via `cn()`; responses via `helper.*`.

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Manual (against PRP-21): as an owner, invite a second admin → confirm they receive a set-password invite and appear in the list; transfer ownership to them → confirm the owner badge moves and your billing/transfer affordances disappear after refresh; verify a non-owner admin sees no transfer control.

## 8. Risks & rollback

- **Owner-only contract:** `isOwner` derivation depends on `ownerUserId` being exposed on the membership/admins payload (coordinate with PRP-21/PRP-10). The FE hide is UX only — PRP-21 must enforce owner-only server-side.
- **Stale abilities after transfer:** forgetting the post-transfer `fetchMe` would leave the old owner with phantom billing/transfer UI — the refresh step is required (server will still reject, but the UI must reconcile).
- **Invite reuse:** invites reuse the existing PASSWORD_RESET/setup-password flow — no new invite UI needed beyond the email field; confirm the backend reuses it (PRP-21).
- Rollback: fully additive (new route/page/module/service + one menu entry); revert without touching existing screens.
