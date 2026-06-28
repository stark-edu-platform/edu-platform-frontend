# PRP-43 — Parent portal (web) & attendance admin/teacher views

> **Status:** Proposed · **Phase:** 3 · **Severity:** 🟠 Med · **Size:** L **Addresses:** P3-FE-1 (master-prp §6 P3, decisions D17/D20) · **Depends on:** backend PRP-38 (attendance config/records/marking/reports source), PRP-40 (attendance reports + CSV export + low-attendance), PRP-41 (parent multi-child aggregation APIs), PRP-39 (staff attendance — admin view); FE PRP-10 (`deriveAbilities`/`activeSchoolId`/typed roles + the shared permission keys), PRP-11 (permission menu + `<Can>`/route guards), PRP-25 (per-role landing pages this fills), PRP-24 (`<WriteGate>` / subscription banner) · **Pairs with:** mobile PRP-42 (same backend, parallel UX)

## 1. Problem / current state

After P1/P2, the web app has a role-aware shell (PRP-10/11/25) and academic setup (P2), but **no attendance or parent surfaces**. The per-role landing pages from PRP-25 (`teacher-dashboard`, `parent-dashboard`, `admin-dashboard`) are deliberately light placeholders that P3 must fill. Specifically:

- There is no **attendance marking/register** screen for teachers, no **admin attendance reports** (per-class/per-student/defaulter), no **staff-attendance** admin view (PRP-39), and no **student** self-attendance view.
- The `parent-dashboard` placeholder (PRP-25 §3.2) has no real multi-child content; PRP-41 now exposes the aggregation APIs (`/me/children`, `/school/parent/dashboard`, per-child attendance) but nothing consumes them.
- `APP_ROUTES.school` already reserves `attendance` under the student map (`src/constants/routes.ts:56`) but there are no parent/teacher/admin attendance routes, and no `store/attendance` or `store/parent` slices.

Backend PRP-38/40/41 (+ PRP-39) now provide the full data + write surface, tenant-scoped (PRP-12) and write-gated (PRP-15). This PRP builds the web screens on top, following the house conventions: UI in `src/modules/<feature>/`, client state/API in `src/store/<feature>/` (`*.store.ts`/`*.services.ts`/`*.type.ts`), server state via **TanStack Query**, routes from **`APP_ROUTES`** only, responses normalized through `helper.*`, classes via `cn()`, and write controls gated by PRP-24's `<WriteGate>` + the server (PRP-15) staying authoritative.

## 2. Goal & non-goals

