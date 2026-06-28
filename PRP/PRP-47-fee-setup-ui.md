# PRP-47 — Fee setup UI (heads / plans / adjustments)

> **Status:** Proposed · **Phase:** 4 · **Severity:** 🔴 High · **Size:** L **Depends on:** backend PRP-44 (fee heads + per-class year-versioned plans), backend PRP-45 (student adjustments + fines); FE PRP-10 (abilities / `activeSchoolId`), PRP-11 (permission menu + route guards), PRP-35 (academic-setup UI — supplies the `src/store/academic/` year/grade/section state + the active-`academicYearId` this screen reads) · **Pairs with:** PRP-48 (fee collection + parent view consumes the same plans/dues), PRP-25 (Admin landing + merged nav)

## 1. Problem / current state

The school side has **no fee-setup surface**. `src/app/(school)/` holds only `dashboard/`, `profile/`, `school/`, and (after PRP-35) `academic/*`; there is no `src/store/fees/` feature folder (`src/store/` holds `auth/`, `developer/`, and PRP-35's `academic/`), and any fee route falls through to `app/[...slug]/page.tsx` ("page not built yet"). An Admin cannot define what the school charges, build a per-class plan, or grant a sibling discount.

Backend PRP-44 introduces `FeeHead` (school-defined catalog), `FeePlan` (class × year × **version**, `DRAFT`/`PUBLISHED`/`ARCHIVED`), and `FeePlanItem` (head / amount / term-installment / due); PRP-45 adds `FeeAdjustment` (discount/concession + optional-head opt-in) and a configurable `FineRule`. This PRP builds the Admin web screens to manage that configuration, reusing PRP-35's academic store for years/grades/sections so plans attach to a real class + active year. **All money is displayed verbatim from the backend (strings), never recomputed in JS** — mirroring the backend's Decimal discipline (D1).

## 2. Goal & non-goals

- **Goal:** an Admin **Fee setup** area under the `(school)` group consuming PRP-44/45: manage **fee heads**, build/publish **per-class year-versioned fee plans** (with term-aligned installments + due dates), and record **student adjustments** (discounts/concessions + optional-head opt-ins) and the **fine rule**. All data flows through a new `src/store/fees/{store,services,type}.ts` layer + TanStack Query; all lists use `DataGrid`; create/edit happen in `Modal`s from `src/components/ui`; all routes from `APP_ROUTES`; the active `academicYearId` comes from PRP-35's academic store.
- **Non-goals:** recording payments, receipts, defaulter/ledger views, and the parent fee view (PRP-48); the backend tables/endpoints (PRP-44/45); online payment (P7, OUT of scope per D7); the RBAC/menu primitives (PRP-10/11); the academic year/grade/section management itself (PRP-35 — this screen _reads_ that structure).

## 3. Target design

### 3.1 Routes (`src/constants/routes.ts`)

Add a fee-setup group to `APP_ROUTES.school` (strings live **only** here; pages/menu never hardcode — house rule). Mirror PRP-35's `school.academic.*` shape (and whatever collapse PRP-11/25 settled the per-role `school.admin/teacher` maps into):

- `school.fees.heads` → `/fees/heads`
- `school.fees.plans` → `/fees/plans` (plan list + plan builder; a plan's items can be a panel or `…/plans/[feePlanId]`)
- `school.fees.adjustments` → `/fees/adjustments` (student adjustments + fine rule)

The catch-all (`app/[...slug]`) stops swallowing these once the pages exist.

⚠︎ **Assumption (master §10 O-P4 — fee-head taxonomy):** the exact head set is not finalized; heads are **school-defined** (PRP-44 models a catalog, not an enum), so the UI is a generic CRUD over whatever heads the school creates — no hardcoded head list.

### 3.2 State & services (`src/store/fees/`)

New feature folder following the house split (`{store,services,type}.ts`), mirroring `src/store/developer/` and the React-Query pattern PRP-09/35 established (a `*.queries.ts` companion is acceptable). Components **never** call `axios` directly — everything via `apiClient` + `helper.successResponse`/`helper.errorResponse` (`src/utils/helper.ts`).

- **`fees.type.ts`:** `FeeHead` (`{ id; name; code?; frequency: 'ONE_TIME' | 'RECURRING'; isOptional; isActive }`), `FeePlan` (`{ id; academicYearId; gradeId; version; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; name?; publishedAt? }`), `FeePlanItem` (`{ id; feeHeadId; amount: string; termId?; installmentNo?; dueDate? }` — **`amount` is a string**, never `number`), `FeeAdjustment` (`{ id; studentId; academicYearId; kind: 'DISCOUNT' | 'OPTIONAL_HEAD'; feeHeadId?; valueType: 'AMOUNT' | 'PERCENT'; amount: string; reason?; isActive }`), `FineRule` (`{ id; name; type: 'FLAT' | 'PER_DAY' | 'PERCENT'; amount: string; graceDays; maxAmount?; feeHeadId? }`). Payload types: `CreateFeeHeadPayload`, `CreateFeePlanPayload`, `SetFeePlanItemsPayload`, `CreateAdjustmentPayload`, `SetFineRulePayload`. Keep names aligned to PRP-44/45 response shapes so a contract change is one file (the `developer.type.ts` discipline). Response aliases via `SuccessResponse<…>` / `ErrorResponse` (`src/types/api.types.ts`).
- **`fees.services.ts`** (through `apiClient` + `helper.*`):
  - Heads: `fetchFeeHeads()`, `createFeeHead(payload)`, `updateFeeHead(id, payload)`
  - Plans: `fetchFeePlans(academicYearId)`, `getFeePlan(feePlanId)`, `createFeePlan(payload)`, `setFeePlanItems(feePlanId, payload)`, `publishFeePlan(feePlanId)`
  - Adjustments: `fetchAdjustments(studentId, academicYearId)`, `createAdjustment(studentId, payload)`, `deactivateAdjustment(id)`
  - Fine rule: `fetchFineRules()`, `setFineRule(payload)` Endpoint paths mirror PRP-44/45 (school-scoped server-side via backend PRP-12); the FE passes `academicYearId` (from PRP-35's academic store) on year-scoped calls.
- **Server state via TanStack Query** (PRP-09 boundary, as PRP-09/35 established): query keys `['fees','heads', schoolId]`, `['fees','plans', academicYearId]`, `['fees','plan', feePlanId]`, `['fees','adjustments', studentId, academicYearId]`, `['fees','fineRules', schoolId]`. Mutations `invalidateQueries` on the relevant key on success (e.g. publish invalidates `['fees','plans', academicYearId]` + `['fees','plan', id]`). Keep Zustand for any cross-cutting UI state only; the record-of-truth cache is React Query. The active `academicYearId` is **read from `src/store/academic/`** (PRP-35), not re-derived here.

### 3.3 UI modules (`src/modules/fee-setup/`)

Each screen is a module; pages under `app/(school)/fees/**` stay thin and render the module (mirroring how `schools/page.tsx` renders `SchoolList` and PRP-35's `academic/*` pages render their modules). Reuse `MainWrapper`, `DataGrid` + `GridColumn`/`GRID_COLUMN_TYPE` (incl. `CUSTOM` cells for status badges + row actions), and `Button`/`Modal`/`InputBox`/`SelectInput`/`DateInput`/`Checkbox`/`Loader` from `src/components/ui`, plus `appToast` and `cn()`. Each module gets a local `utils.ts` for grid columns/dataset mappers (mirroring `manage-school/utils.ts`); rows carry the DataGrid `_id`/`field` convention.

- **`FeeHeads.tsx`:** a `DataGrid` of heads (name, code, `frequency` via `SELECT`, `isOptional`/`isActive` flags via `CUSTOM` badge cells). "Add head" / "Edit head" `Modal` (name, code, frequency `SelectInput`, optional/active `Checkbox`). Deactivate (not delete) for heads in use — surface the backend's `409` as a toast.
- **`FeePlans.tsx` + `FeePlanBuilder.tsx`:** `FeePlans.tsx` lists plans for the active year (grade, `version`, `status` badge via `CUSTOM`, computed total) with a "Build new plan" action (pick a grade → `createFeePlan` opens a `DRAFT`). `FeePlanBuilder.tsx` (panel or `…/plans/[feePlanId]`) is the **plan-item editor**: a `DataGrid`/editable list of items — each row = a fee head (`SelectInput` from `fetchFeeHeads`), an **amount** (`InputBox`, kept as a string, basic numeric mask only — **no float math**), an optional **term/installment** (`SelectInput` sourced from PRP-35's terms for the active year), and a **due date** (`DateInput`). "Save items" calls `setFeePlanItems`; **"Publish"** (a confirm `Modal`, since publish is immutable + auto-archives the prior version — D21/D22) calls `publishFeePlan`. Published plans render **read-only** with an "Amend (new version)" action that opens a fresh `DRAFT` (clone of the prior version) — surfacing the version-bump model so the user understands history is preserved.
- **`Adjustments.tsx`:** a student picker (by admission no / name — reuses the student list once PRP-36 lands; until then an admission-no lookup field, noted as a placeholder), then that student's adjustments `DataGrid` for the active year (kind, head, value type + amount, reason, active). "Add adjustment" `Modal`: `kind` (`DISCOUNT` / `OPTIONAL_HEAD` `SelectInput`), optional `feeHead` (`SelectInput`; required + must be `isOptional` for `OPTIONAL_HEAD`), `valueType` (`AMOUNT` / `PERCENT`), `amount` (`InputBox`, string), `reason`. Deactivate (soft) per row. A separate **Fine rule** card (`type` `FLAT`/`PER_DAY`/`PERCENT`, `amount`, `graceDays`, optional `maxAmount`, optional head) editing `setFineRule`. ⚠︎ Surface that fine parameters are an open policy (O-P4) — the form is generic over the rule shape.

### 3.4 Guarding & menu

- All `fees/*` pages are Admin/Staff-scoped. Gate them with the PRP-11 route guard / `<Can>` keyed on the fee permission. ⚠︎ The permission string is owned by backend PRP-44/PRP-17 (`fees.manage`); reconcile it into the FE shared permission module (PRP-10) — do **not** hand-type a new string outside that module (the PRP-35 §3.5 discipline).
- Add a **"Fees"** section to the Admin menu via `project.menu.ts` using `APP_ROUTES` only, tagged with that permission (PRP-11's permission-tagged, sectioned nav — PRP-25). Group entries (Heads, Plans, Adjustments) under one heading; PRP-48 adds Collection/Defaulters to the same section.

## 4. Implementation steps

1. **Routes:** add the `school.fees.*` keys to `src/constants/routes.ts` (no hardcoded paths elsewhere).
2. **Types:** add `src/store/fees/fees.type.ts` with the entities + payloads from §3.2, aligned to PRP-44/45 shapes; **all money fields typed as `string`**.
3. **Services:** add `src/store/fees/fees.services.ts` (heads/plans/items/publish/adjustments/fine-rule) through `apiClient` + `helper.*`.
4. **Query layer:** add `src/store/fees/fees.store.ts` (cross-cutting UI state only) + TanStack Query hooks (inline or `fees.queries.ts`) with the §3.2 keys; mutations invalidate on success; read `academicYearId` from `src/store/academic/` (PRP-35).
5. **Pages (thin):** add `app/(school)/fees/{heads,plans,adjustments}/page.tsx`, each rendering its module (+ optional `app/(school)/fees/plans/[feePlanId]/page.tsx` for the builder).
6. **Modules:** add `src/modules/fee-setup/{FeeHeads,FeePlans,FeePlanBuilder,Adjustments}.tsx` (+ per-screen `utils.ts` for grid columns/dataset mappers). Build create/edit/publish `Modal`s with the UI primitives; status badges + row actions via `GRID_COLUMN_TYPE.CUSTOM`.
7. **Menu + guard:** add the "Fees" section to `project.menu.ts` (via `APP_ROUTES`, permission-tagged per PRP-11) and apply the PRP-11 Admin guard to the new pages.

## 5. Files added / changed

- **Add:** `src/store/fees/fees.type.ts`, `src/store/fees/fees.services.ts`, `src/store/fees/fees.store.ts` (+ optional `fees.queries.ts`); `src/modules/fee-setup/FeeHeads.tsx`, `FeePlans.tsx`, `FeePlanBuilder.tsx`, `Adjustments.tsx` (+ per-screen `utils.ts`); `src/app/(school)/fees/heads/page.tsx`, `.../plans/page.tsx`, `.../plans/[feePlanId]/page.tsx`, `.../adjustments/page.tsx`
- **Edit:** `src/constants/routes.ts` (new `school.fees.*` keys), `src/constants/project.menu.ts` (Fees section). _(The `fees.manage` permission string is reconciled in the PRP-10 shared permission module — treat that edit as PRP-10/11's, to keep the contract single-sourced.)_

## 6. Acceptance criteria

- [ ] An Admin can create/edit **fee heads** (school-defined; frequency + optional flag); a head in use cannot be deleted (surface the backend `409`).
- [ ] An Admin can build a **per-class plan** for the active year — add items (head / amount / term-installment / due date), save the draft, and **publish** it (confirm modal); publishing makes it read-only.
- [ ] Amending a published plan opens a **new version** draft (history preserved — D21/D22); the prior version remains visible/read-only.
- [ ] An Admin can record a student **adjustment** (discount or optional-head opt-in; amount or percent) and edit the **fine rule**; `OPTIONAL_HEAD` requires an optional head (form-validated + backend-validated).
- [ ] **No money value is computed in JS** — amounts are entered/displayed as strings and totals come from the backend (Decimal discipline, D1).
- [ ] All lists use `DataGrid`; create/edit use `Modal` + UI primitives; no page calls `axios` directly (all via `store/fees/*.services.ts` + TanStack Query); routes only from `APP_ROUTES`; classes via `cn()`; responses via `helper.*`; the active `academicYearId` is read from PRP-35's academic store.

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Manual (against backend PRP-44/45): create heads → build a Class 1 / active-year plan with term installments + due dates → publish → confirm read-only + a v2 amend flow; add a 25% sibling discount + a transport opt-in to a student; set the fine rule. Confirm a non-Admin cannot reach `/fees/*` (PRP-11 guard; server authoritative via PRP-12/44).

## 8. Risks & rollback

- **Money as strings (paramount):** the FE must never parse amounts to `number` and re-sum — display backend-provided strings/totals verbatim (D1; mirrors backend PRP-44/45/46 Decimal discipline). Inputs are string-masked only. Lint/review for any `Number(amount)` / float arithmetic on rupee values.
- **API shape coupling:** depends on PRP-44/45 response envelopes — land after them or stub services behind a flag. Keep all shapes in `fees.type.ts` so a contract change is one-file (the `developer.type.ts`/PRP-35 discipline).
- **Publish/version UX:** publish is irreversible + auto-archives the prior version (backend); the confirm modal + the "Amend = new version" affordance must make that legible so an Admin doesn't think they're editing in place. Invalidate `['fees','plans', academicYearId]` after publish so the status badge can't go stale.
- **Permission-string drift:** the fee permission must come from the PRP-10 shared module (mirroring PRP-44/17) — do not hand-type a key. ⚠︎ Open until O-P4/PRP-44 fixes the string.
- **Year-scope correctness:** every plan/adjustment read/write passes the active `academicYearId` from PRP-35's store; a stale year would show the wrong plan — reconcile on year switch (invalidate the year-keyed queries).
- **Student picker dependency:** `Adjustments.tsx` needs a student list (PRP-36); until then use an admission-no lookup (documented placeholder) so this PRP isn't blocked.
- **Rollback:** fully additive (new store/modules/pages + route keys + one menu section); revert and the catch-all reclaims `/fees/*`. Do not revert shared `routes.ts`/RBAC changes PRP-48 also depends on.
