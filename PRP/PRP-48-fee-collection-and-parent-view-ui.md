# PRP-48 — Fee collection UI + parent fee/dues view

> **Status:** Proposed · **Phase:** 4 · **Severity:** 🔴 High · **Size:** L **Depends on:** backend PRP-46 (manual payments + receipt PDFs + defaulter reports/reminders + the `/api/parent/fees` view), backend PRP-41 (parent portal APIs — multi-child aggregation the parent view rides on); FE PRP-10 (abilities / `activeSchoolId`), PRP-11 (permission menu + route guards), PRP-47 (fee-setup UI — shares `src/store/fees/` + the published plans/dues this screen settles), PRP-35 (active `academicYearId` from `src/store/academic/`) · **Pairs with:** PRP-43 (parent portal web shell — the parent fee view is a section within it), PRP-25 (role landing + merged nav)

## 1. Problem / current state

PRP-47 lets an Admin _configure_ fees, but there is **no surface to take money, issue a receipt, chase defaulters, or let a parent see what they owe**. Today the only parent-facing fee path is the catch-all "page not built yet" (`app/[...slug]/page.tsx`), and there is no front-desk collection screen.

Backend PRP-46 introduces `Payment` (cash/cheque/manual), `PaymentAllocation`, `Receipt` (sequential number + **server-generated PDF**), a materialized `StudentFee` ledger, **defaulter reports + reminders**, and a parent fee view (`GET /api/parent/fees`, scoped to the parent's own children via PRP-41). This PRP builds two web surfaces on top: a **staff fee-collection** area (record payment → download receipt → view dues/ledger → defaulters → send reminders) under `(school)`, and a **parent fee/dues view** (each child's plan, dues, payments, downloadable receipts) within the parent portal (PRP-43). **All amounts are rendered verbatim from the backend (strings); the FE never does rupee math** (D1 / PRP-46 Decimal discipline).

## 2. Goal & non-goals

- **Goal:** (a) a staff **Fee collection** area consuming PRP-46: a student dues/ledger view, a **record-payment** flow (method cash/cheque/transfer, amount, reference, optional allocation), **receipt download** (the server PDF), a **defaulters** report (by class/section/year, as-of date) and a **send-reminders** action; (b) a **parent fee view** that lists each child's dues/plan/payments and lets the parent download receipts. All via the `src/store/fees/` layer (extended from PRP-47) + a `src/store/parent/` (or PRP-43's parent store) for the aggregated view + TanStack Query; lists use `DataGrid`; routes from `APP_ROUTES`.
- **Non-goals:** fee configuration (heads/plans/adjustments/fine rule — PRP-47); the backend (PRP-46/41); **online payment / gateway checkout** (P7/PRP-62, OUT of scope per D7 — the parent view is read-only + receipt download, no "Pay now"); the parent-portal _shell/dashboard_ itself (PRP-43 — this PRP contributes the fee section into it); the notification engine (P6); the RBAC/menu primitives (PRP-10/11).

## 3. Target design

### 3.1 Routes (`src/constants/routes.ts`)

Add the collection + parent fee keys (strings live **only** here):

