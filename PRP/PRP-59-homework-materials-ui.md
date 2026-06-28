# PRP-59 — Homework / materials / syllabus UI (web)

> **Status:** Proposed · **Phase:** 6 · **Severity:** 🟠 Med · **Size:** L **Addresses:** P6-FE-2 (master-prp §6 P6, decisions D13/D17) · **Depends on:** backend PRP-57 (homework/assignments + submissions + study materials + syllabus tracking APIs); FE PRP-10 (`deriveAbilities`/`activeSchoolId`/typed roles + shared permission keys), PRP-11 (permission menu + `<Can>`/route guards), PRP-25 (per-role landing pages this extends), PRP-24 (`<WriteGate>` / subscription banner), PRP-09 (React Query boundary), PRP-13 (forms + zod); leans on P2 selectors (PRP-35/36 class-subject/section pickers) · **Pairs with:** MOB PRP-60 (mobile homework — same backend, parallel UX) · **Sibling:** PRP-58 (the other half of the P6 web comms surface)

## 1. Problem / current state

Backend PRP-57 now exposes **homework/assignments** (post/submit/grade), **study materials** (file/link per class-subject), and **syllabus tracking** (chapter coverage), but the web app has **no screens** for any of it. The role-aware shell (PRP-10/11/25), academic setup (P2), and the P3–P5 surfaces exist, but the teacher's "post & grade homework", the student/parent's "see & submit homework", the per-subject materials library, and the syllabus-coverage view are all missing. `APP_ROUTES` has no homework/materials/syllabus keys and there's no `store/homework` etc.

This PRP builds those screens on the house conventions: UI in `src/modules/<feature>/`, client state/API in `src/store/<feature>/` (`*.store.ts`/`*.services.ts`/`*.type.ts`), server state via **TanStack Query** (PRP-09 — no parallel Zustand cache), routes from **`APP_ROUTES`** only, responses through `helper.*`, classes via `cn()`, forms via PRP-13 `react-hook-form`+`zod`, writes gated by PRP-24's `<WriteGate>` + `<Can>` keys mirroring PRP-57 **verbatim** via the PRP-10 shared module. The role-branched visibility (teacher↔their class-subjects, student↔own enrollment + own submission, parent↔child, admin↔all) mirrors what PRP-57 enforces server-side — the FE gates are UX; the server is authoritative.

⚠︎ **O-P6 (master-prp §10):** the **template catalog** affects only the backend notifications PRP-57 emits (homework assigned/graded) — the FE just surfaces them via the PRP-58 in-app feed/bell; no FE concern here beyond linking the feed item to a homework detail.

## 2. Goal & non-goals

- **Goal:** (a) **Homework (teacher)** — a list of the teacher's homework per class-subject, a compose/edit screen (instructions, attachments, due date, optional max marks, publish), and a **grading grid** (every enrolled student's submission with status, open-to-grade with marks + feedback) gated by `homework.manage`/`homework.grade`; (b) **Homework (student/parent)** — a list of assigned homework for the student's enrolled class-subjects, a detail with a **submit** flow (text + file) gated `homework.submit` (a parent submitting on a child's behalf, D17), and the graded result/feedback; (c) **Study materials** — a per-class-subject library (file/link), with teacher CRUD (`material.manage`) and student/parent read; (d) **Syllabus** — a per-class-subject unit list with coverage status/% (teacher edits `syllabus.manage`; student/parent/admin read); all via `store/homework`/`store/material`/`store/syllabus` services + TanStack Query; routes in `APP_ROUTES`; writes `<WriteGate>`-wrapped.
- **Non-goals:** any backend change (PRP-57 owns the APIs); the **notices/events/messaging/PTM/preferences** UI (PRP-58); the **mobile** homework UI (PRP-60); auto-grading/quiz UI (PRP-57 has none — homework is instructions + file/text); a rich WYSIWYG (textarea/markdown for instructions/feedback); linking homework marks into report cards (PRP-57 keeps them separate from PRP-50 — the UI shows them as assignment scores, not report-card marks); offline submission (web is online; mobile PRP-60 may add offline-friendliness, not web).

