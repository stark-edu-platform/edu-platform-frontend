# PRP-52 — Exam setup & teacher marks-entry UI

> **Status:** Proposed · **Phase:** 5 · **Severity:** 🔴 High · **Size:** L **Depends on:** backend PRP-49 (exam types / exams / schedules / admit-card APIs), backend PRP-50 (grading-scheme CRUD + subject-aware marks-sheet/entry APIs); FE PRP-10 (abilities / `activeSchoolId`), PRP-11 (permission menu + route guards), PRP-35 (academic-setup store — reuses the active-academic-year selection + grades/sections/subjects lookups), PRP-13 (forms + `react-hook-form`/`zod` stack — marks-entry validation), PRP-09 (React-Query boundary) · **Pairs with:** PRP-53 (results & report-card viewing — consumes the exams/marks this PRP creates) · **Relates to:** PRP-36 (staff/student management — supplies the teacher/section lookups)

## 1. Problem / current state

The school side has **no exam or marks-entry surface**. Today `APP_ROUTES.school.admin`/`.teacher` declare an `exams` string (`/exams`) and a `results` string (`/results`) that fall through to `app/[...slug]/page.tsx` ("page not built yet"); `src/app/(school)/` has only `dashboard/`, `profile/`, `school/`. There is no `src/store/exam/` feature folder (`src/store/` holds `auth/`, `developer/`, and — after PRP-35 — `academic/`). The teacher persona is **mobile-first + web** (master §4): web marks entry is the data-heavy desktop flow that complements the app.

Backend PRP-49 introduces `ExamType`/`Exam`/`ExamSchedule` + an admit-card PDF, and PRP-50 introduces a configurable `GradingScheme` + a **subject-aware** `MarksEntry` (a teacher marks only their assigned `Section`×`Subject`, and only the students whose `StudentSubject` roster includes the subject — D19). This PRP builds the Admin-facing **exam setup** and the Teacher-facing **marks-entry grid** on top of those APIs. (Result/report-card _viewing_ — for everyone including parents/students — is PRP-53.)

## 2. Goal & non-goals

- **Goal:** an **Exam setup** area (Admin/Staff) to manage **exam types**, **exams** (per active year + term, lifecycle DRAFT→SCHEDULED→ONGOING→COMPLETED→CANCELLED), and a per-exam **schedule/timetable** editor (grade[+stream]×subject papers with date/time/room/max-marks); a **grading-scheme** editor (scholastic bands + co-scholastic scales) surfaced as a data-driven matrix; a **Teacher marks-entry** grid (pick exam → assigned section×subject → enter marks for the subject-aware roster → save → finalize); and an **admit-card** download (single + bulk per section). All data flows through a new `src/store/exam/{store,services,type}.ts` layer + TanStack Query; all lists use `DataGrid`; create/edit use `Modal`s from `src/components/ui`; all routes from `APP_ROUTES`; PDFs downloaded as blobs.
- **Non-goals:** the backend models/endpoints (PRP-49/50); report-card / result **viewing** and merit lists (PRP-53 — this PRP creates exams + enters marks; PRP-53 reads published results); the RBAC/menu primitives (PRP-10/11); the academic-year/term/class/subject **setup** screens (PRP-35 — this PRP _consumes_ its store for the active year + lookups); mobile marks entry (a future mobile-repo PRP); per-school report-card template design (O-P5 — a backend/template concern).

## 3. Target design

### 3.1 Routes (`src/constants/routes.ts`)

The existing `exams` string fall-through is replaced by a small exam group. New strings live **only** in `src/constants/routes.ts` (pages/menu never hardcode). The per-role `APP_ROUTES.school.admin/teacher/...` maps are slated for collapse in PRP-11/25 — add the new keys in whatever shape that collapse settles on; the routes are:

- `school.exams.list` → `/exams` (exam types + exams list; Admin/Staff)
- `school.exams.detail` → `/exams/[examId]` (schedule/timetable editor + lifecycle actions)
- `school.exams.grading` → `/exams/grading` (grading-scheme editor; Admin)
- `school.exams.marks` → `/exams/[examId]/marks` (teacher marks entry; or a teacher landing `/marks` listing their assignments — see §3.4)

