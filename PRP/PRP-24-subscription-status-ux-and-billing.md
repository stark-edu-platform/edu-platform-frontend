# PRP-24 — Subscription status UX & billing page

> **Status:** Proposed · **Phase:** 1 · **Severity:** 🔴 High · **Size:** M **Addresses:** P1-FE-4 (master-prp §7.2.4, decisions D4/D5) · **Depends on:** backend PRP-15 (subscription/trial model + `request.subscriptionState` + enforcement) · **Pairs with:** PRP-10 (`activeSchoolId`), PRP-11 (guards), PRP-25 (Admin landing)

## 1. Problem / current state

The frontend has **no concept of subscription state**. There is no provider reading the active school's subscription, no trial-countdown / grace / read-only / locked banner, no gating of write-UI, and no billing page. The `(school)` layout (`src/app/(school)/layout.tsx` → `DefaultLayout`) renders the same chrome regardless of whether the school is TRIALING, in GRACE, READ_ONLY, or LOCKED. `src/store/notification.store.ts` and `src/store/ui.store.ts` are empty stubs, so there's no banner channel.

Backend PRP-15 computes effective access per request (`computeEffectiveAccess` → `request.subscriptionState = { status, writable, banner }`) and enforces writes server-side via `requireWritableSchool`, with a **fail-safe allow-list** so the Admin can always reach billing even when LOCKED (D5). The frontend must mirror this for UX: surface the state, gate write affordances client-side (UX only — server is authoritative), and provide a billing/renew page that **stays reachable** in every state.

## 2. Goal & non-goals

- **Goal:** a **subscription-state provider** that reads the active school's subscription (from `fetchMe`/a dedicated endpoint per PRP-15), state-aware **banners** (trial countdown, grace, read-only, locked), a `useSubscription()`/`useIsWritable()` hook + a `<WriteGate>`/`disabled`-prop pattern to gate write-UI when read-only/locked, and an **Admin billing/renew page that is always reachable** (never gated by the read-only/locked state).
- **Non-goals:** online payment (D7 — billing v1 shows status + records intent / "contact to renew"; the gateway is P7); the SuperAdmin subscription management (PRP-22); backend enforcement (PRP-15). Per-route server gating is PRP-15; this PRP is the client UX layer over it.

## 3. Target design

### 3.1 Where subscription state comes from

Per PRP-15, the active school's effective state is request-scoped server-side. The frontend needs a read of it tied to the **active school** (PRP-10's `activeSchoolId`). Two compatible sources, coordinate with PRP-15:

- the `GET /auth/me` payload's per-school entry can carry a `subscription`/`subscriptionState` summary (PRP-10 already types `user.schools` as `UserSchool[]`), and/or
- a dedicated `GET /schools/:id/subscription` (or `/billing/subscription`) returning `{ status, writable, banner, trialEndsAt, currentPeriodEnd, graceUntil, seatCount }`. Use the `/auth/me` summary for the banner/gate (cheap, already fetched) and the dedicated endpoint for the billing page detail. Add the read to `store/subscription/*.services.ts`.

### 3.2 State & services (`src/store/subscription/`)

- `subscription.type.ts`: `SubscriptionStatus` union (`TRIALING | ACTIVE | GRACE | READ_ONLY | LOCKED | CANCELLED`, mirroring PRP-15), `SubscriptionState = { status; writable; banner; trialEndsAt?; currentPeriodEnd?; graceUntil?; seatCount? }`.
- `subscription.services.ts`: `fetchSubscription(schoolId)` → GET the dedicated endpoint, normalized via `helper.*`.
- Server state via TanStack Query (`['subscription', schoolId]`); the provider reads it. Avoid a parallel Zustand cache (PRP-09 boundary) — derive everything from the query + the `activeSchoolId`.

### 3.3 Subscription provider + hooks (`src/components/providers/subscription-provider.tsx`)

