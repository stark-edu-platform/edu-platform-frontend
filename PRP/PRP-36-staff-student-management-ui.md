# PRP-36 — Staff & student management UI (SIS + guardian/sibling linkage)

> **Status:** Proposed · **Phase:** 2 · **Severity:** 🔴 High · **Size:** XL **Addresses:** P2-FE-2 (implementation-plan PRP-36; master-prp §3 D16/D17/D19, §4 personas, §6 P2) · **Depends on:** backend PRP-30 (staff/teacher onboarding & management, `Department`, `TeacherAssignment`), backend PRP-31 (Student SIS + guardian/sibling linkage); FE PRP-10 (abilities/`activeSchoolId`), PRP-11 (permission menu + guards), PRP-25 (Admin/Teacher landings + merged nav), PRP-35 (years/grades/sections/subjects the assignment + enrollment screens reference), PRP-26 (admin-invite pattern this reuses) · **Pairs with:** PRP-37 (admissions feed new students; promotion uses enrollment)

## 1. Problem / current state

There is **no people-management surface** on the school side. The Admin/Teacher route maps in `APP_ROUTES.school` declare `staff` and `students` strings, but `src/app/(school)/` has no such pages — they fall through to `app/[...slug]/page.tsx` ("not built yet"). The only member-management code is the **SuperAdmin** school list (`src/modules/developer/manage-school/`) and the Admin-on-Admin screen planned in PRP-26 — neither manages staff/teachers or students. There is no `src/store/staff/` or `src/store/student/` feature folder, no SIS detail view, and no guardian/sibling linkage UI. The legacy `project.menu.ts` `user` array hardcodes "Staff"/"Students" at `/user/staff`/`/user/students`, which don't resolve.

Backend PRP-30 extends Teacher/Staff profiles and adds `Department` + `TeacherAssignment` (section × subject × year), reusing the invite flow. PRP-31 extends the existing `Student`/`ParentStudent` model with profiles, documents, **many-to-many guardians** (a student can have 2 guardians; a parent can have children across branches), and **sibling grouping** (D17). This PRP builds the Admin/Staff web screens on top of both: staff & student lists, the student SIS detail, and the guardian/sibling linkage UI.

## 2. Goal & non-goals

