# PRP-37 — Admissions, year-end promotion & bulk-import UI

> **Status:** Proposed · **Phase:** 2 · **Severity:** 🔴 High · **Size:** XL **Addresses:** P2-FE-3 (implementation-plan PRP-37; master-prp §3 D17/D18/D23, §6 P2) · **Depends on:** backend PRP-32 (enrollment + bulk promotion + TC/alumni), backend PRP-33 (admissions inquiry→application→enroll ⚠︎), backend PRP-34 (CSV/Excel bulk import ⚠︎); FE PRP-10 (abilities/`activeSchoolId`), PRP-11 (permission menu + guards), PRP-25 (Admin landing), PRP-35 (academic years/grades/sections), PRP-36 (student SIS — admissions convert into students; promotion moves enrollments) · **Pairs with:** PRP-36 (shares the student/enrollment domain)

## 1. Problem / current state

Three lifecycle flows have **no UI** today: there is no admissions pipeline, no year-end promotion screen, and no bulk-import surface. `src/app/(school)/` has only dashboard/profile/school placeholders, and no `src/store/admissions/`, `src/store/enrollment/`, or import feature folders exist. New students can't be created from the web at all (PRP-36 deliberately edits/links existing students only and defers creation here).

Backend PRP-32 adds `Enrollment` (per-year section placement), **year-end bulk promotion** (promote / detain / graduate→alumni), and transfer-in/out with **TC** + alumni status (D23). PRP-33 adds the `AdmissionApplication` lifecycle (inquiry → application → enroll) that **converts to a `Student` + `Enrollment`** (⚠︎). PRP-34 adds a validated CSV/Excel **bulk-import** pipeline for students/staff with an error report (⚠︎). This PRP builds the three web surfaces on top of them, completing the P2 "people" lifecycle.

## 2. Goal & non-goals

