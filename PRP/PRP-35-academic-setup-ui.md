# PRP-35 — Academic setup UI (years/terms/classes/sections/subjects/streams)

> **Status:** Proposed · **Phase:** 2 · **Severity:** 🔴 High · **Size:** L **Addresses:** P2-FE-1 (implementation-plan PRP-35; master-prp §3 D18/D19, §6 P2) · **Depends on:** backend PRP-28 (academic year + configurable terms), backend PRP-29 (classes→sections→subjects + streams/electives); FE PRP-10 (abilities/`activeSchoolId`), PRP-11 (permission menu + route guards), PRP-25 (Admin landing + merged nav) · **Pairs with:** PRP-36 (staff/student management consumes years/sections/subjects), PRP-37 (promotion/admissions consume the year + section structure)

## 1. Problem / current state

The school side has **no academic-setup surface** at all. Today `src/app/(school)/` only contains `dashboard/`, `profile/`, and `school/` placeholders, and the Admin/Teacher route maps in `APP_ROUTES.school.admin`/`.teacher` declare `classes`/`syllabus` strings that fall through to `app/[...slug]/page.tsx` ("page not built yet"). There is:

- no academic-year concept on the client (no active-year selection, no year switcher);
- no terms configuration (CBSE 2-term / 3-trimester / 4-quarter — D18);
- no Grade → Section management, no per-class subject mapping, and no senior-secondary streams/electives (D19);
- no `src/store/academic/` feature folder; `src/store/` holds only `auth/` and `developer/`.

Backend PRP-28 introduces `AcademicYear` (one active per school) + per-school `Term`s, and PRP-29 introduces `Grade`, `Section`, `Subject`, `Stream`, `ClassSubject`, and `StudentSubject` (electives) — everything academic-year-scoped (D18). This PRP builds the Admin-facing web screens to manage that structure, so the rest of P2 (students, staff assignments, enrollment, promotion) has classes/sections/subjects to attach to.

## 2. Goal & non-goals

- **Goal:** an Admin **Academic setup** area under the `(school)` group that consumes PRP-28/29: manage **academic years** (create, mark active, view rollover state), **terms** (configure the per-school term shape), **classes/grades → sections**, **subjects** (+ per-class `ClassSubject` mapping), and **streams + electives** for senior secondary (grades 11–12). All data flows through a new `src/store/academic/{store,services,type}.ts` layer + TanStack Query; all lists use the `DataGrid` system; all routes come from `APP_ROUTES`; create/edit happen in `Modal`s built from `src/components/ui` primitives. The **active academic year** is exposed as shared client state that PRP-36/37 read.
- **Non-goals:** the backend tables/endpoints (PRP-28/29); student enrollment into sections and year-end promotion (PRP-37); teacher→section→subject assignment (PRP-36 / backend PRP-30 — this PRP defines the structure those screens reference, not the assignment UI); attendance/fees/exam configuration that _uses_ terms (P3+); the RBAC/menu primitives themselves (PRP-10/11). Per-school custom roles are out of scope (master §2 non-goals).

## 3. Target design

### 3.1 Routes (`src/constants/routes.ts`)

Add an academic-setup group to `APP_ROUTES.school` (strings live **only** here; pages/menu never hardcode). The existing duplicative per-role `APP_ROUTES.school.admin/teacher/...` maps are slated for collapse in PRP-11/25 — add the new keys in whatever shape that collapse settles on; the routes themselves are:

- `school.academic.years` → `/academic/years`
- `school.academic.terms` → `/academic/terms`
- `school.academic.classes` → `/academic/classes` (grades + sections; section detail can be a panel or `…/classes/[gradeId]`)
- `school.academic.subjects` → `/academic/subjects`
- `school.academic.streams` → `/academic/streams` (streams + elective groups, senior secondary)

