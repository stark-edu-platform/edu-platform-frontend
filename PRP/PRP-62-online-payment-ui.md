# PRP-62 — Online payment UI (parent checkout) + admin gateway-config screen

> **Status:** Proposed · **Phase:** 7 · **Severity:** 🔴 High · **Size:** L **Depends on:** backend PRP-61 (`SchoolPaymentGateway` config CRUD, `POST /school/fees/checkout/intent` + `/checkout/verify`, signed webhooks/reconciliation into the PRP-46 ledger, `Refund`, reconciliation report — this PRP is the web client over those endpoints); FE PRP-48 (fee-collection + parent fee view — this PRP **upgrades PRP-48's deliberately read-only parent fee view by adding the "Pay now" affordance**, and extends the same `src/store/fees/`), PRP-47 (fee-setup UI — shares `src/store/fees/`), PRP-43 (parent portal web shell — the parent checkout lives inside it), PRP-24 (`<WriteGate>` / subscription banner — a checkout is a write), PRP-10 (`deriveAbilities` / `activeSchoolId`), PRP-11 (permission menu + `<Can>` / route guards), PRP-35 (active `academicYearId`) · **Pairs with:** mobile PRP-60 (the **mobile** checkout reuses the _same_ PRP-61 intent/verify endpoints — see §3.6)

## 1. Problem / current state

PRP-48 gave parents a **read-only** fee/dues view and explicitly **withheld** a "Pay now" button — its non-goals say "no online payment / gateway checkout (P7/PRP-62)" and the parent view tells the user to contact the school office. There is also **no admin screen to configure the school's payment gateway** (the per-school Razorpay keys / enablement from PRP-61's `SchoolPaymentGateway`). Today the only way money is recorded is the staff manual-collection flow (PRP-48) and the parent simply sees what they owe.

Backend PRP-61 now exposes: an **admin gateway-config** surface (store keys — secrets write-only, enable/disable, test credentials, reconciliation report) and a **parent checkout** surface (create a payment intent for the parent's **own** child → pay via the provider SDK → verify → the webhook reconciles into the PRP-46 `Payment`/`Receipt` ledger). This PRP builds two web surfaces: (a) the **parent online-payment flow** added into the PRP-48 parent fee view (now: dues → **Pay now** → provider checkout → success + downloadable receipt), and (b) the **admin "Online payments / Gateway" config screen**. **All amounts remain backend strings rendered verbatim — the FE never does rupee math** (D1 / PRP-46 Decimal discipline); the amount charged is computed **server-side** by PRP-61 (the client never sends an amount it computed).

> ⚠︎ **O-P7 (master §10) flows through to the UI.** **Razorpay is assumed** (PRP-61); the checkout uses Razorpay's Checkout SDK, but the integration is isolated behind a thin `useCheckout()` / provider-launch seam (§3.4) so a different provider is a swap, not a rewrite. Per-school **KYC/onboarding is done by the school directly with the gateway** (PRP-61 / D7) — the admin screen only collects the resulting keys + a help link; it is **not** a KYC wizard. **Settlement** (gateway → school bank) is shown read-only via PRP-61's reconciliation report; the platform never holds funds, so there is no "payout" UI.

## 2. Goal & non-goals

- **Goal:** (a) extend the **parent fee view** (PRP-48 `ParentFees`) with a **Pay now** action per child / per outstanding selection that creates an intent (PRP-61), launches the provider checkout, verifies on return, and on success shows confirmation + **downloads the receipt PDF** (the same PRP-46 receipt, now produced for an online payment) and refreshes dues; (b) an **admin gateway-config** screen to set the provider keys (secrets write-only — never displayed), **test credentials**, toggle **enabled**, and view a **reconciliation report** (online payments + refunds with gateway references, plus a **refund** action mirroring PRP-61). All via the `src/store/fees/` layer (extended from PRP-47/48) + TanStack Query; lists use `DataGrid`; routes from `APP_ROUTES`.
- **Non-goals:** the backend (PRP-61); manual collection / void / defaulters (PRP-48 — unchanged; this is the _online_ path); the fee model/config (PRP-44/45/47); the parent-portal _shell_ (PRP-43 — this contributes the pay flow into it); the **mobile** checkout screens (mobile PRP-60 — but the **endpoint contract + `useCheckout` shape are shared**, §3.6); the notification engine (P6); RBAC/menu primitives (PRP-10/11). **No client-side rupee math and no client-computed amount** — the intent amount is authoritative from PRP-61.

## 3. Target design

### 3.1 Routes (`src/constants/routes.ts`)

Add the keys (strings live **only** here):

- `school.fees.gateway` → `/fees/gateway` (admin gateway config + reconciliation) — Admin/owner.
- Parent checkout has **no new top-level route** — it is an action/modal **within** PRP-48's `parent.fees` view (or PRP-43's parent route group). A `school.fees.checkout.return` callback route is added **only if** the chosen provider requires a redirect return URL (Razorpay Checkout is a modal/in-page handler and typically does not — document which path the provider uses; prefer the no-redirect handler).