- **Goal:** three Admin-facing areas under the `(school)` group:
  1. **Admissions** — an application pipeline (board/list by stage: inquiry → application → review → offer → **enrolled/rejected**), an application detail/form, and a **convert-to-student** action (creates `Student` + `Enrollment` per PRP-33, landing the new student in PRP-36's SIS).
  2. **Year-end promotion** — a per-year workflow to bulk **promote / detain / graduate** a section/grade cohort into the next year's sections, plus mid-year **transfer-out + TC** and **alumni** handling (D23).
  3. **Bulk import** — a guided CSV/Excel **import** for students (and staff) with template download, client pre-checks, server validation, and a **row-level error report** (PRP-34). All wiring through new `src/store/admissions/`, `src/store/enrollment/`, `src/store/import/` services + TanStack Query; lists via `DataGrid`; routes from `APP_ROUTES`; `cn()` + `helper.*`.
- **Non-goals:** backend endpoints/tables (PRP-32/33/34); the academic structure (PRP-35) and the student SIS detail / guardian linkage (PRP-36) — this PRP **consumes** both; fees/exam roll-over (P4/P5); parent-facing admission status (P3+). TC **PDF** rendering is a server concern (master §5.6) — the FE triggers/downloads it.

## 3. Target design

### 3.1 Routes (`src/constants/routes.ts`)

Add lifecycle keys to `APP_ROUTES.school` (strings only here):

- `school.admissions.list` → `/admissions`, `school.admissions.detail(id)` → `/admissions/[applicationId]`
- `school.promotion` → `/promotion` (year-end workflow)
- `school.imports` → `/imports` (bulk import; could namespace as `/imports/students` / `/imports/staff`) Fold into the PRP-11/25 route-map collapse; never hardcode paths in pages/menu.

### 3.2 Admissions state & services (`src/store/admissions/`)

House split (`{store,services,type}.ts` + optional `admissions.queries.ts`), mirroring PRP-22's React-Query approach:

- **`admissions.type.ts`:** `AdmissionApplication` (`{ id; applicantName; appliedForGradeId; academicYearId; stage; contact; guardianInfo; documents?; createdAt }`), `AdmissionStage` union (e.g. `INQUIRY | APPLIED | UNDER_REVIEW | OFFERED | ENROLLED | REJECTED | WITHDRAWN`). Payloads: `CreateApplicationPayload`, `UpdateApplicationPayload`, `TransitionStagePayload` (`{ stage; note? }`), `ConvertToStudentPayload` (`{ sectionId; rollNo?; admissionNo? }`). ⚠︎ **Assumption (master §10 O-P2):** _admission form fields & workflow depth_ are not finalized — model the field set + stage list from PRP-33 and keep them in `admissions.type.ts` so changes are one-file; treat the stage list as configurable.
- **`admissions.services.ts`** (through `apiClient` + `helper.*`): `fetchApplications(schoolId, { yearId, stage, gradeId, q })`, `fetchApplication(id)`, `createApplication(payload)`, `updateApplication(id, payload)`, `transitionStage(id, payload)`, `convertToStudent(id, payload)` (PRP-33 — creates `Student` + `Enrollment`).
- **TanStack Query** keys `['admissions','list', schoolId, filters]`, `['admissions','detail', id]`; `transitionStage`/`convertToStudent` invalidate the list/detail (and, on convert, the student list `['student','list', …]` from PRP-36).

### 3.3 Enrollment / promotion state & services (`src/store/enrollment/`)

- **`enrollment.type.ts`:** `Enrollment` (`{ id; studentId; academicYearId; sectionId; rollNo?; status }`), `PromotionDecision` (`{ studentId; action: 'PROMOTE'|'DETAIN'|'GRADUATE'; toSectionId? }`), `PromotionRunPayload` (`{ fromYearId; toYearId; decisions: PromotionDecision[] }`), `TransferOutPayload` (`{ studentId; reason; tcDate }`), `AlumniStatus`. Align to PRP-32 shapes.
- **`enrollment.services.ts`** (through `apiClient` + `helper.*`): `fetchEnrollments(yearId, { gradeId, sectionId })`, `runPromotion(payload)` (bulk promote/detain/graduate), `transferOut(payload)` (sets status + triggers TC), `downloadTC(studentId)` (server-rendered PDF — FE fetches/streams), `fetchAlumni(schoolId)`.
- **TanStack Query** keys `['enrollment','list', yearId, filters]`, `['enrollment','alumni', schoolId]`; mutations invalidate the relevant cohort + student list.

### 3.4 Bulk-import state & services (`src/store/import/`)

- **`import.type.ts`:** `ImportEntity` (`'students' | 'staff'`), `ImportJob` (`{ id; entity; status: 'UPLOADED'|'VALIDATING'|'VALIDATED'|'COMMITTED'|'FAILED'; totalRows; validRows; errorRows }`), `ImportRowError` (`{ row; column; message }`), `ImportPreview` (parsed sample + per-row validity). Payloads: `UploadImportPayload` (file + entity + `academicYearId`/`gradeId` context), `CommitImportPayload` (`{ jobId }`). ⚠︎ **Assumption (master §10 O-P2):** the _CSV import column spec_ is not finalized — drive the template + column validation from PRP-34's published spec; keep the column list/labels in `import.type.ts` so a spec change is one-file. Two-step **validate → commit** is assumed (upload returns an error report; commit only succeeds rows that pass) — confirm against PRP-34.
- **`import.services.ts`** (through `apiClient` + `helper.*`): `downloadTemplate(entity)`, `uploadImport(payload)` (multipart; returns the validation report), `fetchImportJob(jobId)`, `commitImport(payload)`. Multipart upload still goes through `apiClient` (no direct axios in components).
- **TanStack Query**: `uploadImport`/`commitImport` are `useMutation`s; `['import','job', jobId]` polls status if the backend processes async.

### 3.5 UI modules

Pages under `app/(school)/**` stay thin and render the module. Reuse `MainWrapper`, `DataGrid` (`GridColumn`/`GRID_COLUMN_TYPE`, barrel `@/components`), `Button`/`Modal`/`InputBox`/`SelectInput`/`DateInput`/`Checkbox`/`Loader` from `src/components/ui`, `appToast`, `cn()`. Pickers for year/grade/section come from PRP-35; the student list they feed is PRP-36's.

- **`src/modules/admissions/AdmissionsPipeline.tsx`:** a stage view of applications — either a `DataGrid` with a **stage** filter/column, or a light kanban-style grouping by `AdmissionStage`; an **Add application** action and per-row link to detail. Filters bind to the active `academicYearId` + grade.
- **`src/modules/admissions/ApplicationDetail.tsx`:** the application form (create/edit via `createApplication`/`updateApplication`), a **stage action bar** (advance/reject/withdraw → `transitionStage` with an optional note), and a **Convert to student** action (`<Can>`-gated) opening a `Modal` to pick the target **section** (+ optional roll/admission no.) → `convertToStudent`, which lands the new student in PRP-36's SIS. Toasts the result.
- **`src/modules/promotion/YearEndPromotion.tsx`:** select **from-year → to-year** (PRP-35), pick a grade/section cohort, and review a `DataGrid` of students with a per-row **decision** (Promote / Detain / Graduate) and target section; a **Run promotion** action batches `PromotionRunPayload` → `runPromotion`. A confirm `Modal` summarizes counts (X promoted, Y detained, Z graduated→alumni) before committing (D23). Graduation moves students to **alumni**.
- **`src/modules/promotion/TransferOut.tsx`** (or a panel reachable from PRP-36's `StudentDetail`): mid-year **transfer-out** (`transferOut`) + **Download TC** (`downloadTC`, server PDF). Alumni are viewable via `fetchAlumni`.
- **`src/modules/import/BulkImport.tsx`:** a guided importer — choose entity (students/staff), **download template** (`downloadTemplate`), upload a file (`uploadImport`), then show a **validation report** (`ImportRowError[]` in a `DataGrid`: row / column / message) and valid/error counts; a **Commit** action (`commitImport`) for the valid rows once the operator reviews errors. Disable Commit while `VALIDATING`/if `validRows === 0`.

### 3.6 Cross-screen flow

- **Admissions → SIS:** `convertToStudent` is the single sanctioned web path to create a student (PRP-36 defers creation here). After convert, invalidate PRP-36's `['student','list', …]` so the new student appears.
- **Promotion → next year:** `runPromotion` writes next-year `Enrollment`s (D18 year-scoping); the year switcher (PRP-35) then shows the cohort under the new year.
- **Import → SIS/staff:** a committed student import creates students/enrollments visible in PRP-36; a staff import creates staff visible in PRP-36's staff list.

### 3.7 Guarding & menu

- Admissions gates on an admissions permission (⚠︎ string owned by backend PRP-17/33; reconcile in the PRP-10 shared module — do not hand-type); promotion/transfer gate on `student.manage` (existing `STUDENT_MANAGE`); import gates on `student.add_new`/`staff.add_new` (existing). Use PRP-11 route guards / `<Can>`; the destructive **Run promotion** and **Convert** actions gate on the manage/add variants.
- Add **Admissions**, **Promotion**, and **Imports** entries to the Admin menu via `project.menu.ts` using `APP_ROUTES` only, permission-tagged (PRP-11) and grouped (PRP-25 sectioned nav).

## 4. Implementation steps

1. **Routes:** add `school.admissions.*`, `school.promotion`, `school.imports` to `src/constants/routes.ts`.
2. **Admissions store:** add `src/store/admissions/{type,services,store}.ts` (+ optional `admissions.queries.ts`) per §3.2 through `apiClient` + `helper.*`; query keys + invalidations (including PRP-36's student list on convert).
3. **Enrollment store:** add `src/store/enrollment/{type,services,store}.ts` (+ optional `enrollment.queries.ts`) per §3.3.
4. **Import store:** add `src/store/import/{type,services,store}.ts` per §3.4 (multipart through `apiClient`; status polling if async).
5. **Pages (thin):** add `app/(school)/admissions/page.tsx`, `admissions/[applicationId]/page.tsx`, `promotion/page.tsx`, `imports/page.tsx`.
6. **Admissions modules:** `src/modules/admissions/{AdmissionsPipeline,ApplicationDetail}.tsx` (+ `utils.ts`); build the application form, stage action bar, and convert-to-student `Modal` (section picker from PRP-35).
7. **Promotion modules:** `src/modules/promotion/{YearEndPromotion,TransferOut}.tsx` (+ `utils.ts`); build the from/to-year + cohort decision grid, the run-promotion confirm `Modal` with counts, and the transfer-out + TC-download UI.
8. **Import module:** `src/modules/import/BulkImport.tsx` (+ `utils.ts`); template download, upload, validation-report `DataGrid`, and gated Commit.
9. **Menu + guards:** add Admissions/Promotion/Imports to `project.menu.ts` (via `APP_ROUTES`, permission-tagged per PRP-11) and apply PRP-11 guards to the pages.

## 5. Files added / changed

- **Add (admissions):** `src/store/admissions/admissions.type.ts`, `admissions.services.ts`, `admissions.store.ts` (+ optional `admissions.queries.ts`); `src/modules/admissions/AdmissionsPipeline.tsx`, `ApplicationDetail.tsx` (+ `utils.ts`); `src/app/(school)/admissions/page.tsx`, `admissions/[applicationId]/page.tsx`
- **Add (promotion/enrollment):** `src/store/enrollment/enrollment.type.ts`, `enrollment.services.ts`, `enrollment.store.ts` (+ optional `enrollment.queries.ts`); `src/modules/promotion/YearEndPromotion.tsx`, `TransferOut.tsx` (+ `utils.ts`); `src/app/(school)/promotion/page.tsx`
- **Add (import):** `src/store/import/import.type.ts`, `import.services.ts`, `import.store.ts`; `src/modules/import/BulkImport.tsx` (+ `utils.ts`); `src/app/(school)/imports/page.tsx`
- **Edit:** `src/constants/routes.ts` (new lifecycle keys), `src/constants/project.menu.ts` (Admissions/Promotion/Imports). _(Any new permission strings — e.g. an admissions key — come from the PRP-10 shared module mirroring backend PRP-17/33, not added ad-hoc here.)_

## 6. Acceptance criteria

- [ ] An Admin sees an **admissions pipeline** grouped/filterable by stage, can create/edit an application, advance/reject it through stages, and **convert an accepted application to a student** (creating `Student` + `Enrollment` per PRP-33) — the new student then appears in PRP-36's SIS list.
- [ ] An Admin can run a **year-end promotion**: pick from-year → to-year and a cohort, set per-student promote/detain/graduate decisions, review a summary, and commit — promoted students land in next-year sections, graduates become **alumni** (D23).
- [ ] An Admin can **transfer a student out** and **download a TC** (server-rendered PDF), and view alumni.
- [ ] An Admin can **bulk-import** students/staff: download a template, upload a file, see a **row-level validation report** (row/column/message) with valid/error counts, and **commit** the valid rows; committed records appear in the relevant PRP-36 list.
- [ ] No page calls `axios` directly (all via the new stores' services + TanStack Query); routes only from `APP_ROUTES`; classes via `cn()`; responses via `helper.*`; lists/reports use `DataGrid`.

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Manual (against backend PRP-32/33/34, with PRP-35 structure + PRP-36 lists in place): create an application → advance to offered → convert to a student in a chosen section → confirm it appears in the student list; set up two years, run a promotion (mix of promote/detain/graduate) → confirm next-year enrollments + alumni; transfer a student out and download the TC; import a sample CSV with deliberate bad rows → confirm the error report flags them and Commit only writes the valid rows. Confirm a non-permitted role cannot reach `/admissions`/`/promotion`/`/imports`.

## 8. Risks & rollback

- **Triple backend dependency:** consumes PRP-32 **and** PRP-33 **and** PRP-34 — the largest contract surface in P2. Land after all three (or stub each store behind a flag); keep every shape in its `*.type.ts` so contract changes are one-file (the `developer.type.ts` discipline). PRP-33 and PRP-34 are ⚠︎-flagged on O-P2 — expect their field/stage/column specs to firm up late.
- **Convert/promotion are state-changing and hard to undo:** guard with confirm `Modal`s + summary counts; the server (PRP-32/33) is authoritative and should be idempotent — surface failures clearly and re-fetch rather than assume success. Year-scoping (D18) means a wrong target year is a real hazard — make from/to-year explicit in the promotion UI.
- **Import safety:** never commit unvalidated rows — enforce the validate→commit two-step and disable Commit when `validRows === 0`. Large files / async processing need the `['import','job', jobId]` poll; show progress. ⚠︎ Column spec open (O-P2) — template/labels must track PRP-34.
- **Cross-feature coupling with PRP-35/36:** convert and promotion need PRP-35's years/sections and write into PRP-36's student/enrollment domain — invalidate PRP-36's caches on success so lists reconcile; sequence PRP-35/36 first (declared dependencies).
- **TC/PDF:** generation is server-side (master §5.6) — the FE only triggers/streams the download; do not attempt client-side PDF.
- **Rollback:** fully additive (new stores/modules/pages + route keys + menu entries); revert and the catch-all (`app/[...slug]`) reclaims `/admissions`/`/promotion`/`/imports`. Do not revert shared `routes.ts`/RBAC changes shared with PRP-35/36.
