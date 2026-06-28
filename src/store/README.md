# Store conventions — Zustand vs React Query

This folder holds **client-side state**. The boundary is strict (formalized in PRP-09):

| Kind of state | Where it lives | Examples |
| --- | --- | --- |
| **Server / remote data** (anything fetched from the API) | **React Query** hooks in `store/<feature>/<feature>.queries.ts` | schools list, students, fees |
| **Session / UI / global client state** | **Zustand** in `store/<feature>/<feature>.store.ts` (or `store/<name>.store.ts`) | auth session, mobile-drawer open |

Server data must **not** be cached in a Zustand store. The removed `developer.store` (hand-rolled `schoolsById` / `isFetching` / `hasFetched`) is exactly the anti-pattern this rule eliminates — React Query already owns loading, error, caching, and invalidation.

## Reference implementation

`store/developer/` is the template to copy:

- `developer.services.ts` — the axios layer (one function per endpoint).
- `developer.queries.ts` — a **query-key factory** + typed `useXxxQuery` / `useXxxMutation` hooks that call the service and normalize through `helper.successResponse`.
- `developer.type.ts` — request/response types.

```ts
// developer.queries.ts
export const developerKeys = {
  all: ['developer'] as const,
  schools: () => [...developerKeys.all, 'schools'] as const,
};

export const useSchoolsQuery = () =>
  useQuery({ queryKey: developerKeys.schools(), queryFn: fetchSchools });
```

Components read `data` / `isLoading` / `error` from the hook — never a manual flag.

## Reset on logout

Zustand stores that hold real state expose a `reset()` and register it at module init:

```ts
registerResettable(() => useUiStore.getState().reset());
```

`resetAllClientState()` (called on logout and on an unrecoverable 401) runs every registered reset **and** `queryClient.clear()`, so no user's data survives into the next session on the same browser tab. See `store/reset-registry.ts` and `lib/query-client.ts`.

## Exception

Auth/session is correctly Zustand state (`store/auth/`): the in-memory access token, the derived `SessionStatus`, and the user profile are session state, not a server cache. The single token refresh lives in `store/auth/session.client.ts`.