⚠︎ **Assumption (master §10 O-P2):** the exact academic-structure depth (e.g. whether "houses"/"sets" exist beyond grade/section, elective-group cardinality) is not finalized. Plan the screens around the PRP-29 entity set (`Grade`/`Section`/`Subject`/`Stream`/`ClassSubject`/`StudentSubject`) and treat anything beyond it as additive.

### 3.2 Active-academic-year state

Because **all** operational data is year-scoped (D18), the active year is cross-cutting client state, not page-local:

- Add an `academicYearId` selection to the academic store (mirroring how PRP-10 holds `activeSchoolId`). It seeds from the backend's active `AcademicYear` for the `activeSchool` and is overridable via a year switcher (for viewing past years read-only).
- ⚠︎ **Assumption:** a global header **year switcher** is desirable but its placement (global header vs. per-screen filter) is a UX open question. Plan it as a small selector sourced from `fetchYears()`; if PRP-10's school switcher pattern is reused, co-locate it. PRP-36/37 read `academicYearId` from this store rather than re-deriving it.

### 3.3 State & services (`src/store/academic/`)

New feature folder following the house split (`{store,services,type}.ts`), mirroring `store/developer/` and the React-Query refactor PRP-09 introduced (a `*.queries.ts` companion is acceptable):

- **`academic.type.ts`:** `AcademicYear` (`{ id; name; startsOn; endsOn; isActive; status }`), `Term` (`{ id; academicYearId; name; sequence; startsOn; endsOn }`), `Grade` (`{ id; name; level; isSenior }`), `Section` (`{ id; gradeId; name; capacity?; classTeacherUserId? }`), `Subject` (`{ id; name; code?; isElective }`), `ClassSubject` (`{ id; gradeId; subjectId; academicYearId }`), `Stream` (`{ id; name }`), and `StudentSubject` reference type for electives. Payload types: `CreateYearPayload`, `ConfigureTermsPayload`, `CreateGradePayload`, `CreateSectionPayload`, `CreateSubjectPayload`, `MapClassSubjectPayload`, `CreateStreamPayload`. Keep field names aligned with PRP-28/29 response shapes so a contract change is one file. Response aliases via `SuccessResponse<…>`/`ErrorResponse` (as in `developer.type.ts`).
- **`academic.services.ts`** (through `apiClient` + `helper.successResponse`/`helper.errorResponse`; components never call axios):
  - Years: `fetchYears()`, `createYear(payload)`, `setActiveYear(yearId)`
  - Terms: `fetchTerms(yearId)`, `configureTerms(yearId, payload)`
  - Classes/sections: `fetchGrades(yearId)`, `createGrade`, `fetchSections(gradeId|yearId)`, `createSection`, `updateSection`
  - Subjects: `fetchSubjects()`, `createSubject`, `fetchClassSubjects(yearId)`, `mapClassSubject`, `unmapClassSubject`
  - Streams/electives: `fetchStreams()`, `createStream`, `fetchElectiveGroups(gradeId)` (senior secondary) Endpoint paths mirror PRP-28/29 (school-scoped server-side via backend PRP-12); the FE sends `activeSchoolId`/`academicYearId` per PRP-10 as those endpoints require.
- **Server state via TanStack Query** (PRP-09 boundary, as PRP-09 established): query keys `['academic','years', schoolId]`, `['academic','terms', yearId]`, `['academic','grades', yearId]`, `['academic','sections', yearId|gradeId]`, `['academic','subjects', schoolId]`, `['academic','classSubjects', yearId]`, `['academic','streams', schoolId]`. Mutations `invalidateQueries` on the relevant key on success. Keep Zustand for the `academicYearId` selection only (cross-cutting UI state); the record-of-truth cache is React Query.

### 3.4 UI modules (`src/modules/academic-setup/`)