- **Goal:** (a) **teacher/admin attendance** — a section+date register screen to mark/edit attendance (PRP-38), respecting DAILY vs PERIOD config; (b) **attendance reports** — per-class, per-student, and low-attendance/defaulter views with the PRP-40 CSV download; (c) a **staff-attendance** admin view (PRP-39); (d) a **student** self-attendance view (`attendance.read_own`); (e) the **parent multi-child dashboard** (PRP-41) + per-child attendance, including the cross-school child switcher (D17). All via `store/attendance` + `store/parent` services + TanStack Query; all routes in `APP_ROUTES`; write UI gated by `<WriteGate>` + permission keys mirroring the backend.
- **Non-goals:** backend changes (PRP-38/39/40/41 own the APIs); the offline/mobile capture (mobile PRP-42 — web marking is online-only, no local queue); absence-alert config (PRP-40 is server-side; no FE config screen in P3 ⚠︎); fees/results/notices in the parent dashboard (P4–P6 fill PRP-41's reserved slots — render "coming soon"); the role landing-page shells themselves (PRP-25 — this PRP fills the teacher/parent/admin/student content within them); charts beyond simple summaries (keep it tabular + light in P3).

## 3. Target design

### 3.1 Routes (extend `APP_ROUTES`)

New strings live **only** in `src/constants/routes.ts` (never hardcoded in pages/menu). Collapse the duplicative per-role `school.*` maps per PRP-11/25 into clean feature routes:

- `school.attendance.mark` → `/attendance` (teacher/admin marking + register)
- `school.attendance.reports` → `/attendance/reports` (admin/teacher reports)
- `school.attendance.student(id?)` → `/attendance/student/[studentId]` (per-student detail; also the student's own view at `/attendance` for STUDENT)
- `school.staffAttendance` → `/staff-attendance` (admin staff register)
- `school.parent.dashboard` → `/parent` (PRP-25's parent landing — filled here)
- `school.parent.child(id)` → `/parent/child/[studentId]` (per-child attendance)

### 3.2 State & services

Two new feature slices following the store split (components never call axios directly — through services; server state via TanStack Query per PRP-09):

**`src/store/attendance/`:**

- `attendance.type.ts`: `AttendanceStatus` union + `AttendanceMode` + the register/record/summary shapes mirroring **PRP-38** verbatim (and `AttendanceConfig`). Reuse `SchoolRole`/`PermissionKey` from the PRP-10 RBAC module — don't redefine.
- `attendance.services.ts` (via `apiClient` + `helper.*`): `fetchConfig(sectionId)`, `updateConfig(...)`, `fetchRegister(sectionId, date, period?, subjectId?)`, `markRegister(sectionId, marks[])` (POST PRP-38), `editRecord(id, patch)`, `fetchStudentReport(studentId, range)` / `fetchClassReport(sectionId, range)` / `fetchLowAttendance(params)` (PRP-40), `exportClassCsv(sectionId, range)` (PRP-40's CSV route → download), and the staff equivalents `fetchStaffRegister`/`markStaffRegister`/`fetchStaffSummary` (PRP-39).
- TanStack Query keys: `['attendance','register',sectionId,date]`, `['attendance','config',sectionId]`, `['attendance','report','class',sectionId,range]`, `['attendance','report','student',studentId,range]`, `['attendance','low',params]`, `['staffAttendance','register',date]`. Mutations (`markRegister`/`editRecord`/`updateConfig`/`markStaffRegister`) `invalidateQueries` on success.

**`src/store/parent/`:**

- `parent.type.ts`: `LinkedChild` + the dashboard payload (with PRP-41's reserved nullable `fees`/`results`/`notices` slots) mirrored verbatim from PRP-41.
- `parent.services.ts`: `fetchMyChildren()` (GET `/me/children`), `fetchParentDashboard()` (GET `/school/parent/dashboard`), `fetchChildAttendance(studentId, range)` (GET `/school/parent/children/:id/attendance`).
- Query keys: `['parent','children']`, `['parent','dashboard',activeSchoolId]`, `['parent','child',studentId,'attendance',range]`.

### 3.3 Teacher/Admin attendance marking (`src/modules/attendance/`)

- **`AttendanceMarkScreen.tsx`** (page `app/(school)/attendance/page.tsx`): a `SectionPicker` (teacher's assigned sections — PRP-38/30) + date picker (default today); for a PERIOD-mode section (`AttendanceConfig`, PRP-38) also pick period/subject. Renders the enrolled roster (PRP-38's roster-join) in a `DataGrid`/table, each student a status control limited to the config's `allowedStatuses`. A "mark all present then exception-edit" flow (the realistic pattern). **Save** posts `markRegister`; controls are wrapped in PRP-24's `<WriteGate>` (disabled-with-tooltip when the school is READ_ONLY/LOCKED — server still enforces via PRP-15). Edits past the edit window / on a locked config surface PRP-38's rejection (toast) — and the screen shows the lock/window state ⚠︎ (O-P3).
- Permission-gated by the mirrored `attendance.mark` key via `<Can>` (PRP-11); a teacher only sees their assigned sections (server-enforced; the picker reflects them).

### 3.4 Attendance reports (`src/modules/attendance/`)

- **`AttendanceReportsScreen.tsx`** (`app/(school)/attendance/reports/page.tsx`): tabs/sections for **Class summary** (`fetchClassReport` over a date range — per-student rows with present/absent/% present), **Per-student** (`fetchStudentReport` — day-by-day history, linkable from the class table), and **Low-attendance / defaulters** (`fetchLowAttendance` with a threshold input, default 75 from PRP-40). A **Download CSV** button hits PRP-40's `exportClassCsv` (server-side CSV) and triggers a browser download. Gated by `attendance.read` (`<Can>`).
- **`StudentAttendanceView.tsx`** (`app/(school)/attendance/student/[studentId]/page.tsx`): reused for both the admin/teacher per-student detail and the **STUDENT's own** view (a STUDENT lands here at `/attendance` with `attendance.read_own` — only their own record). Read-only; tallies + a simple calendar/list.

### 3.5 Staff attendance admin view (`src/modules/staff-attendance/`)

- **`StaffAttendanceScreen.tsx`** (`app/(school)/staff-attendance/page.tsx`): a date + optional department filter; the active staff/teacher roster (PRP-39 register-join) with status controls; Save posts `markStaffRegister`. A summary tab over a range (`fetchStaffSummary`). Gated by the mirrored `staff_attendance.mark`/`staff_attendance.read` keys; write controls wrapped in `<WriteGate>`.

### 3.6 Parent multi-child dashboard (`src/modules/parent-dashboard/` — fills PRP-25's placeholder)

- **`ParentDashboard.tsx`** (rendered by PRP-25's `app/(school)/parent/page.tsx`): calls `fetchMyChildren` (cross-school roster) + `fetchParentDashboard` (active-school per-child summaries). Renders a **card per child** with last-7 attendance + recent absences (PRP-41 §3.4). PRP-41's reserved `fees`/`results`/`notices` slots render as **"coming soon"** placeholders (P4–P6 fill them). When `/me/children` spans multiple schools (D17), a **child/school switcher** (tied to PRP-10's `activeSchoolId` selection) re-scopes the `/school/parent/*` queries.
- **`ChildAttendanceView.tsx`** (`app/(school)/parent/child/[studentId]/page.tsx`): per-child attendance history + % present (`fetchChildAttendance`, PRP-41 → PRP-40). Read-only. A non-linked `studentId` is rejected server-side (PRP-41); the FE surfaces a clean not-found.
- Gated by the mirrored `parent.read_children` / `parent.read_child_attendance` keys.

### 3.7 Menu & guards (PRP-11)

Add entries to `src/constants/project.menu.ts` (permission-tagged, `APP_ROUTES` only, per PRP-11/25's sectioned menu): an **Attendance** entry (teacher/admin, `attendance.mark`/`attendance.read`), **Reports** under it (`attendance.read`), **Staff Attendance** (admin, `staff_attendance.read`), and the parent **Children** entry (`parent.read_children`). The student's **Attendance** entry (`attendance.read_own`) points at `/attendance` → `StudentAttendanceView`. Visibility flows from `deriveAbilities` (PRP-10) — no hardcoded role checks. All pages under `(school)` inherit PRP-24's subscription banner + the PRP-11 route guards.

## 4. Implementation steps

1. **Routes:** add the `school.attendance.*`, `school.staffAttendance`, `school.parent.*` keys to `src/constants/routes.ts` (collapse the duplicative per-role maps per PRP-11/25; never hardcode).
2. **Types/services (attendance):** add `src/store/attendance/{type,services}.ts` mirroring PRP-38/39/40 shapes; all calls via `apiClient` + `helper.*`. Add a small CSV-download helper for the export route.
3. **Types/services (parent):** add `src/store/parent/{type,services}.ts` mirroring PRP-41 (including the reserved slots).
4. **Query hooks:** add hooks (inline or `*.queries.ts`) with the §3.2 keys; mutations `invalidateQueries` (PRP-09 boundary). No parallel Zustand cache.
5. **Attendance UI:** add `src/modules/attendance/{AttendanceMarkScreen,AttendanceReportsScreen,StudentAttendanceView}.tsx` + `src/modules/staff-attendance/StaffAttendanceScreen.tsx`; reuse `DataGrid`, `Button`, `Modal`, `SelectInput`, `Loader`, `appToast`, `cn()`, and PRP-24's `<WriteGate>`.
6. **Parent UI:** add `src/modules/parent-dashboard/{ParentDashboard,ChildAttendanceView}.tsx`; wire `ParentDashboard` into PRP-25's `app/(school)/parent/page.tsx` (replace the placeholder body).
7. **Pages (thin):** add `app/(school)/attendance/page.tsx`, `app/(school)/attendance/reports/page.tsx`, `app/(school)/attendance/student/[studentId]/page.tsx`, `app/(school)/staff-attendance/page.tsx`, `app/(school)/parent/child/[studentId]/page.tsx` — each renders its module.
8. **Menu + guards:** add the permission-tagged entries to `project.menu.ts` (via `APP_ROUTES`, PRP-11); confirm `<Can>`/route guards gate each screen and `<WriteGate>` wraps every mutating control.

## 5. Files added / changed

- **Add:** `src/store/attendance/{attendance.type,attendance.services}.ts`, `src/store/parent/{parent.type,parent.services}.ts`, `src/modules/attendance/{AttendanceMarkScreen,AttendanceReportsScreen,StudentAttendanceView}.tsx`, `src/modules/staff-attendance/StaffAttendanceScreen.tsx`, `src/modules/parent-dashboard/{ParentDashboard,ChildAttendanceView}.tsx`, pages `src/app/(school)/attendance/page.tsx`, `src/app/(school)/attendance/reports/page.tsx`, `src/app/(school)/attendance/student/[studentId]/page.tsx`, `src/app/(school)/staff-attendance/page.tsx`, `src/app/(school)/parent/child/[studentId]/page.tsx`, optional `src/store/{attendance,parent}/*.queries.ts`
- **Edit:** `src/constants/routes.ts`, `src/constants/project.menu.ts`, `src/app/(school)/parent/page.tsx` (PRP-25 placeholder → `ParentDashboard`)

## 6. Acceptance criteria

- [ ] A teacher can pick an assigned section + date, see the enrolled roster, mark/edit attendance (statuses limited to the config's `allowedStatuses`, DAILY vs PERIOD honored), and Save — through `store/attendance` services + TanStack Query (no direct axios); the register refreshes via query invalidation.
- [ ] Write controls are wrapped in `<WriteGate>` (PRP-24) and disable in READ_ONLY/LOCKED; the server (PRP-15) remains authoritative; an edit past the window / on a locked config surfaces PRP-38's rejection.
- [ ] Admin/teacher reports show class summary, per-student history, and a low-attendance/defaulter list with a threshold; **Download CSV** retrieves PRP-40's server-side export.
- [ ] The staff-attendance admin view marks + summarizes staff attendance (PRP-39), permission-gated.
- [ ] A STUDENT sees only their own attendance (`attendance.read_own`); a PARENT sees a multi-child dashboard (PRP-41) with per-child last-7 + recent absences and a per-child history; the `fees`/`results`/`notices` slots render as "coming soon"; cross-school children are switchable (D17); a non-linked child is cleanly not-found.
- [ ] All routes come from `APP_ROUTES`; menu entries are permission-tagged (PRP-11) and visibility flows from `deriveAbilities` (PRP-10); permission keys match the backend (PRP-17/38/39/40/41) verbatim.

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Manual (against a backend with PRP-38/39/40/41 + P2 seed): as a teacher, mark a section → confirm it persists and reloads; force the school READ_ONLY → write controls disable, server rejects a forced write; as an admin, open reports → class summary + defaulter list + CSV download; as a student, confirm only-own attendance; as a parent with two children (one across a second school), confirm both appear, the switcher works, per-child history matches the backend, and the reserved slots show placeholders.

## 8. Risks & rollback

- **Server is authoritative (PRP-15/PRP-12):** `<WriteGate>` + `<Can>` are UX only — never the security boundary. The teacher-assignment scoping and the parent↔child link check are enforced server-side (PRP-38/41); the FE must handle a `403/404` gracefully (a non-linked child, an unassigned section) rather than assume the menu prevented it.
- ⚠︎ **O-P3 surfaces in the UI:** the edit/lock window (PRP-38 §3.6) and which statuses alert (PRP-40) are open — the marking screen should show the window/lock state and not hard-code a window; absence-alert config has no FE screen in P3 (server-config only). Keep these soft so the O-P3 resolution doesn't force a redesign.
- **Contract coupling:** the attendance/parent response shapes must mirror PRP-38/40/41 exactly — keep them in `*.type.ts` so a backend contract change is one file (mirrors PRP-22/24's risk note). The permission keys must come from the PRP-10 shared module (which mirrors PRP-17), not be hand-typed.
- **Web is online-only:** unlike mobile (PRP-42), the web marking screen has no offline queue — it posts live. Don't half-build offline on web; that flow is mobile's (PRP-42). If a teacher loses connectivity mid-mark, surface a clear error and let them retry (the post is idempotent server-side via PRP-38 only if a `clientRef` is sent — web can send one per register-save to be safe, but P3 web treats marking as online).
- **CSV download:** stream/download via the PRP-40 endpoint (don't build the CSV client-side) so large classes don't bloat the browser; respect the auth header (the export route is permission-gated).
- Rollback: all additive — revert the new modules/stores/pages/routes/menu entries; PRP-25's parent placeholder restores by reverting the one `app/(school)/parent/page.tsx` edit. The catch-all (`app/[...slug]`) reclaims the unused routes. No existing behavior changes.
