# PRP-53 — Results & report-card viewing (admin / teacher / parent / student)

> **Status:** Proposed · **Phase:** 5 · **Severity:** 🔴 High · **Size:** L **Depends on:** backend PRP-51 (report-card generation + publish/revoke, published-result read, report-card/marksheet PDF, merit lists), backend PRP-50 (grading scheme behind the displayed grades) and PRP-49 (exams the results belong to); FE PRP-52 (exam/marks store + the `downloadBlob` util it introduces — reused for report-card PDFs), PRP-10 (abilities / `activeSchoolId`), PRP-11 (permission menu + route guards), PRP-25 (per-role landing + merged nav — results surface on each role's dashboard), PRP-09 (React-Query boundary), PRP-43 (parent portal web — the parent multi-child dashboard this results view plugs into; PRP-43 reserves a per-child dashboard **card slot** for results, via PRP-41's `results` slot, filled in P5 — not necessarily a tab/route) · **Backed by:** backend PRP-41 (parent portal APIs — its `/school/parent/dashboard` reserves a `results` slot that backend PRP-51 fills; the parent results view reads it)

## 1. Problem / current state

The school side has **no result or report-card viewing surface for any role**. `APP_ROUTES.school.admin/teacher/staff/student` all declare a `results` string (`/results`) that falls through to `app/[...slug]/page.tsx` ("page not built yet"); the student map also has it. PRP-52 lets staff **create** exams and teachers **enter** marks, and backend PRP-51 **aggregates + publishes** results and exposes a published-result read (gated: students/parents see a result **only after publish**, scoped to own/children). This PRP builds the **read/viewing** side for all four consuming personas:

- **Admin/Staff:** browse a section/grade's report cards, generate + **publish/revoke** results, view merit lists, bulk-download report-card PDFs.
- **Teacher:** view their sections' results/report cards (read-only).
- **Parent:** view each child's **published** report card + result history (multi-child).
- **Student:** view their own **published** report card + result history.

The parent is the **default actor for results** (master §D17/§4); most students have no phone, so the parent multi-child view is primary. Result visibility is **publish-gated server-side** (PRP-51) — the UI mirrors that (nothing shown until published) but never relies on FE gating for security.

## 2. Goal & non-goals