⚠︎ **Assumption (master §10 O-P5):** the grading bands / co-scholastic scales / report-card template are not finalized. The grading-scheme editor is built as a **data-driven matrix** over whatever bands the backend `GradingScheme` returns (no hard-coded CBSE bands in the UI); see §3.5.

### 3.2 State & services (`src/store/exam/`)

New feature folder following the house split (`{store,services,type}.ts`), mirroring `store/developer/` and the React-Query refactor PRP-09/PRP-35 established (a `*.queries.ts` companion is acceptable):

- **`exam.type.ts`:** `ExamType` (`{ examTypeId; name; code?; weightage?; isScholastic }`), `Exam` (`{ examId; name; termId; examTypeId; status; startDate; endDate }`), `ExamSchedule` (`{ examScheduleId; gradeId; streamId?; subjectId; examDate; startTime; durationMins; maxMarks; passMarks; room? }`), `GradingScheme` (`{ gradingSchemeId; name; scaleKind; isDefault; bands: GradeBand[] }`), `GradeBand` (`{ gradeBandId; grade; minPercent?; maxPercent?; gradePoint?; sequence }`), `MarksRow` (`{ studentId; admissionNo; name; marksObtained?; graceMarks?; isAbsent?; isExempted?; derivedGrade?; isLocked }`), and an `ExamStatus`/`GradeScaleKind`/`ResultStatus` union **mirroring the backend PRP-49/50 enums**. Payload types: `CreateExamTypePayload`, `CreateExamPayload`, `ConfigureSchedulesPayload`, `UpsertMarksPayload`, `SetGradeBandsPayload`. Keep field names aligned with PRP-49/50 response shapes so a contract change is one file (the `developer.type.ts` discipline). Response aliases via `SuccessResponse<…>`/`ErrorResponse`.
- **`exam.services.ts`** (through `apiClient` + `helper.successResponse`/`helper.errorResponse`; components never call axios):
  - Exam types: `fetchExamTypes()`, `createExamType`, `updateExamType`
  - Exams: `fetchExams(params)`, `fetchExam(examId)`, `createExam(payload)`, `transitionExam(examId, action)`
  - Schedules: `configureSchedules(examId, payload)`
  - Grading: `fetchGradingSchemes()`, `createGradingScheme`, `setGradeBands(schemeId, payload)`
  - Marks: `fetchMarksSheet(examScheduleId)`, `upsertMarks(examScheduleId, payload)`, `finalizeMarks(examScheduleId)`, `upsertCoScholastic(payload)`
  - Admit cards (blob): `downloadAdmitCard(examId, studentId)`, `downloadSectionAdmitCards(examId, sectionId)` — `apiClient.get(url, { responseType: 'blob' })`, then a shared `downloadBlob(blob, filename)` util (see §3.6). Endpoint paths mirror PRP-49/50 (school-scoped server-side via backend PRP-12); the FE sends `activeSchoolId`/`academicYearId` per PRP-10/PRP-35 as those endpoints require.
- **Server state via TanStack Query** (PRP-09 boundary, as PRP-09/35 established): query keys `['exam','types', schoolId]`, `['exam','list', { schoolId, yearId, termId }]`, `['exam','detail', examId]`, `['exam','grading', schoolId]`, `['exam','marks', examScheduleId]`. Mutations `invalidateQueries` on the relevant key on success (e.g. `transitionExam` invalidates `['exam','detail', examId]` + `['exam','list', …]`; `upsertMarks`/`finalizeMarks` invalidate `['exam','marks', examScheduleId]`). Keep Zustand for cross-cutting UI state only (e.g. the marks-grid dirty/selection state); the record-of-truth cache is React Query. The **active academic year** comes from `store/academic` (PRP-35) — do not re-derive it here.

### 3.3 Exam-setup UI modules (`src/modules/exam-setup/`)

Each screen is a module; pages under `app/(school)/exams/**` stay thin and render the module (mirroring how `schools/page.tsx` renders `SchoolList`). Reuse `MainWrapper`, `DataGrid` + `GridColumn`/`GRID_COLUMN_TYPE` (barrel `@/components`), `Button`/`Modal`/`InputBox`/`SelectInput`/`DateInput`/`Checkbox`/`Loader` from `src/components/ui`, plus `appToast`, `cn()`, and PRP-13's `useZodForm` for the create/edit modals.