- `school.fees.collection` → `/fees/collection` (student lookup → dues/ledger → record payment)
- `school.fees.defaulters` → `/fees/defaulters`
- Parent: `parent.fees` → `/parent/fees` (or the equivalent under PRP-43's parent route group — use whatever shape PRP-43/PRP-11 settle the parent area into; do not hardcode).

The catch-all stops swallowing these once the pages exist.

### 3.2 State & services (extend `src/store/fees/`; add parent aggregation)

Extend PRP-47's `src/store/fees/` and follow the house split + React-Query pattern (PRP-22/35/47). Components never call `axios` directly — all via `apiClient` + `helper.successResponse`/`helper.errorResponse`.

- **`fees.type.ts` (extend):** `Payment` (`{ id; studentId; amount: string; method: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'DD' | 'OTHER'; status: 'COMPLETED' | 'PENDING' | 'VOID'; reference?; paidOn; receiptNo? }`), `StudentLedger` (`{ lines: DuesLine[]; totals: { netDue: string; paid: string; outstanding: string } }` with `DuesLine = { feeHeadId; label; dueAmount: string; paidAmount: string; netDue: string; termId?; dueDate?; isPaid }`), `DefaulterRow` (`{ studentId; admissionNo; name; gradeId; sectionId; outstanding: string }`), `Receipt` (`{ id; receiptNo; paymentId; pdfUrl? }`), and for the parent view `ChildFees = { studentId; name; admissionNo; ledger: StudentLedger; payments: Payment[]; receipts: Receipt[] }`. **All money fields are `string`.** Payloads: `RecordPaymentPayload` (`{ studentId; academicYearId; amount: string; method; reference?; paidOn?; allocations? }`), `SendRemindersPayload`.
- **`fees.services.ts` (extend):**
  - `fetchStudentLedger(studentId, academicYearId)` GET `/school/students/:id/ledger`
  - `recordPayment(payload)` POST `/school/payments`
  - `voidPayment(paymentId, reason)` POST `/school/payments/:id/void`
  - `fetchReceiptPdfUrl(receiptId)` GET `/school/receipts/:id/pdf` (returns a signed URL or a blob to download)
  - `fetchDefaulters(params)` GET `/school/fees/defaulters?academicYearId=&gradeId=&sectionId=&asOf=`
  - `sendReminders(payload)` POST `/school/fees/reminders`
  - Parent: `fetchParentFees(academicYearId)` GET `/parent/fees` (PRP-41 — own children only, server-scoped)
- **TanStack Query keys:** `['fees','ledger', studentId, academicYearId]`, `['fees','defaulters', params]`, `['parent','fees', academicYearId]`. `recordPayment`/`voidPayment` mutations `invalidateQueries(['fees','ledger', studentId, …])` (+ defaulters) on success so the dues table updates without a manual refresh. Active `academicYearId` is read from `src/store/academic/` (PRP-35).

### 3.3 UI modules (`src/modules/fee-collection/` + parent fee section)

Pages under `app/(school)/fees/**` and the parent area stay thin and render modules (mirroring `SchoolList`/PRP-47). Reuse `MainWrapper`, `DataGrid` + `GRID_COLUMN_TYPE` (incl. `CUSTOM` for status badges, the "Download receipt" action, and the outstanding/paid columns), `Button`/`Modal`/`InputBox`/`SelectInput`/`DateInput`/`Loader`, `appToast`, and `cn()`. Per-screen `utils.ts` for columns/mappers.

- **`FeeCollection.tsx`:** a **student lookup** (admission no / name — reuse PRP-36's student list when present; until then admission-no field, documented placeholder) → renders the student's **dues/ledger** (`DataGrid` of `DuesLine`s: head, due, paid, outstanding, due date, paid badge; totals row) with a **"Record payment"** button.
- **`RecordPaymentModal.tsx`:** a `Modal` form — `amount` (`InputBox`, string), `method` (`SelectInput`), `reference` (cheque/txn no, shown when method ≠ cash), `paidOn` (`DateInput`, default today), optional **allocation** (advanced: split across outstanding lines; default oldest-due-first server-side, so the simple path just enters a total). On submit → `recordPayment`; on success → `appToast.success`, **auto-download/open the receipt PDF** (`fetchReceiptPdfUrl`), and invalidate the ledger query. Surface a non-writable-school `403/402` (PRP-15) and validation errors as toasts.
- **`PaymentHistory.tsx`** (panel within collection): the student's `Payment`s (`DataGrid`: date, amount, method, status badge, receipt-download action, **Void** action for a mistake — confirm `Modal`, calls `voidPayment`; labelled clearly as a correction, **not a refund**, per PRP-46/O-P4 ⚠︎).
- **`Defaulters.tsx`:** filters (grade/section `SelectInput` from PRP-35's academic store, `asOf` `DateInput`) → a `DataGrid` of `DefaulterRow`s (admission no, name, class/section, outstanding) with row + bulk selection and a **"Send reminders"** action (`sendReminders`, confirm `Modal`, toast the queued count). Reminders ride the backend's email skeleton in v1 (multi-channel is P6).
- **Parent fee view — `ParentFees.tsx`:** for each child (from `fetchParentFees`) a card/section: child name + class, a **dues `DataGrid`** (`DuesLine`s + outstanding total), a **payments list** with **downloadable receipts**, and a clear **outstanding** figure. **Read-only** — explicitly **no "Pay now"** (online payment is P7/PRP-62; surface a "contact the school office" / offline note instead). Renders within PRP-43's parent portal shell (a section/tab), not a standalone layout.

### 3.4 Guarding & menu

- **Collection/defaulters** pages are Admin/Staff-scoped (front desk) — gate with the PRP-11 guard / `<Can>` keyed on the **collection** permission (backend `fees.collect`) for record/void/reminders and `fees.read` for views. ⚠︎ Strings owned by backend PRP-46/PRP-17; reconcile into the PRP-10 shared permission module — do not hand-type (PRP-35/47 discipline).
- The **parent fee view** is gated by the parent role (PRP-10/11) and is server-scoped to own children (PRP-41) — FE gating is UX only; the server is authoritative.
- Add **Collection** + **Defaulters** to the existing "Fees" Admin menu section (created in PRP-47) via `project.menu.ts` using `APP_ROUTES`, permission-tagged (PRP-11/25). Add the parent **Fees** entry to the parent nav (PRP-43/25).

## 4. Implementation steps

1. **Routes:** add `school.fees.collection`, `school.fees.defaulters`, and `parent.fees` keys to `src/constants/routes.ts` (no hardcoded paths elsewhere).
2. **Types:** extend `src/store/fees/fees.type.ts` with `Payment`/`StudentLedger`/`DuesLine`/`DefaulterRow`/`Receipt`/`ChildFees` + payloads (§3.2); **all money fields `string`**.
3. **Services:** extend `src/store/fees/fees.services.ts` with `fetchStudentLedger`/`recordPayment`/`voidPayment`/`fetchReceiptPdfUrl`/`fetchDefaulters`/`sendReminders`, and add `fetchParentFees` (parent store or PRP-43's `src/store/parent/`), all through `apiClient` + `helper.*`.
4. **Query layer:** add the §3.2 hooks/keys; record/void mutations invalidate the ledger (+ defaulters) on success; read `academicYearId` from PRP-35's academic store.
5. **Pages (thin):** add `app/(school)/fees/collection/page.tsx`, `.../defaulters/page.tsx`, and the parent fee page (under PRP-43's parent route group), each rendering its module.
6. **Modules:** add `src/modules/fee-collection/{FeeCollection,RecordPaymentModal,PaymentHistory,Defaulters}.tsx` (+ `utils.ts`) and the parent `ParentFees.tsx` (in the parent feature folder PRP-43 establishes). Receipt download wires `fetchReceiptPdfUrl` → open/save the PDF.
7. **Menu + guard:** extend the "Fees" menu section with Collection + Defaulters and add the parent Fees entry (via `APP_ROUTES`, permission/role-tagged per PRP-11); apply the PRP-11 guards (staff for collection, parent for the view).

## 5. Files added / changed

- **Add:** `src/modules/fee-collection/FeeCollection.tsx`, `RecordPaymentModal.tsx`, `PaymentHistory.tsx`, `Defaulters.tsx` (+ per-screen `utils.ts`); `src/modules/parent/ParentFees.tsx` (or the parent feature folder from PRP-43); `src/app/(school)/fees/collection/page.tsx`, `.../fees/defaulters/page.tsx`, and the parent fee page; optional `src/store/parent/` (or extend PRP-43's)
- **Edit:** `src/store/fees/fees.type.ts` (+ `fees.services.ts`, query layer) — extend PRP-47's; `src/constants/routes.ts` (collection/defaulters/parent keys), `src/constants/project.menu.ts` (extend the Fees section + parent nav). _(The `fees.collect`/`fees.read` permission strings are reconciled in the PRP-10 shared module — PRP-10/11's edit, single-sourced.)_

## 6. Acceptance criteria

- [ ] A staff user can look up a student, see their **dues/ledger** (lines + outstanding total), and **record a payment** (cash or cheque, amount, reference); on success the **receipt PDF downloads** and the ledger updates without a manual refresh.
- [ ] A cheque payment can be recorded `PENDING`; a recorded payment can be **voided** (confirm modal, labelled a correction, **not a refund**) and the ledger restores.
- [ ] The **defaulters** report lists unpaid students for a class/section/year as-of a date with outstanding totals, and **send-reminders** queues guardian notifications (toasts the count).
- [ ] A **parent** sees **only their own children's** fees: per-child dues, payments, and **downloadable receipts**; the view is **read-only** with **no online-payment action** (P7 deferred).
- [ ] **No money value is computed in JS** — all amounts/totals are backend strings shown verbatim (D1).
- [ ] All lists use `DataGrid`; payment/void use `Modal`; no page calls `axios` directly (all via the `store/fees` + parent services + TanStack Query); routes only from `APP_ROUTES`; classes via `cn()`; responses via `helper.*`; active `academicYearId` from PRP-35's store.

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Manual (against backend PRP-46/41 + a PRP-47 published plan): look up a student → record a cash payment → receipt PDF opens, dues drop; record + void a cheque and confirm the ledger restores; pull defaulters for a section and send reminders; log in as a parent → `/parent/fees` shows each child's dues + downloadable receipts and **no Pay-now button**.

## 8. Risks & rollback

- **Money as strings (paramount):** never parse amounts to `number`/sum in JS — display backend strings/totals verbatim (D1; PRP-46 Decimal discipline). Review for any `Number(amount)` on rupee values; the record-payment input is a string mask only.
- **Receipt PDF handling:** the PDF is server-generated (PRP-46) and may be a signed URL or a streamed blob — handle both (open in a new tab / trigger a download) and tolerate a brief "generating" state (PRP-46 may produce the PDF lazily); never reconstruct a receipt client-side.
- **Void ≠ refund:** the void action must be unmistakably a _correction_ (not money-back) — copy + confirm modal; online refunds are P7 (O-P4 ⚠︎). Don't imply a refund anywhere in the UI.
- **Parent scope is server-enforced:** the parent view trusts PRP-41's own-children scoping — never send or accept a client `studentId` that could widen it; FE gating is UX only.
- **Cache freshness:** record/void must invalidate `['fees','ledger', studentId, …]` (+ defaulters) so dues/defaulter lists can't go stale after collection.
- **Cross-PRP coupling:** depends on PRP-46/41 envelopes and PRP-47's `src/store/fees/` + PRP-43's parent shell — land after them or stub behind a flag; keep all shapes in `fees.type.ts` so a contract change is one file.
- **No online payment (D7):** the parent view is deliberately read-only; resist adding a checkout affordance until P7/PRP-62.
- **Rollback:** additive (new modules/pages + extended store + route keys + menu entries); revert and the catch-all reclaims `/fees/collection`, `/fees/defaulters`, `/parent/fees`. Do not revert shared `routes.ts`/RBAC changes.
