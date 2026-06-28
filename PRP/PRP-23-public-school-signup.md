# PRP-23 — Public school sign-up & pending states

> **Status:** Proposed · **Phase:** 1 · **Severity:** 🟠 Med · **Size:** M **Addresses:** P1-FE-2 (master-prp §7.2.2, decision D6) · **Depends on:** backend PRP-16 (`POST /api/schools/request` + `PENDING` lifecycle) · **Pairs with:** PRP-13 (forms + validation stack), PRP-24 (subscription UX)

## 1. Problem / current state

There is **no public onboarding path**. Schools today are created only by a DEVELOPER; the only unauthenticated screens are `src/app/(auth)/login/page.tsx` and `src/app/(auth)/set-password/page.tsx`. `src/proxy.ts` redirects any unauthenticated visitor on a protected path to `/login`, and `/` to `/login` — there is no "sign up your school" route, no request form, and no "awaiting activation" screen.

Decision D6 (and backend PRP-16) define the flow: a **public** `POST /api/schools/request` creates a `PENDING` school + an `INACTIVE` owner-admin with an **inactive** `UserSchool(ADMIN)`, sends **no invite**, mints **no tokens**, and returns a neutral acknowledgement. The school is unusable until the SuperAdmin activates it (which then fires the setup-password invite — handled in PRP-22 console / existing set-password flow). So the frontend needs: a public request form, an "awaiting activation" confirmation, and graceful handling of anyone whose school is still `PENDING` (they have no session, so this is mostly about messaging on the login/auth surface).

## 2. Goal & non-goals

- **Goal:** a public "Sign up your school" form in the `(auth)` group that posts to `POST /api/schools/request` through a new `store/school/` service, an "awaiting activation" success screen, and clear handling of the PENDING state (a login attempt for a not-yet-active school shows an informative message rather than a generic error).
- **Non-goals:** the SuperAdmin activation UI (PRP-22); the setup-password screen (already exists at `(auth)/set-password` and is triggered post-activation by the backend invite); subscription banners/billing (PRP-24); installing the forms stack (PRP-13) — this PRP uses whatever validation approach PRP-13 standardizes, falling back to the existing controlled-input pattern (`Login.tsx`) if PRP-13 hasn't landed.

## 3. Target design

### 3.1 Routes (`src/constants/routes.ts`)

Add public auth routes (strings only here):

- `signup` → `/signup` (or `/register-school`) — the request form
- `signupPending` → `/signup/pending` — the awaiting-activation acknowledgement Both sit in the `(auth)` route group (no sidebar). Update `src/proxy.ts`'s `isPublicPath` so these are reachable without a `refreshToken` cookie, and do not redirect them.

### 3.2 State & service (`src/store/school/`)

New feature folder mirroring the house split (the school is not yet a tenant the user belongs to, so this is a standalone public service, not part of `store/auth`):

- `school.services.ts`: `requestSchool(payload)` → `apiClient.post('/schools/request', payload)`, normalized via `helper.successResponse`/`helper.errorResponse`. Because the endpoint returns a **neutral acknowledgement** (no ids), the service resolves to a success/message only.
- `school.type.ts`: `SchoolRequestPayload` = the school + prospective-owner fields the backend `createSchoolWithAdmin` field set expects (school name, subdomain, board, school email/phone; admin name, email, phone). Keep field names aligned with PRP-16's request body.
- `school.store.ts`: optional — a thin submit-status store, or skip Zustand and drive the form locally with a TanStack Query `useMutation` (preferred per PRP-09 for a one-shot server write). Use a `useMutation` keyed action so the form gets `isPending`/error states for free.

### 3.3 UI module (`src/modules/school-signup/`)

