# PRP-10 — RBAC model, abilities & active school

> **Status:** Proposed · **Phase:** 3 · **Severity:** 🔴 High · **Size:** L **Addresses:** RB1, RB2 · **Depends on:** PRP-06 (session) · **Pairs with:** backend PRP-17 (canonical `resource.action` permission strings), PRP-12 (active-school transport)

## 1. Problem / current state

The multi-tenant model is not modeled on the frontend:

- **RB1:** `src/constants/roles.ts` uses kebab strings (`developer`, `school-admin`, `teacher`, `staff`, `student`) that don't match the backend enums (`SystemRole = USER|DEVELOPER`, `SchoolRole = ADMIN|STAFF|TEACHER|STUDENT|PARENT`) — no `parent`, wrong casing. `src/constants/permissions.ts` is a rich `resource.action` map that is **never evaluated** — and its keys (`view`/`add_new`/`manage`, plural `exams`) share **zero strings** with the backend contract, so it is legacy, not a starting point.
- **RB2:** `src/types/user.type.ts:16` types `schools?: unknown[]`, though the backend returns `{ schoolId, name, subdomain, status, primaryRole }` per school. There's no "active school", no switcher, no school-scoped role — a user who is ADMIN at school A and TEACHER at school B can't be represented.

## 2. Goal & non-goals

- **Goal:** a typed role/permission model mirroring the backend, an `activeSchoolId` in session, and `deriveAbilities(user, activeSchoolId) → Set<Permission>`.
- **Non-goals:** building the menu/guards (PRP-11) or backend enforcement (PRP-12) — this PRP is the model they consume.

## 3. Target design

- **Types:** `SystemRole`/`SchoolRole` mirror backend enums; `UserSchool = { schoolId, name, subdomain, status, primaryRole: SchoolRole; secondaryRoles?: SchoolRole[] }`; `User.schools: UserSchool[]`.
- **Permission map:** `src/constants/permissions.ts` is **replaced verbatim** by the backend PRP-17 canonical `resource.action` list — it is **not merged** with the legacy keys (the old `view`/`add_new`/`manage` + plural `exams` share zero strings with the contract). Reconcile the old naming onto the contract: `view → read`, `add_new → invite`, plural `exams → exam`. The output is a canonical `Permission` union + `ROLE_PERMISSIONS: Record<SchoolRole, Permission[]>` (+ a developer/system layer). **Strings must match backend PRP-17 verbatim** (PRP-17 is the authoritative owner of the permission-string list).
- **Active school:** `activeSchoolId` in the auth/session store, persisted per user (localStorage keyed by userId, or a cookie if SSR ever needs it); defaults to the first active membership.
- **Active-school transport (hard FE↔BE contract):** the active-school identifier must be injected into every outbound API call (header or param, per the transport PRP-12 chooses) so school-scoped endpoints (PRP-22/24/26) resolve `request.schoolContext` server-side. This PRP **owns** wiring that injection into `src/lib/api-client.ts`.
- **`deriveAbilities(user, activeSchoolId)`:** resolves the membership → role(s) → permission set; pure and unit-testable.

## 4. Implementation steps

1. Replace `src/constants/roles.ts` with backend-mirrored enums; update all imports (`auth-redirect.ts`, `default.tsx`, etc. currently compare `'DEVELOPER'`).
2. Type `schools` in `src/types/user.type.ts` as `UserSchool[]`; reuse/define `UserSchool` (matches backend `AuthUserSchool`).
3. Replace `src/constants/permissions.ts` **verbatim** with the backend PRP-17 canonical `resource.action` list (do not merge the legacy `view`/`add_new`/`manage`/plural-`exams` keys; map `view→read`, `add_new→invite`, `exams→exam`) into `Permission` + `ROLE_PERMISSIONS` (+ document the role→permission matrix). Strings are owned by backend PRP-17. Ensure the generated `ROLE_PERMISSIONS` does **not** grant the owner-only runtime gates `admin.transfer_ownership` or `school.manage_billing` to any role — these are derived at runtime from `ownerUserId`, not from the role matrix (see PRP-26).
4. Add `activeSchoolId` to the session store (PRP-06): setter `setActiveSchool(id)`, persistence, default selection on `fetchMe`.
5. Inject the `activeSchoolId` into `src/lib/api-client.ts` (request interceptor) as the active-school header/param per PRP-12's chosen transport, so school-scoped calls (PRP-22/24/26) carry tenant context. **Hard FE↔BE contract** — agree the transport with PRP-12 in writing.
6. Add `src/lib/abilities.ts` with `deriveAbilities(user, activeSchoolId)` + unit tests.
7. (Minimal UI) a basic school switcher reading `user.schools` and calling `setActiveSchool`; wire into the header/profile menu (full UI can come later).

## 5. Files added / changed

- **Add:** `src/lib/abilities.ts`, `src/store/auth/*` (active school), school-switcher component
- **Edit:** `src/constants/roles.ts`, `src/constants/permissions.ts`, `src/types/user.type.ts`, `src/lib/api-client.ts` (active-school transport), callers of `ROLES`/`systemRole`

## 6. Acceptance criteria

- [ ] `user.schools` is fully typed end-to-end; no `unknown[]`.
- [ ] Switching active school changes `deriveAbilities` output and persists across reloads.
- [ ] Permission strings are identical to backend PRP-17 (the legacy `permissions.ts` keys are gone, not merged).
- [ ] `ROLE_PERMISSIONS` grants no role `admin.transfer_ownership` or `school.manage_billing` (owner-only runtime gates).
- [ ] Outbound API calls carry the active-school identifier (PRP-12 transport) so school-scoped endpoints resolve tenant context.
- [ ] `deriveAbilities` has unit tests covering multi-school, secondary roles, developer.

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Unit: `deriveAbilities` matrix. Manual: a user with two memberships can switch and see abilities change.

## 8. Risks & rollback

- The permission-string contract (backend PRP-17) and the active-school transport (PRP-12) are the critical couplings — agree both once, in writing, before PRP-11/PRP-12 build on them.
- Rollback: revert; but coordinate because PRP-11 depends on this.