Each screen is a module; pages under `app/(school)/academic/**` stay thin and render the module (mirroring how `schools/page.tsx` renders `SchoolList`). Reuse `MainWrapper`, `DataGrid` + `GridColumn`/`GRID_COLUMN_TYPE` (barrel `@/components`), and `Button`/`Modal`/`InputBox`/`SelectInput`/`DateInput`/`Checkbox`/`Loader` from `src/components/ui`, plus `appToast` and `cn()`.

- **`AcademicYears.tsx`:** `DataGrid` of years (name, start/end via `GRID_COLUMN_TYPE.DATE`, an "Active" badge via a `CUSTOM` cell). "Add year" `Modal` (name + start/end `DateInput`); a row "Set active" action calling `setActiveYear` (with a confirm `Modal`, since it changes the operational year for the whole school). Past years render read-only.
- **`TermsConfig.tsx`:** shows the active year's term shape; an editor (preset chooser — 2-term / 3-trimester / 4-quarter — plus per-term name/date `DateInput`s) that calls `configureTerms`. Because fees/exams/report-cards align to terms (D18), surface a note that changing terms affects downstream modules.
- **`ClassesSections.tsx`:** Grades list (Nursery…12) with each grade's Sections (a master/detail layout or a `DataGrid` of sections filtered by selected grade). "Add grade", "Add section" (name, optional capacity, optional class-teacher — the teacher picker is a placeholder until PRP-36/30 lands the staff list) `Modal`s. `_id` on each dataset row per the DataGrid convention.
- **`SubjectsMatrix.tsx`:** a subjects `DataGrid` (name/code, elective flag) + a **per-class subject-mapping** view (`ClassSubject`): a grade × subject grid (rows = grades for the active year, columns or a per-grade panel of subjects, cells = `Checkbox`) that batches into `mapClassSubject`/`unmapClassSubject`. Follows the matrix pattern PRP-22 _will_ introduce (no shared component exists yet — build it locally here).
- **`StreamsElectives.tsx`** (senior secondary, grades 11–12): manage `Stream`s (Science/Commerce/Arts) and the elective groups per senior grade. Per-student elective _selection_ is part of enrollment (PRP-37) — here we define the available streams/electives only.

### 3.5 Guarding & menu

- All `academic/*` pages are Admin-scoped. Gate them with the PRP-11 route guard / `<Can>` keyed on the academic-setup permission. ⚠︎ The exact permission string is owned by backend PRP-17/PRP-29; the closest existing key in `src/constants/permissions.ts` is `classes.manage` (`CLASSES_MANAGE`). Plan to use the PRP-29-defined academic-setup permission (e.g. `academic.manage`) and reconcile it into the FE shared permission module (PRP-10) — do **not** hand-type a new string outside that module.
- Add an "Academic setup" section to the Admin menu via `project.menu.ts` using `APP_ROUTES` only, tagged with that permission (per PRP-11's permission-tagged menu). Group entries (Years, Terms, Classes & Sections, Subjects, Streams) under one section heading (PRP-25's sectioned-nav extension).

## 4. Implementation steps

1. **Routes:** add the `school.academic.*` keys to `src/constants/routes.ts` (no hardcoded paths anywhere else).
2. **Types:** add `src/store/academic/academic.type.ts` with the entities + payloads from §3.3, aligned to PRP-28/29 shapes.
3. **Services:** add `src/store/academic/academic.services.ts` (years/terms/grades/sections/subjects/classSubjects/streams) through `apiClient` + `helper.*`.
4. **Query layer + year state:** add `src/store/academic/academic.store.ts` (holds `academicYearId` + setter, seeded from the active year) and the TanStack Query hooks (inline or `academic.queries.ts`) with the §3.3 keys; mutations invalidate on success.
5. **Pages (thin):** add `app/(school)/academic/{years,terms,classes,subjects,streams}/page.tsx`, each rendering its module.
6. **Modules:** add `src/modules/academic-setup/{AcademicYears,TermsConfig,ClassesSections,SubjectsMatrix,StreamsElectives}.tsx` (+ a local `utils.ts` per screen for grid columns/dataset mappers, mirroring `manage-school/utils.ts`). Build create/edit `Modal`s with the UI primitives.
7. **Year switcher:** add a small year selector (sourced from `fetchYears()`) and decide its placement (global header vs. per-screen) — wire it to `academic.store`’s `academicYearId` so PRP-36/37 can read it.
8. **Menu + guard:** add the "Academic setup" section to `project.menu.ts` (via `APP_ROUTES`, permission-tagged per PRP-11) and apply the PRP-11 Admin guard to the new pages.