- `SignupSchool.tsx`: the public form, styled to match `Login.tsx` (left marketing panel + right form card, reusing `EduPlatformLogo`, `InputBox`, `SelectInput` for board, `Button`, `appToast`, `cn()`). Validate required fields + email/subdomain format (via PRP-13's stack if present). On submit, call `requestSchool`; on success, `router.push(APP_ROUTES.signupPending)`; on a duplicate-subdomain/email error (PRP-16 maps `P2002`), surface a field-level message. Rate-limited server-side (PRP-01) — surface a friendly "too many attempts" message on `429`.
- `SignupPending.tsx`: a calm confirmation screen — "Your school request has been received and is awaiting approval. You'll get an email to set your password once it's activated." A link back to `/login`. No ids or status are shown (neutral ack, D6).
- A small "Sign up your school" link added to `Login.tsx` (and optionally a CTA on `/`).

### 3.4 PENDING login handling

A pre-activation school has **no usable session** (no invite, no tokens — PRP-16 §3.2), so a user can't log in. The realistic UX is on the login surface: if the backend returns a specific "school pending activation"/inactive-account error on `POST /auth/login`, `Login.tsx` shows an informative message ("Your school is awaiting activation — you'll be emailed when it's ready.") instead of the generic "Unable to sign in." Key on the backend's error code/message (coordinate the string with PRP-16/auth) rather than guessing. No redirect to a gated area is possible because there is no token.

## 4. Implementation steps

1. **Routes:** add `signup` + `signupPending` to `APP_ROUTES` (`src/constants/routes.ts`).
2. **Proxy:** update `src/proxy.ts` `isPublicPath` to include the new routes (and add them to `config.matcher` only if you want the middleware to actively allow-through; otherwise leaving them off the matcher already makes them public — verify against the existing matcher list).
3. **Service/state:** add `src/store/school/{services,type}.ts` (+ optional `store.ts`) with `requestSchool` and `SchoolRequestPayload`, normalized via `helper.*`.
4. **Form module:** add `src/modules/school-signup/SignupSchool.tsx` + `SignupPending.tsx` (+ a local `utils.ts` for board options / copy), reusing UI primitives and matching the `Login.tsx` layout idiom.
5. **Pages (thin):** add `src/app/(auth)/signup/page.tsx` → renders `SignupSchool`; `src/app/(auth)/signup/pending/page.tsx` → renders `SignupPending`. Wrap in `<Suspense>` like the set-password page if any client hooks need it.
6. **Login link + error handling:** add the "Sign up your school" link to `Login.tsx`; extend its error branch to recognize the PENDING/inactive-account response and show the tailored message.

## 5. Files added / changed

- **Add:** `src/store/school/school.services.ts`, `src/store/school/school.type.ts` (optional `school.store.ts`), `src/modules/school-signup/SignupSchool.tsx`, `src/modules/school-signup/SignupPending.tsx`, `src/modules/school-signup/utils.ts`, `src/app/(auth)/signup/page.tsx`, `src/app/(auth)/signup/pending/page.tsx`
- **Edit:** `src/constants/routes.ts`, `src/proxy.ts`, `src/modules/auth/Login.tsx`

## 6. Acceptance criteria

- [ ] An unauthenticated visitor can reach `/signup`, fill the form, and submit; the proxy does not bounce them to `/login`.
- [ ] A successful request posts to `POST /api/schools/request` (through `store/school/*.services.ts`, not a direct axios call) and routes to the "awaiting activation" screen, which shows a neutral acknowledgement (no ids/status).
- [ ] Duplicate subdomain/email and `429` rate-limit responses produce clear, field- or form-level messages.
- [ ] A login attempt for a still-`PENDING` school shows an informative "awaiting activation" message rather than a generic failure.
- [ ] No hardcoded paths (routes from `APP_ROUTES`); classes via `cn()`; responses via `helper.*`.

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Manual (against backend PRP-16): submit `/signup` → confirm a `PENDING` school is created and the pending screen shows; attempt to log in as the pending admin → confirm the tailored message; re-submit the same subdomain → confirm the duplicate message.

## 8. Risks & rollback

- **Field-set contract:** the form payload must match PRP-16's `/schools/request` body — coordinate field names; keep them in `school.type.ts` so a change is one-file.
- **Public-route exposure:** double-check `proxy.ts` so the new routes are genuinely public and don't accidentally widen access to gated paths.
- **PENDING error string:** the login message depends on the backend's error contract for inactive/pending accounts — agree the code/message with PRP-16/auth; degrade to the generic message if absent.
- Rollback: fully additive (new routes/pages/service + a link and one error branch in `Login.tsx`); revert without affecting existing auth.
