# PRP-13 — Forms + validation stack + password policy

> **Status:** Proposed · **Phase:** 4 · **Severity:** 🟠 Med · **Size:** M **Addresses:** CC1, CC2, LG1, RG2, RG3 · **Depends on:** none (do before more forms are added)

## 1. Problem / current state

- **CC1:** no form library — `react-hook-form` and `zod` are not installed. `Login.tsx` and `SetPassword.tsx` hand-roll `useState` + ad-hoc checks. Every future form (students, staff, fees…) will repeat this.
- **LG1:** `Login.tsx` initializes an `error` state and passes it to both `InputBox`es (`:15`, `:133`, `:148`), but `handleLogin` only ever calls `setError('')` + toast — inline field errors are wired but **never displayed**.
- **RG2/RG3:** `SetPassword.tsx:106-110` claims a policy (upper/lower/number/symbol) that neither FE (non-empty + match only) nor BE (`isValidPassword`, length ≥ 8) enforces; the strength meter (`:29-34`) is length-only.

## 2. Goal & non-goals

- **Goal:** a shared form stack (`react-hook-form` + `zod`), a single password policy enforced FE+BE, and Login/SetPassword refactored onto it with real inline + server-error surfacing.
- **Non-goals:** redesigning every existing screen — establish the pattern + convert the two auth forms.

## 3. Target design

- **`useZodForm`** wrapper around `react-hook-form` + `zodResolver`; a thin `<Form>`/field-binding helper around the existing `InputBox`/`Button` primitives.
- **Shared schemas** in `src/lib/validation/` (e.g. `loginSchema`, `passwordPolicy`). `passwordPolicy` is the single source; the backend mirrors it (SB11 — update `isValidPassword` + `setPasswordRouteSchema`).
- **Server errors** mapped onto form fields/root via `setError` (fixes LG1).

## 4. Implementation steps

1. `yarn add react-hook-form zod @hookform/resolvers`.
2. Add `src/lib/validation/` with `passwordPolicy` (zod; the real rule — e.g. length + character classes, or integrate `zxcvbn`) and `loginSchema`.
3. Add `src/lib/forms/useZodForm.ts` + minimal field bindings for `InputBox`.
4. Refactor `Login.tsx` onto `useZodForm(loginSchema)`; surface root server errors (LG1) instead of only toasting.
5. Refactor `SetPassword.tsx` onto the password schema; drive the strength meter from the real policy (RG3); show per-rule feedback matching the left-panel copy (RG2).
6. **Backend counterpart (SB11):** update `isValidPassword` (`auth.utils.ts:24`) + `setPasswordRouteSchema` to match `passwordPolicy`. Track in the backend repo.

## 5. Files added / changed

- **Add:** `src/lib/validation/*`, `src/lib/forms/useZodForm.ts`
- **Edit:** `src/modules/auth/Login.tsx`, `src/modules/auth/SetPassword.tsx`, `package.json`
- **Backend:** `src/modules/auth/auth.utils.ts`, `auth.schema.ts` (mirror policy)

## 6. Acceptance criteria

- [ ] Login shows inline/root errors (server + client), not just toasts (LG1).
- [ ] The password policy advertised in the UI is exactly what FE and BE enforce (RG2).
- [ ] Strength meter reflects the real policy (RG3).
- [ ] `useZodForm` is documented as the pattern for future forms.

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Manual: bad login → inline error; weak password → rejected with the stated reason on both FE and BE.

## 8. Risks & rollback

- Keep the policy decision aligned with the backend in the same change window.
- Rollback: revert; the hand-rolled forms return.