### 3.2 State & services (extend `src/store/fees/`)

Extend PRP-47/48's `src/store/fees/`; follow the house split + React-Query pattern. Components never call `axios` directly — all via `apiClient` + `helper.successResponse`/`helper.errorResponse`.

- **`fees.type.ts` (extend):**
  - `GatewayConfig = { provider: 'RAZORPAY'; mode: 'LIVE' | 'TEST'; keyId: string; isEnabled: boolean; accountLabel?: string; lastVerifiedAt?: string; hasSecret: boolean }` — **note: no secret field is ever read back** (PRP-61 never returns secrets; `hasSecret` is a presence flag). The save payload `GatewayConfigPayload` carries `keyId` + write-only `keySecret`/`webhookSecret` + `mode`/`accountLabel`.
  - `CheckoutIntent = { intentId: string; providerOrderId: string; keyId: string; amount: string; currency: 'INR'; studentName: string }` — **`amount` is a string** computed server-side (PRP-61); the client renders it but never recomputes it.
  - `CheckoutResult` (provider handshake: `{ providerPaymentId; signature; intentId }` passed to verify), `RefundPayload = { paymentId; amount?: string; reason? }`, `ReconciliationRow = { paymentId; providerPaymentId?; amount: string; status: string; refunded?: string; capturedAt?: string }`.