- **Goal:** two related management areas under the `(school)` group:
  1. **Staff & teachers** — a list (`DataGrid`) with **invite/onboard** (reusing the PRP-26/PRP-30 invite flow), a staff detail/profile view, `Department` management, and **teacher assignment** (section × subject for the active year, consuming PRP-35's sections/subjects).
  2. **Students (SIS)** — a student list with filters (grade/section/year from PRP-35), a rich **student detail** (profile, documents, academic trail), and **guardian/sibling linkage** (link existing/new parents as guardians many-to-many; group siblings) per D17. All wiring through new `src/store/staff/` and `src/store/student/` services + TanStack Query; lists via `DataGrid`; create/edit/link via `Modal`s; routes from `APP_ROUTES`; `cn()` + `helper.*`.
- **Non-goals:** backend endpoints/tables (PRP-30/31); admissions inquiry→application→enroll (PRP-37) and year-end promotion (PRP-37); CSV/Excel bulk import (PRP-37 / backend PRP-34); the academic _structure_ CRUD (PRP-35 — this PRP **consumes** grades/sections/subjects); parent-portal views (P3 / PRP-43); attendance, fees, exams (P3+). Per-school custom roles are out of scope (master §2).

## 3. Target design

### 3.1 Routes (`src/constants/routes.ts`)

Add people-management keys to `APP_ROUTES.school` (strings only here):

- `school.staff.list` → `/staff`, `school.staff.detail(id)` → `/staff/[staffId]`
- `school.staff.departments` → `/staff/departments`
- `school.staff.assignments` → `/staff/assignments` (teacher × section × subject for the active year)
- `school.students.list` → `/students`, `school.students.detail(id)` → `/students/[studentId]` The catch-all stops swallowing these once the pages exist. (Fold into whatever shape the PRP-11/25 route-map collapse settles on; do not hardcode paths in pages/menu.)

### 3.2 Staff/teacher state & services (`src/store/staff/`)

House split (`{store,services,type}.ts` + optional `staff.queries.ts`), mirroring `store/developer/` and PRP-22's React-Query refactor:

- **`staff.type.ts`:** `StaffMember` (`{ userSchoolId; userId; name; email; phone?; status; primaryRole; secondaryRoles; departmentId?; designation? }`), `TeacherProfile`/`StaffProfile` detail shapes, `Department` (`{ id; name }`), `TeacherAssignment` (`{ id; teacherUserId; sectionId; subjectId; academicYearId }`). Payloads: `InviteStaffPayload` (name, email, phone?, role, department?), `UpdateStaffProfilePayload`, `CreateDepartmentPayload`, `CreateAssignmentPayload`. Reuse PRP-10's role/`UserSchool` types rather than redefining `SchoolRole`.
- **`staff.services.ts`** (through `apiClient` + `helper.*`): `fetchStaff(schoolId, filters?)`, `fetchStaffMember(id)`, `inviteStaff(payload)` (server sends the PASSWORD_RESET invite — FE just confirms ack, exactly as PRP-26), `updateStaffProfile(id, payload)`, `fetchDepartments()`/`createDepartment`/`updateDepartment`, `fetchAssignments(yearId)`/`createAssignment`/`removeAssignment`.
- **TanStack Query** keys `['staff','list', schoolId, filters]`, `['staff','member', id]`, `['staff','departments', schoolId]`, `['staff','assignments', yearId]`; mutations invalidate on success (PRP-09 boundary).

### 3.3 Student SIS state & services (`src/store/student/`)

House split (`{store,services,type}.ts` + optional `student.queries.ts`):

- **`student.type.ts`:** `StudentListItem` (`{ studentId; admissionNo; name; gradeId; sectionId; rollNo?; status; gender?; guardianSummary? }`), `StudentDetail` (profile fields, `documents: StudentDocument[]`, `enrollmentHistory`, `guardians: Guardian[]`, `siblingGroupId?`, `subjects?` for electives), `Guardian` (`{ parentUserId; name; relation; isPrimary; phone?; email? }`), `StudentDocument` (`{ id; type; fileUrl; uploadedAt }`). Payloads: `UpdateStudentProfilePayload`, `LinkGuardianPayload` (existing parent by id/email **or** new-parent fields + relation + `isPrimary`), `UnlinkGuardianPayload`, `LinkSiblingPayload` (group two/more students), `UploadDocumentPayload`. Reuse the existing `Student`/`ParentStudent`-derived shapes from PRP-31; **admission no. is the student's identity** (D17).
- **`student.services.ts`** (through `apiClient` + `helper.*`): `fetchStudents(schoolId, { yearId, gradeId, sectionId, status, q })`, `fetchStudent(id)`, `updateStudentProfile(id, payload)`, `linkGuardian(studentId, payload)`, `unlinkGuardian(studentId, parentUserId)`, `setPrimaryGuardian(studentId, parentUserId)`, `linkSiblings(payload)`, `unlinkSibling(studentId)`, `uploadStudentDocument(studentId, payload)`. _(Creating a brand-new student is owned by PRP-37 admissions/import; this PRP edits/links existing students and may offer a thin "add student" only if PRP-31 exposes a direct create — otherwise defer creation to PRP-37.)_
- **TanStack Query** keys `['student','list', schoolId, filters]`, `['student','detail', id]`, `['student','guardians', id]`; mutations invalidate `['student','detail', id]` (and the list where membership changes).
- ⚠︎ **Assumption (master §10 O-P2):** the SIS field set, document checklist, and ID-card fields are not finalized. Model the detail/profile generously from PRP-31 and keep the field list in `student.type.ts` so additions are one-file; render documents as a generic typed list until the checklist is fixed.

### 3.4 Staff UI modules (`src/modules/staff/`)

Pages under `app/(school)/staff/**` stay thin and render the module. Reuse `MainWrapper`, `DataGrid` (`GridColumn`/`GRID_COLUMN_TYPE`, barrel `@/components`), `Button`/`Modal`/`InputBox`/`SelectInput`/`Checkbox`/`Loader` from `src/components/ui`, `appToast`, `cn()`.

- **`StaffList.tsx`:** `DataGrid` of staff/teachers (name, email, role, department, status) with filters (role, department, status) and an **Invite** action (`<Can permission="staff.add_new">`) opening a `Modal` (name/email/phone/role/department) that calls `inviteStaff` and toasts the ack. A row link to detail (a `CUSTOM` cell, as PRP-22's `SchoolList` actions column).
- **`StaffDetail.tsx`:** header card (name/role/department/status) + an editable profile section (`updateStaffProfile`) + the staff member's **teacher assignments** (read from `fetchAssignments`).
- **`Departments.tsx`:** `DataGrid` + create/edit `Modal` for `Department`.
- **`TeacherAssignments.tsx`:** assign a teacher to **section × subject** for the active year — pickers sourced from PRP-35 (`fetchSections`, `fetchClassSubjects`) and the staff list; calls `createAssignment`/`removeAssignment`. Filtered by the shared `academicYearId` (PRP-35 store).

### 3.5 Student SIS UI modules (`src/modules/student/`)

- **`StudentList.tsx`:** `DataGrid` of students (admission no., name, grade/section, roll, status) with filters bound to PRP-35 (`yearId`/`gradeId`/`sectionId`) + a search box; a row link to detail. Surfaces the active-year/section context.
- **`StudentDetail.tsx`:** a tabbed/section detail — **Profile** (editable via `updateStudentProfile`), **Guardians** (the linkage UI, §3.6), **Siblings**, **Documents** (list + upload via `uploadStudentDocument`), and an **Academic trail** (enrollment history — read-only here; year-end promotion is PRP-37). Header shows admission no. as the identity (D17).
- **`GuardiansPanel.tsx`** (used inside `StudentDetail`): lists linked guardians with relation + a **Primary** badge. Actions: **Link guardian** (`Modal` — search/select an existing parent by email/id, **or** enter new-parent fields; choose relation + primary flag) → `linkGuardian`; **Make primary** → `setPrimaryGuardian`; **Unlink** (confirm `Modal`) → `unlinkGuardian`. Supports many-to-many: a parent may already be linked to siblings/other-branch children (D17) — surface that read-only.
- **`SiblingsPanel.tsx`:** show the sibling group; **Link sibling** (`Modal` to find another student and group them) → `linkSiblings`; **Unlink** → `unlinkSibling`.

### 3.6 Guardian/sibling linkage semantics (D17)

- **Parent = account linked many-to-many to students.** Linking reuses parents by identity (email/existing `parentUserId`) so one parent account spans siblings and even children across branches. A **new** parent provided in the link modal triggers the backend invite (PRP-31/PRP-26 flow) — the FE confirms the ack only.
- **A student can have up to 2 guardians**, one flagged **primary** (the default actor for fees/results/comms — D17). The FE enforces the "one primary" UX (selecting a new primary clears the old); the server (PRP-31) is authoritative.
- **Siblings** are a grouping over students; linking is symmetric. ⚠︎ **Assumption:** sibling-group semantics (single group id vs. pairwise) follow PRP-31 — model `siblingGroupId` and adapt if PRP-31 differs.

### 3.7 Guarding & menu

- Staff screens gate on the staff permissions (`staff.view`/`staff.add_new`/`staff.update`/`staff.manage` — present in `src/constants/permissions.ts`); student screens on `student.*`. Use the PRP-11 route guard / `<Can>`; invite/edit actions gate on the `add_new`/`update` variants.
- Add **Staff** and **Students** sections to the Admin (and, where appropriate, Staff/Teacher) menu via `project.menu.ts` using `APP_ROUTES` only, permission-tagged (PRP-11) and grouped (PRP-25 sectioned nav). Teacher landing (PRP-25) may surface a read-only "My students"/"My assignments" via the same services filtered to the teacher — but full management stays Admin/Staff-gated.

## 4. Implementation steps

1. **Routes:** add the `school.staff.*` and `school.students.*` keys to `src/constants/routes.ts`.
2. **Staff store:** add `src/store/staff/{type,services,store}.ts` (+ optional `staff.queries.ts`) per §3.2, through `apiClient` + `helper.*`; TanStack Query keys + invalidations.
3. **Student store:** add `src/store/student/{type,services,store}.ts` (+ optional `student.queries.ts`) per §3.3.
4. **Staff pages (thin):** add `app/(school)/staff/page.tsx`, `staff/[staffId]/page.tsx`, `staff/departments/page.tsx`, `staff/assignments/page.tsx`, each rendering its module.
5. **Staff modules:** add `src/modules/staff/{StaffList,StaffDetail,Departments,TeacherAssignments}.tsx` (+ per-screen `utils.ts` for columns/dataset, mirroring `manage-school/utils.ts`); build invite/edit/assignment `Modal`s. Reuse PRP-26's invite-acknowledgement pattern.
6. **Student pages (thin):** add `app/(school)/students/page.tsx` and `students/[studentId]/page.tsx`.
7. **Student modules:** add `src/modules/student/{StudentList,StudentDetail,GuardiansPanel,SiblingsPanel}.tsx` (+ `utils.ts`); wire filters to PRP-35's `academicYearId`/grades/sections; build the guardian-link and sibling-link `Modal`s with the one-primary UX.
8. **Menu + guards:** add Staff/Students sections to `project.menu.ts` (via `APP_ROUTES`, permission-tagged per PRP-11) and apply PRP-11 guards to the pages.

## 5. Files added / changed

- **Add (staff):** `src/store/staff/staff.type.ts`, `staff.services.ts`, `staff.store.ts` (+ optional `staff.queries.ts`); `src/modules/staff/StaffList.tsx`, `StaffDetail.tsx`, `Departments.tsx`, `TeacherAssignments.tsx` (+ `utils.ts`); `src/app/(school)/staff/page.tsx`, `staff/[staffId]/page.tsx`, `staff/departments/page.tsx`, `staff/assignments/page.tsx`
- **Add (student):** `src/store/student/student.type.ts`, `student.services.ts`, `student.store.ts` (+ optional `student.queries.ts`); `src/modules/student/StudentList.tsx`, `StudentDetail.tsx`, `GuardiansPanel.tsx`, `SiblingsPanel.tsx` (+ `utils.ts`); `src/app/(school)/students/page.tsx`, `students/[studentId]/page.tsx`
- **Edit:** `src/constants/routes.ts` (new `school.staff.*`/`school.students.*` keys), `src/constants/project.menu.ts` (Staff + Students sections). _(Any new permission strings beyond the existing `staff._`/`student._` come from the PRP-10 shared module, mirroring backend PRP-17/30/31 — not added ad-hoc here.)_

## 6. Acceptance criteria

- [ ] An Admin sees a **staff/teacher list** (filterable by role/department/status), can **invite** a new staff/teacher (reusing the invite flow — they receive a set-password email and appear in the list), and can open a staff detail to edit the profile.
- [ ] An Admin can manage **departments** and create **teacher assignments** (teacher × section × subject) for the active year, with section/subject pickers sourced from PRP-35.
- [ ] An Admin/Staff sees a **student list** filterable by year/grade/section + search, and can open a **student SIS detail** showing profile, documents, and academic trail (admission no. as identity).
- [ ] An Admin can **link a guardian** to a student (existing parent by email/id or a new invited parent), set one **primary** guardian (max two guardians), and **unlink**; a parent linked to multiple children (siblings/cross-branch) is reflected (D17).
- [ ] An Admin can **group siblings** and unlink them.
- [ ] No page calls `axios` directly (all via `store/staff` & `store/student` services + TanStack Query); routes only from `APP_ROUTES`; classes via `cn()`; responses via `helper.*`; lists use `DataGrid`.

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Manual (against backend PRP-30/31, with PRP-35 structure seeded): invite a teacher → confirm the invite + list entry; create a department and a teacher×section×subject assignment; open a student, edit the profile, link an existing parent as primary guardian + a second guardian, upload a document, and group two students as siblings; confirm a non-permitted role cannot reach `/staff`/`/students` (PRP-11 guard; server authoritative via PRP-12/30/31).

## 8. Risks & rollback

- **API shape coupling:** depends on PRP-30/31 envelopes — land after them or stub services behind a flag. Keep shapes in `staff.type.ts`/`student.type.ts` so contract changes are one-file (the `developer.type.ts` discipline).
- **Cross-feature dependency on PRP-35:** assignment + student filters consume PRP-35's `academicYearId`/sections/subjects — if PRP-35 hasn't landed, those pickers have no data; sequence PRP-35 first (it's a declared dependency).
- **Guardian linkage edge cases:** many-to-many + "max two guardians" + "one primary" must reconcile after every mutation (invalidate `['student','detail', id]`); the FE primary-toggle is UX only — PRP-31 is authoritative. New-parent links reuse the invite flow (no new invite UI), as in PRP-26.
- **Student creation boundary:** to avoid duplicating PRP-37 (admissions/import own creation), this PRP edits/links existing students; expose a direct "add student" only if PRP-31 sanctions it, else defer.
- **PII/documents:** student documents/photos are sensitive — rely on PRP-31's signed-URL/storage handling (master §5.6); the FE never holds credentials. ⚠︎ Document checklist + ID-card fields open (O-P2) — keep the document list generic.
- **Rollback:** fully additive (new stores/modules/pages + route keys + menu sections); revert and the catch-all reclaims `/staff`/`/students`. Do not revert shared `routes.ts`/RBAC changes PRP-37 also depends on.