- **Goal:** a **Results** area consuming PRP-51: an Admin/Staff **results console** (generate report cards for a section/term, publish/revoke a batch, browse cards, view + download PDFs, merit lists); a **Teacher** read-only results view for their sections; a **Parent** multi-child results dashboard (per-child published report card + history + PDF download); a **Student** own-results view (published report card + history + PDF). All data through a new `src/store/results/{store,services,type}.ts` layer + TanStack Query; lists via `DataGrid`; report cards rendered as an on-screen **card view** plus a **PDF download** (reusing PRP-52's `downloadBlob`); all routes from `APP_ROUTES`.
- **Non-goals:** exam setup + marks entry (PRP-52); the backend aggregation/publish/PDF (PRP-51); the grading-scheme editor (PRP-52); the RBAC/menu primitives (PRP-10/11); the parent-portal _shell_ (PRP-43 — this PRP delivers the results section that plugs into it; if PRP-43 lands first, drop `ParentResults` into its reserved per-child dashboard `results` card slot, not a separate tab/route); notification of "results published" (P6/PRP-54); cross-year transcripts/certificates (P8/PRP-66); the report-card **template** design (O-P5 — the PDF is rendered server-side by PRP-51; the FE renders the structured JSON for the on-screen card).

## 3. Target design

### 3.1 Routes (`src/constants/routes.ts`)

Replace the `results` fall-through with a small results group; new strings live **only** in `src/constants/routes.ts`. The per-role `APP_ROUTES.school.*` maps are slated for collapse in PRP-11/25 — add the keys in that shape; the routes are:

- `school.results.console` → `/results` (Admin/Staff console: generate/publish/browse/merit)
- `school.results.reportCard` → `/results/[studentId]` (a single student's report card view; staff/teacher, and the owning student/parent)
- `school.results.merit` → `/results/merit` (merit lists; staff, student visibility per backend policy)
- `school.results.child(studentId)` → the parent's per-child result view (or a child selector on `/results` for the PARENT role — see §3.4)

⚠︎ **Assumption (master §10 O-P5):** the report-card **template/fields** and whether **rank is shown to students** are not finalized (rank visibility is a backend `ResultPolicy` flag — PRP-51 §3.2). The on-screen card renders whatever structured fields the backend returns and **hides rank when the API omits it**; the UI does not decide rank visibility (server-authoritative).

### 3.2 State & services (`src/store/results/`)

New feature folder, house split (`{store,services,type}.ts`), mirroring `store/developer/` + the React-Query pattern (a `*.queries.ts` companion is acceptable):

- **`results.type.ts`:** `ReportCardView` (`{ reportCardId; studentId; studentName; admissionNo; className; termName; totalMarks?; maxTotalMarks?; percentage?; overallGrade?; cgpa?; resultStatus; rank?; attendancePct?; remarks?; isPublished; subjects: ReportCardSubjectView[] }`), `ReportCardSubjectView` (`{ subjectId; subjectName; marksObtained?; maxMarks?; grade?; gradePoint?; isCoScholastic }`), `ResultStatus` union (PASS/FAIL/COMPARTMENT/WITHHELD/ABSENT — mirroring backend PRP-51), `MeritRow` (`{ rank; studentId; studentName; percentage?; cgpa? }`), `PublishScopePayload` (`{ termId; sectionId?|gradeId?; examId? }`). Keep field names aligned with PRP-51 response shapes so a contract change is one file. Response aliases via `SuccessResponse<…>`/`ErrorResponse`.
- **`results.services.ts`** (through `apiClient` + `helper.successResponse`/`helper.errorResponse`; components never call axios):
  - Staff: `generateReportCards(payload)`, `fetchReportCard(studentId, params)`, `publishResults(payload)`, `revokeResults(payload)`, `fetchMeritList(params)`, `fetchSectionResults(params)`
  - Published read (student/parent): `fetchPublishedResult(studentId, params)` — backend scopes to own/children + publication (PRP-51 §3.4)
  - Parent multi-child: per-child published cards sourced from **backend PRP-41's parent surface** — the children roster from `/school/parent/children` (or `/me/children` for the cross-school case) and the per-child `results` slot of `/school/parent/dashboard` (which backend PRP-51 fills); per-card detail via `fetchPublishedResult(studentId, params)`. The backend hard-scopes every child read to the caller's links (`resolveParentChildren`), so the FE never supplies an arbitrary `studentId`.
  - PDF (blob): `downloadReportCardPdf(studentId, params)`, `downloadSectionReportCardsPdf(params)` — `responseType: 'blob'`, then PRP-52's `downloadBlob(blob, filename)` (`src/utils/download.ts`). Endpoint paths mirror PRP-51 (school-scoped server-side via backend PRP-12); the FE sends `activeSchoolId`/`academicYearId`/`termId` as required.
- **Server state via TanStack Query** (PRP-09 boundary): query keys `['results','reportCard', { studentId, termId }]`, `['results','section', { sectionId, termId }]`, `['results','merit', params]`, `['results','children', { parentScope, termId }]`. Mutations (`generateReportCards`/`publishResults`/`revokeResults`) `invalidateQueries` on the section/report-card keys so a published badge / visible card updates without a manual refresh. The active year/term come from `store/academic` (PRP-35); Zustand holds only cross-cutting UI state (e.g. the parent's selected child).

### 3.3 Admin/Staff results console (`src/modules/results/`)

Each screen is a module; pages under `app/(school)/results/**` stay thin and render the module. Reuse `MainWrapper`, `DataGrid` + `GRID_COLUMN_TYPE`, `Button`/`Modal`/`SelectInput`/`Loader`, `appToast`, `cn()`.

- **`ResultsConsole.tsx`:** filters (term + grade/section `SelectIninput`s from `store/academic`); a **"Generate report cards"** action (calls `generateReportCards` for the scope, with a confirm `Modal`); a `DataGrid` of the section's students with their aggregated result (percentage, overall grade, status badge, rank if present via `CUSTOM` cells) sourced from `fetchSectionResults`; a **"Publish"** / **"Revoke"** action (confirm `Modal`, calls `publishResults`/`revokeResults`, audited server-side, invalidates the cache); a row → the report-card view; a **bulk "Download report cards (PDF)"** for the section. Surface a clear published/unpublished state per scope.
- **`ReportCardView.tsx`:** an on-screen CBSE-style **card** rendered from the structured `ReportCardView` JSON — school/student header, a per-subject table (subject, marks/max, grade, grade-point — **subject-aware**, only the student's subjects, D19), a co-scholastic block (descriptive grades), totals/percentage/overall grade/result-status, rank **only if the API returns it** (⚠︎ O-P5 visibility, §3.1), attendance if present, remarks. A **"Download PDF"** button (server-rendered via PRP-51, blob). This component is **shared** across staff/teacher/parent/student views (the data source differs: staff use `fetchReportCard`, student/parent use `fetchPublishedResult`).
- **`MeritList.tsx`:** a `DataGrid` of `MeritRow`s for an exam/term + scope, honoring the backend's rank policy (ties, scope) — staff see the full list; a student-facing merit view (if the backend enables `showRankToStudent`) is the same component fed the gated endpoint.

### 3.4 Teacher / Parent / Student views

- **Teacher (`TeacherResults.tsx`):** read-only — pick a section (their assigned sections) + term, view the section's report cards / results (reuses `ResultsConsole`'s grid + `ReportCardView` in read-only mode; no generate/publish). Teacher result access is server-scoped to their sections (PRP-51 matrix `report_card.read`/`result.read` "own sections").
- **Parent (`ParentResults.tsx`):** the **multi-child** results view (master §D17 — parent is the default actor). A child selector (the parent's linked children, from backend PRP-41's `/school/parent/children`) → that child's **published** report cards across terms (history list) → `ReportCardView` + PDF download. Shows "Results not yet published" when none are available (server returns nothing for unpublished — the UI never fabricates a result). The children list + per-child `results` slot come from **backend PRP-41's parent surface** (the `results` slot is filled by backend PRP-51); per-card detail via `fetchPublishedResult`. Because **PRP-43 (parent portal web)** owns the parent dashboard shell and renders a per-child **card** whose reserved `results` slot (PRP-41) P5 fills — a dashboard card slot, **not necessarily a tab/route** — build `ParentResults` **shell-agnostic** (a self-contained component taking the child scope as props, no assumption it owns a route or tab) so it drops into that card slot (and can stand alone at `/results` for the PARENT role until/if PRP-43 ships).
- **Student (`StudentResults.tsx`):** own **published** report cards across terms (history) + `ReportCardView` + PDF download; shows "Results not yet published" when none. Server scopes to self (PRP-51 §3.4).

All four reuse the single `ReportCardView` component; only the data hook (staff vs. published) and the surrounding chrome differ.

### 3.5 Guarding, landing & menu

- **Guarding:** the console + publish are Admin/Staff; the teacher/parent/student views are role-scoped. Gate pages with the PRP-11 route guard / `<Can>` keyed on the backend `report_card.*` / `result.*` strings (PRP-51). Crucially, **publish/revoke** is `result.publish` (Admin/Staff only) — the publish button must be `<Can>`-gated, but server authority (PRP-51) is the real control. ⚠︎ The exact strings come from backend PRP-17/51 — reconcile into the PRP-10 shared permission module; do **not** hand-type them.
- **Landing surfacing (PRP-25):** each role's dashboard (PRP-25) surfaces a results entry — Admin "publish results", Teacher "my sections' results", Parent/Student "latest report card". This PRP provides the screens; PRP-25 wires the landing cards (cross-reference, don't duplicate the landing composition here).
- **Menu:** add a "Results" entry to each role's menu via `project.menu.ts` using `APP_ROUTES` only, permission-tagged per PRP-11 (Admin/Staff → console; Teacher → section results; Parent/Student → their results).

## 4. Implementation steps

1. **Routes:** add the `school.results.*` keys to `src/constants/routes.ts` (no hardcoded paths elsewhere).
2. **Types:** add `src/store/results/results.type.ts` with the views + payloads from §3.2, aligned to backend PRP-51 shapes (enums mirrored).
3. **Services:** add `src/store/results/results.services.ts` (generate/publish/revoke/section/report-card/published/merit/children + blob PDFs) through `apiClient` + `helper.*`; PDF endpoints use `responseType: 'blob'` + PRP-52's `downloadBlob`.
4. **Query layer:** add `src/store/results/results.store.ts` (selected-child + console-filter UI state) and TanStack Query hooks (inline or `results.queries.ts`) with the §3.2 keys; publish/generate mutations invalidate the section/report-card keys. Read active year/term from `store/academic` (PRP-35).
5. **Pages (thin):** add `app/(school)/results/page.tsx` (role-aware: renders `ResultsConsole` for Admin/Staff, `TeacherResults`/`ParentResults`/`StudentResults` for the others, or split by route group per PRP-11/25), `app/(school)/results/[studentId]/page.tsx`, `app/(school)/results/merit/page.tsx`.
6. **Modules:** add `src/modules/results/{ResultsConsole,ReportCardView,MeritList,TeacherResults,ParentResults,StudentResults}.tsx` (+ per-screen `utils.ts` for grid columns/dataset mappers). Build the shared `ReportCardView` first (consumed by all). Publish/revoke via confirm `Modal`s.
7. **Menu + landing + guard:** add the "Results" menu entries to `project.menu.ts` (via `APP_ROUTES`, permission-tagged per PRP-11); cross-reference PRP-25 for the landing cards; apply the PRP-11 guards to the new pages and `<Can>`-gate the publish button.

## 5. Files added / changed

- **Add:** `src/store/results/results.type.ts`, `src/store/results/results.services.ts`, `src/store/results/results.store.ts` (+ optional `results.queries.ts`); `src/modules/results/ResultsConsole.tsx`, `ReportCardView.tsx`, `MeritList.tsx`, `TeacherResults.tsx`, `ParentResults.tsx`, `StudentResults.tsx` (+ per-screen `utils.ts`); `src/app/(school)/results/page.tsx`, `.../results/[studentId]/page.tsx`, `.../results/merit/page.tsx`
- **Edit:** `src/constants/routes.ts` (new `school.results.*` keys), `src/constants/project.menu.ts` (Results entries per role). _(The report-card/result permission strings are reconciled in the PRP-10 shared permission module — treat that edit as belonging to PRP-10/11, not this PRP. Reuses `src/utils/download.ts` added by PRP-52 — do not re-add it.)_

## 6. Acceptance criteria

- [ ] An Admin/Staff can filter by term + section, **generate** report cards, browse the section's aggregated results in a `DataGrid`, and **publish**/**revoke** a batch — with the published state reflected without a manual refresh.
- [ ] The shared `ReportCardView` renders a CBSE-style on-screen card from structured JSON — per-subject rows are **subject-aware** (only the student's subjects, D19), co-scholastic grades shown, totals/percentage/overall grade/result-status present, and **rank shown only when the API returns it** (⚠︎ O-P5 server-authoritative visibility).
- [ ] A Teacher sees only their sections' results (read-only); an Admin/Staff sees all in scope.
- [ ] A Parent sees each linked child's **published** report cards + history and can download the PDF; an unpublished result shows "not yet published" (never fabricated).
- [ ] A Student sees only their own **published** results + history + PDF; nothing before publish.
- [ ] Report-card PDFs (single + bulk per section) download via the shared `downloadBlob` util.
- [ ] Merit lists render per the backend rank policy (ties/scope) and respect student visibility.
- [ ] All lists use `DataGrid`; actions use `Modal` + UI primitives; no page calls `axios` directly (all via `store/results/*.services.ts` + TanStack Query); routes only from `APP_ROUTES`; classes via `cn()`; responses via `helper.*`; the publish button is `<Can>`-gated (server authoritative).

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Manual (against backend PRP-49/50/51, after PRP-52 created exams + marks): generate report cards for a section/term → browse results → open a report card (subject-aware, rank hidden if policy omits it) → download its PDF → publish the section; sign in as a parent of an enrolled child → see the published card + download PDF, and as an unrelated parent → see nothing; sign in as the student → see own published card; before publish, confirm parent/student see "not yet published". Confirm a teacher sees only their sections and cannot publish (PRP-11 guard + server authority).

## 8. Risks & rollback

- **API shape coupling:** depends on backend PRP-51 response envelopes (report-card JSON, published-result read, merit) — land after it or stub the services behind a flag. Keep all shapes in `results.type.ts` so a contract change is one file (the `developer.type.ts` discipline).
- **Visibility is server-authoritative — FE gating is UX only:** the UI must **never** show an unpublished/withheld result or another family's child by relying on client logic. It renders exactly what the publish-gated, ownership-scoped PRP-51 endpoints return; `<Can>` gating is convenience, not security. A leak here is the highest-severity bug — mirror the server contract exactly.
- **Subject-awareness (D19):** the report-card subject rows come from the backend (which lists only the student's `StudentSubject` subjects) — the FE never pads with the grade's full subject set.
- **⚠︎ O-P5 (template + rank visibility):** the on-screen card renders structured fields the backend returns and **hides rank when omitted** (rank visibility is PRP-51's `ResultPolicy.showRankToStudent`, server-side) — the FE does not decide it. The PDF is server-rendered (PRP-51), so the on-screen card and PDF must not diverge in what they show.
- **Parent multi-child dependency:** the children roster + dashboard `results` slot are owned by backend PRP-41 (Proposed, P3) and filled by backend PRP-51 (P5) — read them rather than re-deriving a children list on the client. PRP-43 (parent portal web, Proposed, P3) owns the parent dashboard shell and reserves a per-child **card slot** for results (via PRP-41's `results` slot, filled P5) — not necessarily a tab/route; build `ParentResults` **shell-agnostic** (child scope via props, no route/tab assumption) so it drops into that card slot (and stands alone for the PARENT role until then).
- **PDF blob reuse:** reuse PRP-52's `downloadBlob` (do not re-add it); handle `application/pdf` and revoke object URLs; bulk section PDFs may be large (backend may defer to a job — show a loading/queued state if so).
- **Rollback:** fully additive (new store/modules/pages + route keys + menu entries); revert and the catch-all (`app/[...slug]`) reclaims `/results/*`. Do not revert shared `routes.ts`/RBAC changes or PRP-52's `download.ts` that other PRPs depend on.
