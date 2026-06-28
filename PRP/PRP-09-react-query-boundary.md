# PRP-09 — Zustand ↔ React Query boundary

> **Status:** Proposed (partially mitigated — `SchoolList` already on a hybrid `useQuery`; scoped to formalizing it + removing the redundant store cache) · **Phase:** 2 · **Severity:** 🔴 High · **Size:** S–M **Addresses:** ST1, ST2, ST3, ST4 · **Depends on:** PRP-07 (reset hooks into queryClient)

## 1. Problem / current state

React Query is installed and configured (`src/lib/providers.tsx`), and `SchoolList.tsx:9-12` **already wraps the fetch in `useQuery`** — but as a **hybrid**: the `queryFn` just calls the store action `fetchSchools()`, and the component still reads data from `src/store/developer/developer.store.ts`, which hand-rolls a **server cache** (`schoolsById`, `schoolIds`, `isFetchingSchools`, `hasFetchedSchools`). So React Query owns loading while Zustand owns the data — the worst of both, and every future feature store will copy it. `src/store/ui.store.ts` and `src/store/notification.store.ts` are **empty stubs** that also break the `store/<feature>/{store,services,type}` convention. `helper.successResponse` casts unknown shapes (`utils/helper.ts:39`). **(ST1–ST4)**

> Note: `cn()` (`src/lib/cn.ts`) is a plain `filter(Boolean).join(' ')` — **no clsx / tailwind-merge** — so any seed test for it (PRP-74) scopes only to join + falsy-filtering semantics, not class de-duplication/merging.

## 2. Goal & non-goals

- **Goal:** a written, enforced boundary — server data via React Query; session/UI/global via Zustand — with `developer.schools` migrated as the reference implementation. **This PRP owns and formalizes the React-Query ↔ store boundary pattern that all P2+ feature PRPs (e.g. PRP-22/24/26) mirror.** Note the existing `SchoolList` hybrid is a **half-migration** (RQ owns loading, Zustand still owns the data) — it is the thing being fixed, **not** the template to copy.
- **Non-goals:** rewriting auth (it's correctly Zustand session state).

## 3. Target design

- **Rule (documented in `PRP/README.md` + a short `src/store/README.md`):** _Remote/server data → React Query hooks in `src/store/<feature>/<feature>.queries.ts`. Client/session/UI state → Zustand in `<feature>.store.ts`._
- **Query keys factory** per feature; typed `useXxxQuery`/`useXxxMutation`; loading/error/refetch come from React Query (no manual flags).
- Services (`*.services.ts`) stay as the axios layer the query hooks call.

## 4. Implementation steps

1. Add `src/store/developer/developer.queries.ts`: `developerKeys` factory + `useSchoolsQuery()` calling `developerService.fetchSchools()`, normalizing via `helper.successResponse`. Select to `{ schoolsById, schoolIds }` in the query's `select` if the normalized shape is still wanted.
2. Repoint `src/modules/developer/manage-school/SchoolList.tsx` from its inline `useQuery({ queryKey: ['schools'], queryFn: fetchSchools })` to `useSchoolsQuery()` (read data from the query, not the store); then delete `fetchSchools`/`schoolsById`/`schoolIds`/`isFetchingSchools`/`hasFetchedSchools` from `developer.store.ts` (the flags are already dead — `SchoolList` uses `useQuery`'s `isLoading`). Remove the store if nothing genuine remains.
3. Resolve the stubs: implement `ui.store.ts` for real UI state (mobile drawer currently in `layouts/default.tsx` local state, theme, etc.) or delete; same for `notification.store.ts`.
4. Tighten `helper.successResponse` (`utils/helper.ts`) to stop the `?? (response.data as T)` fallback or validate the envelope.
5. Add `src/store/README.md` stating the rule + the queryKeys pattern.

## 5. Files added / changed

- **Add:** `src/store/developer/developer.queries.ts`, `src/store/README.md`
- **Edit:** `src/modules/developer/manage-school/SchoolList.tsx`, `src/store/developer/developer.store.ts`, `src/store/ui.store.ts`, `src/store/notification.store.ts`, `src/utils/helper.ts`

## 6. Acceptance criteria

- [ ] Schools list is fetched/cached/invalidated by React Query; no manual `hasFetched`/`isFetching`.
- [ ] No empty store stubs remain.
- [ ] The Zustand-vs-RQ rule is documented and `developer` is the template to copy.

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Manual: schools list loads, caches across navigation, refetches on invalidation; Devtools shows the query.

## 8. Risks & rollback

- Scope creep into auth — explicitly leave auth on Zustand. Rollback: revert; the manual store returns.