## 3. Target design

### 3.1 Routes (extend `APP_ROUTES` in `src/constants/routes.ts`)

New strings only here, as a `homework`/`academics` feature map:

- `school.homework.list` → `/homework` (role-branched: teacher's vs student's/child's)
- `school.homework.detail(id)` → `/homework/[homeworkId]` (detail + submit for student; submissions grid entry for teacher)
- `school.homework.compose` → `/homework/compose` (teacher)
- `school.homework.grade(id)` → `/homework/[homeworkId]/submissions` (teacher grading grid)
- `school.materials` → `/materials` (per-class-subject library)
- `school.syllabus` → `/syllabus` (coverage view)

### 3.2 State & services (store split, PRP-09)

Three feature slices under `src/store/`:

- **`src/store/homework/`** — `homework.type.ts` (mirrors PRP-57: `Homework`, `HomeworkStatus`, `HomeworkSubmission`, `SubmissionStatus`, attachment shapes; reuse PRP-10 `SchoolRole`/`PermissionKey` + P2's `ClassSubject`/section types — don't redefine); `homework.services.ts` (`fetchHomeworkList(filters)`, `fetchHomework(id)`, `createHomework`, `updateHomework`, `publishHomework`, `submitHomework(id, payload)`, `fetchSubmissions(id)` (teacher grid), `gradeSubmission(id, sid, payload)`, `presignHomeworkAttachment`, `presignSubmissionFile`).
- **`src/store/material/`** — `material.type.ts` (PRP-57 `StudyMaterial`/`MaterialKind`); `material.services.ts` (`fetchMaterials(classSubjectId)`, `createMaterial`, `updateMaterial`, `deleteMaterial`, `presignMaterialFile`).
- **`src/store/syllabus/`** — `syllabus.type.ts` (PRP-57 `SyllabusUnit`/`SyllabusStatus`); `syllabus.services.ts` (`fetchSyllabus(classSubjectId)`, `createUnit`, `updateUnit`, `deleteUnit`).
- **TanStack Query keys** (PRP-09): `['homework','list',filters]`, `['homework',id]`, `['homework',id,'submissions']`, `['materials',classSubjectId]`, `['syllabus',classSubjectId]`. Mutations (`publishHomework`/`submitHomework`/`gradeSubmission`/material+syllabus CRUD) `invalidateQueries` on success. All via `apiClient` + `helper.*`; no parallel Zustand cache.

### 3.3 Homework — teacher (`src/modules/homework/`)

- **`HomeworkListScreen.tsx`** (`app/(school)/homework/page.tsx`, teacher branch): a **class-subject picker** (the teacher's assigned class-subjects — PRP-57 scopes server-side) + a list of homework for it with status + submission counts (e.g. "12/30 submitted"). A "New homework" button (gated `<Can permission="homework.manage">`) → compose.
- **`HomeworkComposeScreen.tsx`** (`app/(school)/homework/compose/page.tsx`): a PRP-13 form — class-subject, title, instructions, attachments (presigned upload), due date, optional max marks; save DRAFT or **publish**. `<WriteGate>`-wrapped; gated `homework.manage`.
- **`HomeworkGradingGrid.tsx`** (`app/(school)/homework/[homeworkId]/submissions/page.tsx`): the `DataGrid` of every enrolled student (`fetchSubmissions`) with status (Assigned/Submitted/Late/Graded), the submitted text/file (presigned download), and an inline/modal **grade** action (marks ≤ maxMarks + feedback → `gradeSubmission`, fans out `homework.graded` server-side). Gated `homework.grade`, `<WriteGate>`.

### 3.4 Homework — student / parent (`src/modules/homework/`)

- **`HomeworkListScreen.tsx`** (student/parent branch of the same route): assigned homework for the student's enrolled class-subjects (a **child switcher** for a parent of multiple children, tied to PRP-10 `activeSchoolId`/child selection like PRP-43), each with due date + own submission status.
- **`HomeworkDetailScreen.tsx`** (`app/(school)/homework/[homeworkId]/page.tsx`, student/parent branch): instructions + attachments (download), and a **submit** panel (text + file via presigned upload → `submitHomework`) gated `homework.submit` + `<WriteGate>`; after grading, shows marks + feedback (read-only). A parent submitting on a child's behalf (D17) selects the child context. Past-due submits are allowed but flagged LATE (server decides — the UI shows the due state).

### 3.5 Study materials (`src/modules/materials/`)

- **`MaterialsScreen.tsx`** (`app/(school)/materials/page.tsx`): a class-subject picker → a library list (`fetchMaterials`) of FILE (download) + LINK (open) items grouped by topic. Teachers (`material.manage`) get add/edit/delete (file presign or URL) in a `<WriteGate>`-wrapped editor; students/parents read-only. The class-subject options are role-scoped (teacher's assignments / student's enrollment) — server-authoritative.

### 3.6 Syllabus (`src/modules/syllabus/`)

- **`SyllabusScreen.tsx`** (`app/(school)/syllabus/page.tsx`): a class-subject picker → the ordered unit list (`fetchSyllabus`) with each unit's status (PLANNED/IN_PROGRESS/COVERED) + a progress bar (%), and an overall coverage summary. Teachers (`syllabus.manage`) edit units + mark coverage (status/% via a `<WriteGate>`-wrapped editor); students/parents/admins read-only — a transparency view of how much of the subject is covered.

### 3.7 Menu & guards (PRP-11/25)

Add permission-tagged entries to `src/constants/project.menu.ts` (via `APP_ROUTES` only): a **Homework** entry (`homework.read`), **Materials** (`material.read`), **Syllabus** (`syllabus.read`). Visibility flows from `deriveAbilities` (PRP-10) — the teacher's entries also need `homework.manage`/`grade`; the student/parent the read + `homework.submit`. All pages under `(school)` inherit PRP-24's banner + PRP-11 guards; write/grade/submit controls additionally gate on their keys. These fill the academic slots PRP-25's teacher/student/parent landing pages reserve.

## 4. Implementation steps

1. **Routes:** add the `school.homework.*`, `school.materials`, `school.syllabus` keys to `src/constants/routes.ts` (never hardcode).
2. **Types/services:** add `src/store/{homework,material,syllabus}/{*.type,*.services}.ts` mirroring PRP-57; reuse PRP-10 + P2 types; presigned upload/download helpers for attachments/submission files.
3. **Query hooks:** add hooks with the §3.2 keys; mutations `invalidateQueries` (PRP-09).
4. **Homework UI:** add `src/modules/homework/{HomeworkListScreen,HomeworkComposeScreen,HomeworkDetailScreen,HomeworkGradingGrid}.tsx` — list role-branched; compose/grade gated + `<WriteGate>`; submit gated + `<WriteGate>`.
5. **Materials UI:** add `src/modules/materials/MaterialsScreen.tsx` (teacher CRUD vs read-only) reusing `DataGrid`/`Modal`/`Button`/`SelectInput`.
6. **Syllabus UI:** add `src/modules/syllabus/SyllabusScreen.tsx` (coverage view + teacher editor).
7. **Pages (thin):** add `app/(school)/homework/{page,compose/page,[homeworkId]/page,[homeworkId]/submissions/page}.tsx`, `app/(school)/materials/page.tsx`, `app/(school)/syllabus/page.tsx` — each renders its module.
8. **Menu + guards:** add the permission-tagged entries to `project.menu.ts` (via `APP_ROUTES`, PRP-11); confirm `<Can>`/route guards gate each screen and `<WriteGate>` wraps every mutating control.

## 5. Files added / changed

- **Add:** `src/store/homework/{homework.type,homework.services}.ts`, `src/store/material/{material.type,material.services}.ts`, `src/store/syllabus/{syllabus.type,syllabus.services}.ts`, `src/modules/homework/{HomeworkListScreen,HomeworkComposeScreen,HomeworkDetailScreen,HomeworkGradingGrid}.tsx`, `src/modules/materials/MaterialsScreen.tsx`, `src/modules/syllabus/SyllabusScreen.tsx`, pages under `src/app/(school)/{homework,materials,syllabus}/…`, optional `*.queries.ts`
- **Edit:** `src/constants/routes.ts`, `src/constants/project.menu.ts`

## 6. Acceptance criteria

- [ ] A teacher picks one of **their** class-subjects, sees its homework with submission counts, composes + publishes homework (instructions, attachments, due date, optional max marks) gated `homework.manage` + `<WriteGate>`, and grades via a grid listing every enrolled student (marks ≤ maxMarks + feedback → `gradeSubmission`).
- [ ] A student sees assigned homework for **their** enrolled class-subjects and **their own** submission; submits text + file (`homework.submit`, `<WriteGate>`); sees marks + feedback after grading; a parent can switch children and submit on a child's behalf (D17).
- [ ] A student/teacher cannot see another class-subject's homework or another student's submission (server-authoritative, PRP-57 — the FE handles a `403/404` cleanly).
- [ ] Study materials list per class-subject (file/link, grouped by topic); teachers CRUD (`material.manage`, `<WriteGate>`), others read-only.
- [ ] Syllabus shows ordered units with PLANNED/IN_PROGRESS/COVERED + % and an overall coverage summary; teachers edit/mark coverage (`syllabus.manage`); others read-only.
- [ ] All routes come from `APP_ROUTES`; menu entries are permission-tagged (PRP-11) and visibility flows from `deriveAbilities` (PRP-10); permission keys match PRP-57 verbatim via the PRP-10 shared module; all data flows through `store/*` services + TanStack Query (no direct axios); the server (PRP-15/12/57) stays authoritative; writes are `<WriteGate>`-gated.

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Manual (against a backend with PRP-57 + P2/PRP-29/30/32 seed): as a teacher of section A Math, compose + publish homework → it appears for an A student; as that student, submit a file → status Submitted; as the teacher, open the grading grid → all A students listed, grade the submission → the student sees marks + feedback; confirm a B student can't see A's homework and a student can't open another's submission; post a FILE + LINK material → visible to A; add syllabus units + mark one COVERED → coverage reflects it; as a parent of two children, switch child and submit on their behalf; force the school READ_ONLY → compose/submit/grade/material/syllabus writes disable and a forced write is server-rejected.

## 8. Risks & rollback

- **Server is authoritative (PRP-15/12/57):** `<WriteGate>`/`<Can>` are UX only — the teacher-assignment ∪ enrollment ∪ guardian scoping, the per-student submission isolation, and tenant scope are enforced server-side; the FE must handle `403/404` (another class's homework, another student's submission, an unassigned class-subject) gracefully rather than assume the menu prevented it.
- **Contract coupling:** the homework/submission/material/syllabus shapes must mirror PRP-57 exactly — keep them in `*.type.ts` so a backend contract change is one file (PRP-43 risk note); permission keys come from the PRP-10 shared module (mirroring PRP-17), not hand-typed; reuse P2's class-subject/section selectors so the pickers can't drift.
- **Attachment / submission files:** upload via presigned direct-to-S3 (don't proxy through the API); download via the backend's short-lived **gated** presigned GET — never construct bucket URLs client-side; a submission file is the student's, never expose it cross-student (the GET is gated by PRP-57's visibility predicate).
- **Grading grid scale:** a large section's grading grid must paginate/virtualize via the existing `DataGrid` (don't render hundreds of rows raw); fetch submissions server-paginated where PRP-57 supports it.
- **Marks ≠ report-card marks:** show homework `marksAwarded` as **assignment/formative** scores, clearly separate from PRP-53's report-card view (PRP-57 keeps them distinct) — don't imply they feed the report card.
- **Child switcher reuse:** the parent's child switcher must reuse PRP-43/PRP-10's `activeSchoolId`/child-selection mechanism (cross-school children, D17) — don't reinvent a second switcher.
- Rollback: all additive — revert the new stores/modules/pages/routes/menu entries. The catch-all (`app/[...slug]`) reclaims the unused routes. No existing behavior changes.
