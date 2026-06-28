# PRP-74 — Frontend unit/component-test harness (Vitest + React Testing Library)

> **Status:** Proposed · **Phase:** 0 (tooling) · **Severity:** 🟠 Med · **Size:** S–M **Addresses:** missing test runner (CC6 in PRP-14; `CLAUDE.md`: "no test framework") · **Depends on:** none · **Unblocks:** unit tests referenced by PRP-06 (`resolveRedirect`), PRP-10 (`deriveAbilities`) · **Owns:** the test-framework setup half of PRP-14/CC6 (which now only contributes specific tests)

## 1. Problem / current state

The frontend has **no test runner** (verified 2026-06-28): `package.json` has only dev/build/lint/type-check/format/check — no `test` script, no `vitest`/`jest`/`@testing-library`/`playwright`, no config, no test files. PRP-14/CC6 _proposed_ adding Vitest + Playwright but nothing exists, and several PRPs' Validation steps assume a unit runner (`resolveRedirect` PRP-06, `deriveAbilities` PRP-10).

## 2. Goal & non-goals

- **Goal:** a working `yarn test` (+ `test:watch`, `test:coverage`) running **Vitest + React Testing Library** in a **jsdom** environment, with the `@/` path alias resolving (as Next does), `jest-dom` matchers, and green seed tests against existing code (a pure util + a component render).
- **Non-goals:** Playwright/E2E (a separate follow-on — App Router pages, `proxy.ts` middleware, and full flows belong there), testing Server Components/RSC, and CI wiring.

## 3. Target design

- **Stack (devDeps):** `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `vite-tsconfig-paths`.
- **`vitest.config.ts`:** `plugins: [react(), tsconfigPaths()]`, `test.environment: 'jsdom'`, `globals: true`, `setupFiles: ['./vitest.setup.ts']`, `include: ['src/**/*.test.{ts,tsx}']`, `coverage: { provider: 'v8' }`. (`tsconfigPaths` makes the `@/…` alias resolve exactly as Next's `tsconfig` defines it.)
- **`vitest.setup.ts`:** `import '@testing-library/jest-dom'` + triple-slash `/// <reference types="vitest/globals" />` and `.../jest-dom` refs (so TS sees the globals without a `tsconfig` `types` array narrowing Next's auto-included globals — see step 6) + a reusable `next/navigation` mock (`useRouter`/`usePathname`) for components that navigate.
- **Scope:** pure functions (`cn`, `helper.successResponse`/`errorResponse`, later `deriveAbilities`/`resolveRedirect`) and **client** components/UI primitives via RTL. Full page/route + middleware → Playwright (follow-on).

## 4. Implementation steps

1. `yarn add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event vite-tsconfig-paths`.
2. Add `vitest.config.ts` (react + tsconfigPaths plugins, jsdom env, setupFiles, include, coverage).
3. Add `vitest.setup.ts` importing `@testing-library/jest-dom`; export a `mockNextNavigation()` helper.
4. Add scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:coverage": "vitest run --coverage"`.
5. **Seed tests against existing code** (green immediately):
   - `src/lib/cn.test.ts` — `cn()` join + falsy-filtering only (`filter(Boolean).join(' ')`); **no class de-duplication/merge** to assert, since `cn` uses neither clsx nor tailwind-merge.
   - `src/components/ui/Button.test.tsx` — renders label, fires `onClick`, respects `disabled` (RTL + `user-event`).
6. Make the Vitest/jest-dom globals visible to TS **without breaking Next's auto-included globals**: adding a `types` array to `tsconfig.json` _narrows_ the global types Next would otherwise auto-include, so prefer either (a) `globals: true` in the Vitest config + a triple-slash `/// <reference types="vitest/globals" />` (and `.../jest-dom`) in `vitest.setup.ts`, or (b) if you do add a `types` array, include `node` and the Next globals alongside `vitest/globals` + `@testing-library/jest-dom` so nothing Next relies on is dropped. Add `coverage/` to `.gitignore`.
7. Document the RTL + `next/navigation`-mock pattern in `PRP/Tests/README.md` as the template; PRP-14/CC6 then keeps only the specific tests, not the setup.

## 5. Files added / changed

- **Add:** `vitest.config.ts`, `vitest.setup.ts`, `src/lib/cn.test.ts`, `src/components/ui/Button.test.tsx`
- **Edit:** `package.json` (devDeps + scripts), `.gitignore`; `tsconfig.json` **only if** taking the `types`-array route (step 6) — the preferred route keeps globals in `vitest.setup.ts` via triple-slash refs and leaves `tsconfig` untouched

## 6. Acceptance criteria

- [ ] `yarn test` runs Vitest and is **green** with a pure-function test + a component (RTL) test against existing code.
- [ ] The `@/…` alias resolves in tests (matches Next).
- [ ] `@testing-library/jest-dom` matchers (`toBeInTheDocument`, …) work.
- [ ] A component using `next/navigation` is testable via the router mock.
- [ ] `yarn test:coverage` emits a report; `coverage/` is git-ignored; `yarn type-check` still passes.

## 7. Validation

- `yarn test` · `yarn test:coverage` green; `yarn type-check` unaffected.

## 8. Risks & follow-ons

- **App Router / RSC limits:** Vitest covers client components + pure logic; Server Components, `proxy.ts` middleware, and full flows need **Playwright** (the E2E half PRP-14/CC6 hinted at) — a follow-on.
- **React 19 + RTL:** pin a `@testing-library/react` version compatible with React 19.
- **Overlap with PRP-14:** that PRP's CC6 "add a test framework" is now owned here; it keeps only the `resolveRedirect`/`deriveAbilities` tests once those land.
- Follow-ons: Playwright E2E, CI wiring, coverage thresholds.