## 5. Files added / changed

- **Add:** `src/store/academic/academic.type.ts`, `src/store/academic/academic.services.ts`, `src/store/academic/academic.store.ts` (+ optional `academic.queries.ts`); `src/modules/academic-setup/AcademicYears.tsx`, `TermsConfig.tsx`, `ClassesSections.tsx`, `SubjectsMatrix.tsx`, `StreamsElectives.tsx` (+ per-screen `utils.ts`); `src/app/(school)/academic/years/page.tsx`, `.../terms/page.tsx`, `.../classes/page.tsx`, `.../subjects/page.tsx`, `.../streams/page.tsx`
- **Edit:** `src/constants/routes.ts` (new `school.academic.*` keys), `src/constants/project.menu.ts` (Academic-setup section). _(The academic-setup permission string is reconciled in the PRP-10 shared permission module; treat that edit as belonging to PRP-10/11, not this PRP, to keep the contract single-sourced.)_

## 6. Acceptance criteria

- [ ] An Admin can create an academic year, mark exactly one **active**, and view past years read-only; the active year drives a shared `academicYearId` that other P2 screens read.
- [ ] An Admin can configure the school's **term shape** (2-term / 3-trimester / 4-quarter) with per-term names/dates (D18), with a note that downstream modules align to terms.
- [ ] An Admin can manage **grades and their sections**, and add a section (name, optional capacity) under a grade.
- [ ] An Admin can manage **subjects** and map subjects **per class** (`ClassSubject`) for the active year via a grade × subject grid.
- [ ] For senior-secondary grades, an Admin can define **streams** and elective groups (per-student elective selection is deferred to PRP-37).
- [ ] All lists use `DataGrid`; create/edit use `Modal` + UI primitives; no page calls `axios` directly (all via `store/academic/*.services.ts` + TanStack Query); routes only from `APP_ROUTES`; classes via `cn()`; responses via `helper.*`.

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Manual (against backend PRP-28/29): create a year and set it active → confirm it becomes the operational year; configure terms → confirm the shape persists; add a grade + sections; map a subject to a class and confirm the grid reflects it; define a stream for grade 11. Confirm a non-Admin cannot reach `/academic/*` (PRP-11 guard; server authoritative via PRP-12/29).

## 8. Risks & rollback

- **API shape coupling:** depends on PRP-28/29 response envelopes — land after them or stub the services behind a flag. Keep all shapes in `academic.type.ts` so a contract change is one-file (the `developer.type.ts` discipline).
- **Active-year contract:** "one active year per school" is enforced server-side (PRP-28); the FE `setActiveYear` must reconcile the cache (invalidate `['academic','years', schoolId]`) so a stale "Active" badge can't linger. Year-scoped reads must always pass the selected `academicYearId`.
- **Permission-string drift:** the academic-setup permission must come from the PRP-10 shared module (mirroring PRP-17/29) — do not hand-type a key in `permissions.ts` here. ⚠︎ Open until O-P2/PRP-29 fix the string.
- **Term-change blast radius:** changing terms mid-year affects fees/exams/report-cards (D18, future phases) — surface the warning; actual guardrails belong to those phases.
- **Rollback:** fully additive (new store/modules/pages + route keys + one menu section); revert and the catch-all (`app/[...slug]`) reclaims the unused `/academic/*` routes. Do not revert shared `routes.ts`/RBAC changes that PRP-36/37 also depend on.
