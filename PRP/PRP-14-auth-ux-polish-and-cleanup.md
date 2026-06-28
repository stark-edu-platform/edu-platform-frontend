# PRP-14 — Auth UX polish + dead-code cleanup

> **Status:** Proposed (still current; RG4 scope corrected to a cross-component rename — see §1) · **Phase:** 4 · **Severity:** 🟡 Low · **Size:** S–M **Addresses:** LG3, LG4, LG5, RG4, RG5, RG6, SF9, CC3, CC4, CC5, CC6 · **Depends on:** PRP-06 (LG5 also needs backend SB8)

## 1. Problem / current state

A cluster of low-risk correctness/polish/hygiene items (see the report for each):

- **LG3** "Keep me signed in" checkbox (`Login.tsx:153`) is not wired to anything.
- **LG4** leftover dev copy shipped in the UI: _"Real authentication still needs to be connected for this screen."_ (`Login.tsx:169`).
- **LG5** login makes 2 round-trips (`login` + `/me`, `auth.store.ts:47`) — removable once backend **SB8** returns `schools` on login.
- **RG4** `reaponsive` is the actual (mis-spelled) prop **name** on the shared `Button` component — declared in `Button.tsx:63/79/109`, flagged as a known typo in `components/ui/component.md:86`, and used in `SetPassword.tsx:165` (verified still present 2026-06-28). Fixing it is a **cross-component rename**, not a one-line edit.
- **RG5** setup token travels in the URL query — acceptable for email links; consider a one-time exchange to avoid referer/log leakage.
- **RG6** no "resend invite"/expiry-recovery path when a setup token is invalid/expired.
- **SF9** frontend env is unvalidated; `NEXT_PUBLIC_API_BASE_URL` falls back to `''` (`config/env.ts:9`).
- **CC3** dead code: `types/session.types.ts` (`RoleAssignment`/`UserDetails`), unused parts of `routes.ts`, possibly unused deps.
- **CC4** status handling mixes `constants.API_STATUS` / axios status / envelope.
- **CC5** no global error boundary / unified API-error UX.
- **CC6** no test framework configured.

## 2. Goal & non-goals

- **Goal:** clear the polish backlog; add the safety nets (env validation, error boundary, test setup).
- **Non-goals:** large refactors (covered by PRP-06/09/10/13).

## 3. Implementation steps (independent; can be separate small PRs)

1. **LG3:** wire "Keep me signed in" to a remembered-session preference (or remove it). If kept, it can influence refresh-TTL selection (coordinate with backend cookie maxAge).
2. **LG4:** delete the placeholder copy block in `Login.tsx`.
3. **LG5:** once backend SB8 lands, set `user` from the login response and drop the extra `fetchMe()` in `onLogin`.
4. **RG4:** rename the `Button` prop `reaponsive` → `responsive` at its declaration (`Button.tsx:63/79/109`) + className logic, update `components/ui/component.md:86`, and fix every call site (`SetPassword.tsx:165` + any others — `grep -rn reaponsive src/`). Mechanical but spans the shared component.
5. **RG5/RG6:** add a "request a new link" affordance on the invalid/expired-token state in `SetPassword.tsx`; (optional) move to a one-time token exchange.
6. **SF9:** validate env at module load in `config/env.ts` (zod), throwing on missing required vars.
7. **CC3:** remove dead `session.types.ts`/`routes.ts` exports (after PRP-10/11 settle what's used); prune unused deps.
8. **CC4:** standardize on the envelope + HTTP status; retire ad-hoc `constants.API_STATUS` comparisons in components.
9. **CC5:** add an app-level error boundary + a React Query global `onError` for unified API-error toasts.
10. **CC6:** _framework setup is owned by [PRP-74](./Tests/PRP-74-frontend-test-harness.md)_ — once that harness lands, add the specific unit tests here (`resolveRedirect`, `deriveAbilities`); a Playwright login → dashboard → logout smoke test remains a follow-on.

## 4. Files added / changed

- **Edit:** `Login.tsx`, `SetPassword.tsx`, `auth.store.ts`, `config/env.ts`, `types/session.types.ts`, `constants/routes.ts`, components using `API_STATUS`
- **Add:** error boundary, test config (`vitest.config.ts`, a `playwright/` smoke test)

## 5. Acceptance criteria

- [ ] No placeholder/dev copy or dead "keep me signed in" control in the login UI.
- [ ] Login is a single round-trip (post-SB8).
- [ ] App boots with a clear error if required `NEXT_PUBLIC_*` vars are missing.
- [ ] A global error boundary + unified API-error toast exist.
- [ ] At least the auth-flow smoke test and the two pure-function unit tests run in CI.

## 6. Validation

- `yarn type-check && yarn lint && yarn check && yarn build`
- `yarn test` (new) green; manual pass over login/set-password screens.

## 7. Risks & rollback

- Each item is independent and low-risk; land them as small PRs. Defer LG5 until SB8 is deployed.