- A client provider mounted inside the authenticated `(school)` subtree (in `app/(school)/layout.tsx` / `DefaultLayout`) that resolves the active school (PRP-10) and exposes context: `{ state, isWritable, isTrial, daysLeft, isLocked, isReadOnly }`. `daysLeft` is computed from `trialEndsAt`/`currentPeriodEnd` in UTC (mirror PRP-15's clock note — no off-by-one).
- `useSubscription()` and `useIsWritable()` hooks reading the context.
- A `<WriteGate>` component and/or a `disabledWhenReadOnly` helper: write controls (Buttons that mutate) consult `useIsWritable()` and render disabled-with-tooltip when not writable, pointing the user to billing. This complements — never replaces — server enforcement (PRP-15).

### 3.4 Banners (`src/components/subscription/SubscriptionBanner.tsx`)

A single banner component driven by `state.status`, rendered at the top of the `(school)` content area:

- **TRIALING:** info banner "Trial — N days left" (countdown); a "Manage billing" link.
- **GRACE:** warning banner "Your subscription has lapsed — renew within the grace period" (writable still true).
- **READ_ONLY:** strong warning "Read-only: renew to restore editing"; pairs with `<WriteGate>` disabling writes.
- **LOCKED:** blocking banner "Account locked — renew to regain access"; most nav still renders but writes are gated and the only meaningful action is billing. Use a minimal banner slot in `ui.store.ts` (currently empty) or render directly off the provider context — prefer the provider (less global state). Style with theme tokens + `cn()`; reuse `Icon`.

### 3.5 Billing page — always reachable (`src/app/(school)/billing/`)

- Add `school.billing` → `/billing` to `APP_ROUTES` and a page `app/(school)/billing/page.tsx` rendering `src/modules/billing/BillingScreen.tsx`.
- **Crucially, the billing route is NOT write-gated**: it must render and function in READ_ONLY/LOCKED states (mirroring PRP-15's allow-list, D5). Ensure the PRP-11 route guard / any write-gate does **not** block `/billing`; only Admins (permission `school.manage_billing`, owner-gated per PRP-17) see it, but its reachability is independent of subscription state.
- `BillingScreen.tsx`: shows current plan/cadence, trial/period dates, seat count, status, and a renew CTA. v1 renew is **not** an online payment (D7): it surfaces the amount/cadence and a "request renewal / mark intent" action or contact path (coordinate the exact v1 action with PRP-15's invoice model — invoices are SuperAdmin-marked-paid in v1). Show past invoices if PRP-15 exposes them.
- The "Manage billing" links in the banners route here.

### 3.6 Guarding interaction (with PRP-11)

- The write-gate is **advisory UX**; the server (PRP-15 `requireWritableSchool`) is authoritative. Document this in the module.
- Billing must be exempt from the read-only/locked gate but still permission-gated to Admins (PRP-11 `<Can>`/route guard with `school.manage_billing`).

## 4. Implementation steps

1. **Routes:** add `school.billing` to `src/constants/routes.ts`.
2. **Types/service:** add `src/store/subscription/{type,services}.ts` (`SubscriptionState`, `fetchSubscription`), normalized via `helper.*`.
3. **Provider/hooks:** add `src/components/providers/subscription-provider.tsx` exposing the context + `useSubscription`/`useIsWritable`; resolve `activeSchoolId` from PRP-10. Mount it in `app/(school)/layout.tsx` (wrapping `DefaultLayout`'s content) so all school pages share it.
4. **Banner:** add `src/components/subscription/SubscriptionBanner.tsx`; render it at the top of the `(school)` content region (in `DefaultLayout` main, or the layout).
5. **Write-gate:** add `src/components/subscription/WriteGate.tsx` (+ a `useIsWritable` consumer); apply it to mutating controls as they appear (P1 mostly establishes the pattern; later phases consume it). Provide a `Button`-friendly disabled+tooltip variant.
6. **Billing page/module:** add `app/(school)/billing/page.tsx` + `src/modules/billing/BillingScreen.tsx`; wire the renew CTA per PRP-15's v1 contract. Ensure no write-gate/route-guard blocks `/billing` in READ_ONLY/LOCKED.
7. **Menu:** add a "Billing" entry (permission `school.manage_billing`) to the Admin menu via `project.menu.ts` (PRP-11 tagged config, `APP_ROUTES` only).

## 5. Files added / changed

- **Add:** `src/store/subscription/subscription.type.ts`, `src/store/subscription/subscription.services.ts`, `src/components/providers/subscription-provider.tsx`, `src/components/subscription/SubscriptionBanner.tsx`, `src/components/subscription/WriteGate.tsx`, `src/app/(school)/billing/page.tsx`, `src/modules/billing/BillingScreen.tsx`
- **Edit:** `src/constants/routes.ts`, `src/app/(school)/layout.tsx`, `src/layouts/default.tsx` (banner slot), `src/constants/project.menu.ts` (Billing entry), optionally `src/store/ui.store.ts` (only if a global banner slot is chosen over context)

## 6. Acceptance criteria

- [ ] A TRIALING school shows a trial-countdown banner with the correct days-left (UTC math); GRACE/READ_ONLY/LOCKED each show their distinct banner.
- [ ] When the school is READ_ONLY or LOCKED, write controls using `<WriteGate>`/`useIsWritable()` render disabled and point the user to billing (UX only; server still enforces).
- [ ] The Admin billing page renders and functions in **every** subscription state, including LOCKED (never write-gated), and is permission-gated to Admins.
- [ ] Subscription state is read through `store/subscription/*.services.ts` + TanStack Query keyed by the active school; no direct axios calls and no parallel Zustand cache.
- [ ] Banner "Manage billing" links route to `/billing` via `APP_ROUTES`.

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Manual (against PRP-15): activate a school with a short trial → see the countdown; backdate `trialEndsAt` server-side → see GRACE then READ_ONLY banners and disabled write controls; force LOCKED → confirm `/billing` still loads while other writes are gated.

## 8. Risks & rollback

- **Source-of-truth coupling:** the exact subscription read (in `/auth/me` vs a dedicated endpoint) must be agreed with PRP-15; keep the shape in `subscription.type.ts`.
- **Fail-safe (D5):** the billing route must never be caught by the write-gate or a permission/route guard that depends on subscription state — verify by test in LOCKED state. This mirrors PRP-15's allow-list risk note; a bug here strands the Admin.
- **Client gating is not security:** writes must remain enforced server-side (PRP-15); the FE gate is convenience only — note this in the module.
- Rollback: provider/banner/gate are additive; revert to render without subscription awareness. Keep `routes.ts` `billing` entry if PRP-25/26 reference it.