- **`fees.services.ts` (extend):**
  - `fetchGatewayConfig()` GET `/school/fees/gateway` (public fields only)
  - `saveGatewayConfig(payload)` POST `/school/fees/gateway` (secrets write-only)
  - `setGatewayEnabled(enabled)` PATCH `/school/fees/gateway/enable`
  - `testGatewayCredentials()` POST `/school/fees/gateway/test`
  - `createCheckoutIntent({ studentId, academicYearId, allocations? })` POST `/school/fees/checkout/intent` — **no `amount` in the payload** (server computes it)
  - `verifyCheckout(result)` POST `/school/fees/checkout/verify`
  - `createRefund(payload)` POST `/school/fees/refunds`
  - `fetchReconciliation(params)` GET `/school/fees/reconciliation?from=&to=`
  - (receipt download reuses PRP-48's `fetchReceiptPdfUrl`)
- **TanStack Query keys:** `['fees','gateway']`, `['fees','reconciliation', params]`; reuse PRP-48's `['parent','fees', academicYearId]` and `['fees','ledger', studentId, academicYearId]`. After a **successful verify**, invalidate `['parent','fees', …]` (+ the child ledger) so dues update without a manual refresh. A **refund** invalidates reconciliation (+ the relevant ledger). Active `academicYearId` from PRP-35's academic store.

### 3.3 Parent checkout UI (extend `src/modules/parent/ParentFees.tsx` from PRP-48)

The parent fee view stays inside PRP-43's parent shell; PRP-48 rendered each child's dues + payments + downloadable receipts **read-only**. This PRP adds the pay affordance, **gated on the gateway being enabled** for the school (if `!gateway.isEnabled`, keep PRP-48's read-only "contact the office" copy — do not show a dead button):

- A **"Pay now"** `Button` per child (and optionally per selected outstanding lines, default = full outstanding, mirroring PRP-61's server-side oldest-due-first). It is a **write** action → wrap in PRP-24's `<WriteGate>` (a READ_ONLY/LOCKED school can't transact).
- **`PayFeesModal.tsx`** (new): shows the child + the **server-quoted amount** (from `createCheckoutIntent` — rendered verbatim, never summed in JS), a confirm, then launches the provider checkout via `useCheckout()` (§3.4). On the provider's success handshake → `verifyCheckout(result)`; on success → `appToast.success`, **auto-open/download the receipt PDF** (`fetchReceiptPdfUrl`), invalidate the parent-fees + ledger queries, and show a confirmation state. Handle: user-cancelled checkout (no error toast, just close), provider failure (toast + "try again"), and a **pending** state (the sync verify may lag the webhook — show "confirming…", and since the webhook is authoritative per PRP-61, a refresh will reflect it). Surface a non-writable `403/402` (PRP-24) and validation errors as toasts.
- Copy is explicit that this pays the **school** (not the platform) — consistent with the funds-flow model (PRP-61 §3.2); never imply the platform collects the money.

### 3.4 Provider checkout seam (`src/lib/checkout/` or `src/hooks/useCheckout.ts`)

Isolate the provider SDK so O-P7 stays a swap:

- A `useCheckout()` hook (or `launchCheckout(provider, { orderId, keyId, amount, name, prefill }) → Promise<CheckoutResult>`) that, for `RAZORPAY`, lazily loads the **Razorpay Checkout script** and opens the handler with the order id + the school's **public `keyId`** (never a secret — secrets live only on the backend, PRP-61 §3.5). It resolves with `{ providerPaymentId, signature, intentId }` on success and rejects/cancels cleanly.
- **CSP / script-loading note:** the Razorpay checkout script is an **external** script (`checkout.razorpay.com`) — coordinate the app's `Content-Security-Policy`/`script-src` to allow it (the only external script the app loads). Document this as the one CSP exception; everything else stays first-party.
- The provider name comes from `fetchGatewayConfig().provider`, so a future provider is a new branch in this one file — no checkout logic leaks into `ParentFees`/the modal.

### 3.5 Admin gateway-config UI (`src/modules/fee-gateway/`)

Pages under `app/(school)/fees/gateway/**` stay thin and render modules (mirroring PRP-47/48). Reuse `MainWrapper`, `DataGrid` + `GRID_COLUMN_TYPE`, `Button`/`Modal`/`InputBox`/`SelectInput`/`DateInput`/`Loader`, `appToast`, `cn()`.

- **`GatewayConfig.tsx`:** a form — `provider` (`SelectInput`, Razorpay default/only for now), `mode` (LIVE/TEST), `keyId` (`InputBox`), **`keySecret`/`webhookSecret`** (`InputBox` `type="password"`, **write-only** — placeholder shows "•••• set" via `hasSecret` when one exists; submitting blank leaves it unchanged; the value is **never** read back), `accountLabel`, and a **help link** to the gateway's KYC/onboarding (the school does KYC **with the gateway directly** — this is not a KYC wizard, O-P7). A **"Test credentials"** button (`testGatewayCredentials`) shows pass/fail + `lastVerifiedAt`. An **Enabled** toggle (`setGatewayEnabled`) that PRP-61 only allows after a successful test — reflect that (disable the toggle until verified, surface the backend error otherwise).
- **`ReconciliationReport.tsx`:** date-range filter (`DateInput` from/to) → a `DataGrid` of `ReconciliationRow` (gateway payment id, amount, status badge, refunded, captured-at), with a **Refund** row action → **`RefundModal.tsx`** (amount default full / optional partial as a string, reason; calls `createRefund`; confirm `Modal`). Refund copy must read as a **real money-back refund** to the parent's source — **distinct from PRP-48's "Void = correction, not a refund"** (PRP-46/PRP-61 keep these separate; do not conflate the two in the UI).
- Both screens are Admin/owner-only.

### 3.6 Mobile reuse note (mobile PRP-60 — same backend contract)

The **mobile** parent checkout (PRP-60, RN app) consumes the **identical** PRP-61 endpoints (`/school/fees/checkout/intent` → Razorpay's **React Native** checkout SDK → `/school/fees/checkout/verify`) with the same server-computed amount, same own-child scoping (PRP-41), and the same webhook-authoritative reconciliation. **Keep the contract in `fees.type.ts` (`CheckoutIntent`/`CheckoutResult`) as the shared shape** so web and mobile agree; the only difference is the **launch seam** (§3.4 web Checkout script vs. RN `react-native-razorpay`). This PRP owns the **web** UI; PRP-60 owns the RN screens but reuses these types and endpoints verbatim. Mobile auth uses the body-token path (PRP-19) — orthogonal to checkout.

### 3.7 Guarding & menu

- **Gateway config + reconciliation + refunds** → gate with the PRP-11 guard / `<Can>` keyed on backend **`fees.gateway`** (Admin/owner). **Parent Pay now** → keyed on **`fees.pay`** (PARENT) and server-scoped to own children (PRP-41) — FE gating is UX only; the server is authoritative. ⚠︎ Strings owned by backend PRP-61/PRP-17; reconcile into the PRP-10 shared permission module — **do not hand-type** (PRP-47/48 discipline).
- Add an **"Online payments"** entry (→ `school.fees.gateway`, `fees.gateway`-tagged) to the existing "Fees" Admin menu section (PRP-47/48) via `project.menu.ts` using `APP_ROUTES`. The parent Pay-now needs no menu entry (it's in the fee view).
- A checkout is a **write** — wrap Pay now in `<WriteGate>` (PRP-24); a refund likewise.

## 4. Implementation steps

1. **Routes:** add `school.fees.gateway` (and a `checkout.return` key only if the provider needs a redirect) to `src/constants/routes.ts`.
2. **Types:** extend `src/store/fees/fees.type.ts` with `GatewayConfig`/`GatewayConfigPayload`/`CheckoutIntent`/`CheckoutResult`/`RefundPayload`/`ReconciliationRow` (§3.2); **all money fields `string`**, **no secret read-back field**, **no client `amount` on the intent payload**.
3. **Services:** extend `src/store/fees/fees.services.ts` with `fetchGatewayConfig`/`saveGatewayConfig`/`setGatewayEnabled`/`testGatewayCredentials`/`createCheckoutIntent`/`verifyCheckout`/`createRefund`/`fetchReconciliation`, all through `apiClient` + `helper.*`.
4. **Query layer:** add the §3.2 hooks/keys; verify invalidates parent-fees (+ child ledger); refund invalidates reconciliation; read `academicYearId` from PRP-35.
5. **Checkout seam:** add `src/hooks/useCheckout.ts` (or `src/lib/checkout/`) wrapping the Razorpay Checkout script lazily, behind a provider switch; document the CSP `script-src` exception.
6. **Parent flow:** extend `src/modules/parent/ParentFees.tsx` (PRP-48) — add **Pay now** (gated on `gateway.isEnabled` + `<WriteGate>`) and add **`PayFeesModal.tsx`** (intent → launch → verify → receipt download → invalidate). Keep PRP-48's read-only fallback when the gateway is off.
7. **Admin screens:** add `app/(school)/fees/gateway/page.tsx` + `src/modules/fee-gateway/{GatewayConfig,ReconciliationReport,RefundModal}.tsx` (+ `utils.ts` for columns/mappers). Secrets are write-only inputs; Enabled toggle reflects the verified gate.
8. **Menu + guard:** add the "Online payments" entry to the Fees section (`APP_ROUTES`, `fees.gateway`-tagged per PRP-11); apply the PRP-11 guards (`fees.gateway` for admin screens, `fees.pay` for Pay now).

## 5. Files added / changed

- **Add:** `src/modules/parent/PayFeesModal.tsx`; `src/modules/fee-gateway/GatewayConfig.tsx`, `ReconciliationReport.tsx`, `RefundModal.tsx` (+ `utils.ts`); `src/app/(school)/fees/gateway/page.tsx`; `src/hooks/useCheckout.ts` (or `src/lib/checkout/index.ts`)
- **Edit:** `src/modules/parent/ParentFees.tsx` (PRP-48 — add Pay now, gated); `src/store/fees/fees.type.ts` (+ `fees.services.ts`, query layer) — extend PRP-47/48's; `src/constants/routes.ts` (gateway key); `src/constants/project.menu.ts` (Fees-section "Online payments" entry). _(The `fees.gateway`/`fees.pay` permission strings are reconciled in the PRP-10 shared module — PRP-10/11's edit, single-sourced.)_ CSP/`script-src` config wherever Next sets headers (only if the provider script needs allow-listing).

## 6. Acceptance criteria

- [ ] When the school's gateway is **enabled**, a parent sees **Pay now** in the fee view; it creates an intent (PRP-61), shows the **server-quoted amount verbatim** (no JS sum), launches the provider checkout with the **public `keyId` only**, and on success verifies, **downloads the receipt PDF**, and the dues update without a manual refresh. When the gateway is **disabled**, the view stays PRP-48's read-only "contact the office" (no dead button).
- [ ] The checkout is wrapped in `<WriteGate>` — a READ_ONLY/LOCKED school cannot transact (UX gate; server still enforces). A cancelled checkout closes cleanly; a provider failure toasts and lets the user retry; a webhook-lag "confirming…" state resolves on refresh.
- [ ] The admin gateway screen saves `keyId` + **write-only** secrets (secrets are **never displayed or read back**; a set secret shows as masked/present), runs **Test credentials**, and the **Enabled** toggle only succeeds after a passing test (backend-enforced; reflected in the UI).
- [ ] The reconciliation report lists online payments + refunds with gateway references; a **Refund** (full or partial, string amount) is issued via PRP-61 and is clearly labelled a **real money-back refund** — **distinct** from PRP-48's void-is-a-correction.
- [ ] **No money value is computed in JS** — the intent amount and all totals are backend strings shown verbatim (D1); the intent payload carries **no client-computed amount**.
- [ ] All lists use `DataGrid`; checkout/refund/config use `Modal`/forms; no page calls `axios` directly (all via `store/fees` + TanStack Query); routes only from `APP_ROUTES`; classes via `cn()`; responses via `helper.*`; `academicYearId` from PRP-35's store; permission strings reconciled (not hand-typed).
- [ ] The mobile checkout (PRP-60) reuses the same `CheckoutIntent`/`CheckoutResult` types + intent/verify endpoints (contract single-sourced in `fees.type.ts`).

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Manual (against backend PRP-61 in Razorpay **test mode** + a PRP-47 plan / PRP-48 dues): as an Admin, configure test keys → Test passes → enable; as a parent, open the fee view → **Pay now** → pay with a test card → receipt PDF opens, dues drop, a confirmation shows; cancel a checkout (no error); as Admin, open the reconciliation report → see the payment → issue a partial refund → it shows refunded and the ledger reflects it. Confirm the secret inputs never echo a stored value and disabling the gateway hides Pay now.

## 8. Risks & rollback

- **O-P7 (provider) ⚠︎:** Razorpay is assumed; keep the SDK behind `useCheckout()` (§3.4) and the public-fields-only `GatewayConfig` type so a provider change is one seam + one type, not a UI rewrite. KYC is the school's job with the gateway (not a wizard here); settlement is read-only (no payout UI).
- **Secrets are write-only (paramount):** the gateway secret/webhook-secret must **never** be fetched or rendered — PRP-61 doesn't return them; the form treats them as set-once write-only inputs (`hasSecret` presence only). Review for any code path that would surface a secret. Only the **public `keyId`** is used client-side (in the checkout launch).
- **No client-computed amount / no rupee math (paramount):** the amount is computed **server-side** by PRP-61 and rendered verbatim; the intent payload sends **no** amount, and totals are never summed in JS (D1; PRP-46 Decimal discipline). Review for any `Number(amount)` on rupee values.
- **Webhook is authoritative (PRP-61):** the sync verify is a UX fast-path; treat the success state as **provisional** until reconciled (a "confirming…"/refresh path), because PRP-61's webhook is the real ledger event and may lag/precede the callback. Never reconstruct a receipt or a "paid" state client-side.
- **Refund vs. void copy:** this PRP's refund is real money-back (PRP-61's `Refund`); PRP-48's void is a correction. Keep the UI copy unmistakably distinct to avoid a compliance/expectation mix-up.
- **Funds-flow framing:** the UI must convey the parent is paying the **school** (per-school gateway, D7) — never imply the platform collects/holds the money.
- **CSP / external script:** the provider checkout script is the lone external `script-src` — allow-list it deliberately and keep everything else first-party (don't loosen CSP broadly).
- **Parent scope is server-enforced (PRP-41):** never send/accept a client `studentId` that could widen scope; FE gating is UX only.
- **Cross-PRP coupling:** depends on PRP-61's envelopes + PRP-48's parent view + PRP-43's shell + PRP-24's `<WriteGate>` — land after them or stub behind a flag; keep all shapes in `fees.type.ts` so a contract change is one file (and shared with mobile PRP-60).
- **Rollback:** additive (new modal/admin modules/pages + extended store + a route key + one menu entry + the checkout seam); revert and the parent view falls back to PRP-48's read-only state and the gateway screen disappears. Do not revert shared `routes.ts`/RBAC/`fees.type.ts` changes that mobile (PRP-60) also relies on.