- **`ExamsList.tsx`:** a `DataGrid` of exams for the active year (name, exam type, term, window dates via `GRID_COLUMN_TYPE.DATE`, a status badge via a `CUSTOM` cell). A term filter (`SelectInput` sourced from `store/academic` terms). "Add exam type" + "Add exam" `Modal`s (exam: name, exam-type `SelectInput`, term `SelectInput`, start/end `DateInput`). A row action → exam detail. An "Exam types" sub-panel/tab manages `ExamType`s (name, code, weightage, scholastic flag) — these feed PRP-51's term weightage (⚠︎ O-P5; surface a note that weightage affects report cards).
- **`ExamDetail.tsx`:** header card (exam name, type, term, status badge) + a **lifecycle action bar** (Publish schedule / Start / Complete / Cancel — calling `transitionExam`, gated by current status, confirmed via `Modal`) + the **schedule editor**. The schedule editor is a `DataGrid` (or editable rows) of papers — grade `SelectInput`, optional stream `SelectInput` (enabled only for senior grades, from `store/academic`), subject `SelectInput` (filtered to the grade's `ClassSubject`s), `examDate` `DateInput`, `startTime`, `durationMins`, `maxMarks`, `passMarks`, `room` — that batches into `configureSchedules` (full-replace). Surface backend **clash-detection** errors (a same-grade time overlap → `409`) inline via `appToast`/field error.
- **`AdmitCards.tsx`** (or a panel within `ExamDetail`): pick a section → download the section's admit cards (bulk PDF), or download a single student's card. Uses the blob-download util (§3.6).

### 3.4 Teacher marks-entry UI (`src/modules/marks-entry/`)

- **`MarksEntryLanding.tsx`** (Teacher): lists the teacher's **assignable** marks sheets — for a selected exam (and its `SCHEDULED`/`ONGOING` schedules), the papers the teacher may mark (the backend `getMarksSheet` is authorized by `TeacherAssignment`, PRP-30, so the UI lists only what returns successfully, or a dedicated "my assignments" feed from PRP-36/30). Each entry links to the grid.
- **`MarksGrid.tsx`:** the core flow. Given an `examScheduleId`, `fetchMarksSheet` returns the **subject-aware roster** (only students whose `StudentSubject` includes this subject — D19) with any existing marks. Render a **purpose-built editable table** (admission no., name, a `marksObtained` numeric input bounded by the paper's `maxMarks`, an "Absent" `Checkbox`, optional grace-marks + remarks, a live derived-grade preview echoed from the backend or computed against the fetched scheme). ⚠︎ **Do not assume `DataGrid` editable cells exist:** `DataGrid`'s `editable`/`onUpdate` props are type-stubs only (declared in `config.ts`/`type.ts` with **no inline-edit render implementation** — `body.tsx`/`Row` render read-only cells), so this grid is hand-built (the UI `InputBox`/`Checkbox` primitives in plain table rows + the dirty-row store), not a `DataGrid` configured editable. A **"Save"** action batches dirty rows into `upsertMarks`; client-side validation (PRP-13 `zod`: `0 ≤ marks ≤ maxMarks`, absent ⇒ no marks) mirrors the server. A **"Finalize"** action (with a confirm `Modal`, since it locks the sheet) calls `finalizeMarks`; once locked the grid renders read-only with a "Reopen requires admin" note (reopen is an Admin action, PRP-50). Show unsaved-changes guarding (dirty state in the exam store).
- **`CoScholasticGrid.tsx`** (class teacher): per-term, per-area descriptive grades (`SelectInput` of the co-scholastic scheme's band labels) batched into `upsertCoScholastic`.

⚠︎ The marks grid is the most data-dense screen — it must be a **purpose-built editable table** (`DataGrid`'s `editable`/`onUpdate` are unimplemented type-stubs — see `MarksGrid.tsx` above; don't configure `DataGrid` for inline edit); the **eligible roster must come from the backend** (subject-aware), never a client-side "all students in section" filter.

### 3.5 Grading-scheme editor (`src/modules/exam-setup/GradingSchemes.tsx`, Admin)

A **data-driven** editor over the backend `GradingScheme`/`GradeBand` (⚠︎ O-P5 — no hard-coded bands): list schemes (scholastic + co-scholastic) in a `DataGrid`; edit a scheme's bands in a matrix/table (`grade` label, `minPercent`, `maxPercent`, `gradePoint`, `sequence`) that batches into `setGradeBands` (full-replace). Follow the matrix pattern PRP-22 _will_ introduce (no shared component exists yet — build the band table locally here). Show a notice that the scheme is **school-configurable** and that defaults are CBSE-shaped assumptions pending O-P5; co-scholastic schemes edit labels only (no percentages). Validate (PRP-13) contiguous, non-overlapping scholastic bands client-side before submit (server re-validates).

### 3.6 Shared helpers, guarding & menu

- **Blob download util:** add `src/utils/download.ts` `downloadBlob(blob, filename)` (creates an object URL, clicks an anchor, revokes) — used by admit cards here and report-card PDFs in PRP-53. Greenfield (no PDF/blob util exists today).
- **Guarding:** Exam-setup + grading pages are Admin/Staff; the marks grid is Teacher (+ Admin/Staff). Gate with the PRP-11 route guard / `<Can>` keyed on the backend `exam.*` / `grading.*` / `marks.*` permission strings (PRP-49/50). ⚠︎ The exact strings are owned by backend PRP-17/49/50; reconcile them into the FE shared permission module (PRP-10) — do **not** hand-type a new string outside that module.
- **Menu:** add an "Exams" section to the Admin/Teacher menu via `project.menu.ts` using `APP_ROUTES` only, permission-tagged per PRP-11. For a teacher, the section points at the marks-entry landing; for an admin, at exam setup. Group entries (Exams, Grading, Marks) under one section heading (PRP-25's sectioned-nav extension).

## 4. Implementation steps

1. **Routes:** add the `school.exams.*` keys to `src/constants/routes.ts` (no hardcoded paths elsewhere).
2. **Types:** add `src/store/exam/exam.type.ts` with the entities + payloads from §3.2, aligned to backend PRP-49/50 shapes (enums mirrored).
3. **Services:** add `src/store/exam/exam.services.ts` (exam types/exams/schedules/grading/marks/admit-cards) through `apiClient` + `helper.*`; blob endpoints use `responseType: 'blob'`.
4. **Query layer + UI state:** add `src/store/exam/exam.store.ts` (marks-grid dirty/selection state only) and TanStack Query hooks (inline or `exam.queries.ts`) with the §3.2 keys; mutations invalidate on success. Read the active year from `store/academic` (PRP-35).
5. **Pages (thin):** add `app/(school)/exams/page.tsx`, `app/(school)/exams/[examId]/page.tsx`, `app/(school)/exams/[examId]/marks/page.tsx`, `app/(school)/exams/grading/page.tsx` — each renders its module.
6. **Exam-setup modules:** add `src/modules/exam-setup/{ExamsList,ExamDetail,AdmitCards,GradingSchemes}.tsx` (+ per-screen `utils.ts` for grid columns/dataset mappers, mirroring `manage-school/utils.ts`); build create/edit `Modal`s with UI primitives + PRP-13 `useZodForm`.
7. **Marks-entry modules:** add `src/modules/marks-entry/{MarksEntryLanding,MarksGrid,CoScholasticGrid}.tsx` with the subject-aware roster (server-fed), bounded numeric inputs, save/finalize flows, and dirty-state guarding.
8. **Shared util + menu + guard:** add `src/utils/download.ts`; add the "Exams" section to `project.menu.ts` (via `APP_ROUTES`, permission-tagged per PRP-11) and apply the PRP-11 guards to the new pages.

## 5. Files added / changed

- **Add:** `src/store/exam/exam.type.ts`, `src/store/exam/exam.services.ts`, `src/store/exam/exam.store.ts` (+ optional `exam.queries.ts`); `src/modules/exam-setup/ExamsList.tsx`, `ExamDetail.tsx`, `AdmitCards.tsx`, `GradingSchemes.tsx` (+ per-screen `utils.ts`); `src/modules/marks-entry/MarksEntryLanding.tsx`, `MarksGrid.tsx`, `CoScholasticGrid.tsx`; `src/app/(school)/exams/page.tsx`, `.../exams/[examId]/page.tsx`, `.../exams/[examId]/marks/page.tsx`, `.../exams/grading/page.tsx`; `src/utils/download.ts`
- **Edit:** `src/constants/routes.ts` (new `school.exams.*` keys), `src/constants/project.menu.ts` (Exams section). _(The exam/marks permission strings are reconciled in the PRP-10 shared permission module — treat that edit as belonging to PRP-10/11, not this PRP, to keep the contract single-sourced.)_

## 6. Acceptance criteria

- [ ] An Admin can create exam types and an exam (in the active year + a chosen term), see its lifecycle status, and drive transitions (Publish schedule / Start / Complete / Cancel) with the status reflected without a manual refresh.
- [ ] The schedule editor adds papers (grade[+stream]×subject, date/time/max-marks), full-replaces via `configureSchedules`, and surfaces backend clash-detection (`409`) inline.
- [ ] The grading-scheme editor renders a **data-driven** band matrix (no hard-coded CBSE bands), persists via `setGradeBands`, validates contiguity client-side, and shows the "school-configurable / O-P5 assumption" notice.
- [ ] A Teacher opens a marks sheet for **only** their assigned `Section`×`Subject` (server-authorized), sees the **subject-aware roster** (D19 — only students taking the subject), enters marks bounded by `maxMarks`, saves, and finalizes (lock + read-only after).
- [ ] A locked sheet is read-only with a "reopen requires admin" affordance; co-scholastic grades are enterable per area from the scheme's labels.
- [ ] Admit cards download as PDFs (single + bulk per section) via the blob util.
- [ ] All lists use `DataGrid`; create/edit use `Modal` + UI primitives (+ PRP-13 forms); no page calls `axios` directly (all via `store/exam/*.services.ts` + TanStack Query); routes only from `APP_ROUTES`; classes via `cn()`; responses via `helper.*`.

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Manual (against backend PRP-49/50): create an exam → add schedules for Class 10 + Class 11 Science → attempt a same-grade clash (expect inline `409`) → publish schedule; as the assigned Maths teacher, open the Class-10 Maths sheet (only Maths-takers shown), enter marks (reject 105/100), save, finalize → read-only; download an admit card for an 11-Science student and confirm only their subjects' papers appear. Confirm a non-Admin can't reach `/exams/grading` and an unassigned teacher gets no marks sheet (PRP-11 guard; server authoritative via PRP-49/50).

## 8. Risks & rollback

- **API shape coupling:** depends on backend PRP-49/50 response envelopes — land after them or stub the services behind a flag. Keep all shapes in `exam.type.ts` so a contract change is one file (the `developer.type.ts` discipline).
- **Subject-awareness (D19):** the marks roster **must** come from the backend's subject-aware `getMarksSheet`, never a client-side "all students in section" list — otherwise a Commerce student gets a Physics row. The grid renders exactly what the API returns.
- **Marks-grid data density + dirty state:** entering a whole class's marks is the heaviest screen — guard unsaved changes, batch saves, and reflect the finalize lock immediately (invalidate `['exam','marks', examScheduleId]`). A stale "editable" grid after finalize is a correctness risk.
- **⚠︎ O-P5 (grading config):** the grading-scheme editor must stay data-driven — do not hard-code CBSE bands or a report-card template in the UI; render whatever the backend `GradingScheme` returns and surface the assumption notice. Resolving O-P5 is a backend config change, not an FE edit.
- **Permission-string drift:** `exam.*`/`grading.*`/`marks.*` must come from the PRP-10 shared module (mirroring backend PRP-17/49/50) — do not hand-type keys in `permissions.ts` here.
- **Blob download is greenfield:** the `downloadBlob` util is shared with PRP-53 — keep it generic (blob + filename), handle the `application/pdf` content-type, and revoke object URLs.
- **Rollback:** fully additive (new store/modules/pages + route keys + one menu section + a util); revert and the catch-all (`app/[...slug]`) reclaims `/exams/*`. Do not revert shared `routes.ts`/RBAC changes that PRP-53 also depends on.
