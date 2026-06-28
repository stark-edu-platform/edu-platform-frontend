# PRP-58 — Comms UI (notices / events / messaging / PTM)

> **Status:** Proposed · **Phase:** 6 · **Severity:** 🟠 Med · **Size:** L **Addresses:** P6-FE-1 (master-prp §6 P6, decisions D9/D13) · **Depends on:** backend PRP-54 (notification engine — preference matrix + delivery-log + in-app feed source), PRP-55 (notices/circulars + events calendar APIs), PRP-56 (teacher↔parent messaging + PTM APIs); FE PRP-10 (`deriveAbilities`/`activeSchoolId`/typed roles + the shared permission keys), PRP-11 (permission menu + `<Can>`/route guards), PRP-25 (per-role landing pages this extends), PRP-24 (`<WriteGate>` / subscription banner), PRP-09 (Zustand ↔ React Query boundary), PRP-13 (forms + zod) · **Pairs with:** MOB PRP-60 (mobile comms — same backend, parallel UX)

## 1. Problem / current state

After P1–P5 the web app has a role-aware shell (PRP-10/11/25), academic setup (P2), attendance/parent views (PRP-43), fees (PRP-47/48), and exams (PRP-52/53), but **no communication surfaces**: there is no notices/circulars screen, no events calendar, no teacher↔parent messaging, no PTM booking, and **no notification-preferences screen** or **in-app notification feed** — even though PRP-54 now exposes the preference matrix, the delivery log, and the `IN_APP` feed, and PRP-55/56 expose notices/events/messaging/PTM.

This PRP builds those web screens following the house conventions: UI in `src/modules/<feature>/`, client state/API in `src/store/<feature>/` (`*.store.ts`/`*.services.ts`/`*.type.ts`), server state via **TanStack Query** (PRP-09 boundary — no parallel Zustand cache), routes from **`APP_ROUTES`** only (never hardcoded), responses normalized through `helper.successResponse`/`helper.errorResponse`, classes via `cn()`, forms via the PRP-13 `react-hook-form`+`zod` stack, and write controls gated by PRP-24's `<WriteGate>` (the server PRP-15/PRP-12 stays authoritative) + `<Can>` permission gates (PRP-11) whose keys mirror the backend (PRP-54/55/56) **verbatim** via the PRP-10 shared module.

⚠︎ **O-P6 (master-prp §10):** **messaging moderation** and the **WhatsApp/SMS channel** are open backend-side — the FE surfaces what the backend exposes (a per-school messaging-enabled state, a report-message action, and a preference toggle per channel **including a WhatsApp toggle that may be disabled** when the backend reports the channel unconfigured). No moderation admin workflow beyond the flagged-list read PRP-56 exposes.

## 2. Goal & non-goals

- **Goal:** (a) a **Notices** surface — a list (audience-filtered server-side) + detail (records a read) + an admin/teacher **compose** screen (audience picker: school/role/class, attachments, publish-now/schedule) gated by `notice.manage`; (b) an **Events calendar** — a month/list view of events by range + an admin/teacher event editor; (c) **Messaging** — a thread list with unread counts, a thread view (history + composer), and a "start conversation" flow honoring the relationship rules the backend enforces, plus a **report-message** action; (d) **PTM** — for teachers/admins a slot-publish screen, for parents a slot-browse + book-for-a-child flow; (e) a **Notification preferences** screen (the category×channel matrix from PRP-54, `IN_APP` locked on, a disabled WhatsApp toggle when unconfigured) and an **in-app notification feed/bell** (the `IN_APP` deliveries); all via `store/notice`, `store/event`, `store/messaging`, `store/notification` services + TanStack Query; all routes in `APP_ROUTES`; write UI `<WriteGate>`-wrapped.
- **Non-goals:** any backend change (PRP-54/55/56 own the APIs); the **homework/materials/syllabus** UI (PRP-59); the **mobile** app (PRP-60 — push registration is mobile's; the web preference screen toggles channels but web push is optional ⚠︎); real-time/websocket messaging (the backend is request/response — the UI **polls/refetches on focus** via TanStack Query, no live socket); the deep moderation workflow (PRP-56 only exposes flag + an admin flagged-list read — surface those, nothing more); building the notification engine's channels (FE only reads/writes preferences + the in-app feed); a rich WYSIWYG editor (notice/message bodies are textarea/markdown — keep it light in P6).

## 3. Target design

### 3.1 Routes (extend `APP_ROUTES` in `src/constants/routes.ts`)

New strings live **only** here (never hardcoded in pages/menu), grouped as a `comms` feature map:

- `school.notices.list` → `/notices`
- `school.notices.detail(id)` → `/notices/[noticeId]`
- `school.notices.compose` → `/notices/compose` (admin/teacher)
- `school.events` → `/events` (calendar)
- `school.messaging.threads` → `/messages`
- `school.messaging.thread(id)` → `/messages/[threadId]`
- `school.ptm` → `/ptm` (slots — teacher publish / parent book, role-branched within the screen)
- `school.notifications.preferences` → `/settings/notifications`
- (the in-app feed is a bell in the app shell, not a standalone route — opens a panel; a `/notifications` list page is optional)

### 3.2 State & services (store split, PRP-09 — components never call axios directly)

Four feature slices under `src/store/`:

- **`src/store/notice/`** — `notice.type.ts` (mirrors PRP-55: `Notice`, `NoticeStatus`, `NoticeAudienceType`, `NoticeTarget`, attachment, read-stats shapes; reuse `SchoolRole`/`PermissionKey` from PRP-10 — don't redefine); `notice.services.ts` (`fetchNotices(filters)`, `fetchNotice(id)`, `createNotice`, `updateNotice`, `publishNotice`, `archiveNotice`, `presignNoticeAttachment`, `fetchReadStats`); all via `apiClient` + `helper.*`.
- **`src/store/event/`** — `event.type.ts` (PRP-55 `Event`/`EventCategory`); `event.services.ts` (`fetchEvents(range, category?)`, `createEvent`, `updateEvent`, `deleteEvent`).
- **`src/store/messaging/`** — `messaging.type.ts` (PRP-56 `MessageThread`/`Message`/`ThreadParticipant`/`ThreadKind` + unread shape); `messaging.services.ts` (`fetchThreads`, `startThread`, `fetchMessages(threadId)`, `postMessage`, `closeThread`, `reportMessage`); plus PTM: `fetchPtmSlots(filters)`, `publishPtmSlots`, `bookPtmSlot(slotId, studentId)`, `cancelPtmBooking` (or a sibling `store/ptm/` — keep PTM in `store/messaging` or its own slice; one of the two, documented).
- **`src/store/notification/`** — `notification.type.ts` (PRP-54 `NotificationChannel`, `NotificationCategory`, preference-matrix + delivery-log + in-app-feed shapes); `notification.services.ts` (`fetchPreferences`, `updatePreferences`, `fetchInAppFeed(cursor)`, `markFeedRead`, `registerPushToken?` (web push — optional ⚠︎), `fetchDeliveryLog(filters)` (admin)).
- **TanStack Query keys** (PRP-09): `['notices',filters]`, `['notice',id]`, `['notice',id,'readStats']`, `['events',range]`, `['threads']`, `['thread',id,'messages']`, `['ptm','slots',filters]`, `['notifications','preferences',activeSchoolId]`, `['notifications','feed']`, `['notifications','deliveryLog',filters]`. Mutations (`publishNotice`/`postMessage`/`bookPtmSlot`/`updatePreferences`/…) `invalidateQueries` on success; the thread view + feed **refetch on window focus** (no socket) — set `refetchOnWindowFocus` and/or a light poll for the active thread.

### 3.3 Notices (`src/modules/notices/`)

- **`NoticeListScreen.tsx`** (`app/(school)/notices/page.tsx`): the audience-filtered list (the backend returns only what targets the caller — PRP-55 §3.5), pinned-first, with status/audience filter chips. Each item links to detail. A "New notice" button (gated `<Can permission="notice.manage">`) → compose.
- **`NoticeDetailScreen.tsx`** (`app/(school)/notices/[noticeId]/page.tsx`): renders title/body (markdown)/attachments (download via presigned GET); opening it records a read (the GET does, server-side). For an author/admin, a **read-stats** panel (`notice.read_stats`).
- **`NoticeComposeScreen.tsx`** (`app/(school)/notices/compose/page.tsx`): a PRP-13 `react-hook-form`+`zod` form — title, body, **audience picker** (SCHOOL / ROLE multi-select / CLASS grade+section picker reusing P2's section selectors), attachments (presigned upload), and publish mode (now / schedule with a `publishAt`) / expiry. Submit calls `createNotice` then `publishNotice` (or saves DRAFT). Wrapped in `<WriteGate>` (disabled in READ_ONLY/LOCKED — server PRP-15 authoritative); gated `notice.manage`.

### 3.4 Events calendar (`src/modules/events/`)

- **`EventsCalendarScreen.tsx`** (`app/(school)/events/page.tsx`): a month grid + an agenda/list toggle over a date range (`fetchEvents(range)`), color-coded by `EventCategory` (HOLIDAY/EXAM/PTM/…). Audience-filtered server-side. Admin/teacher get an **EventEditor** modal (create/edit/delete, gated `event.manage`, `<WriteGate>`-wrapped) with the same audience shape as notices. Keep it tabular/light (no heavy calendar lib unless a UI primitive already exists — prefer a simple grid + the existing `DataGrid`/`Modal`).

### 3.5 Messaging (`src/modules/messaging/`)

- **`ThreadListScreen.tsx`** (`app/(school)/messages/page.tsx`): the caller's threads (`fetchThreads`) newest-activity-first with unread badges; a "Start conversation" action that opens a **StartThreadModal** — the recipient/student picker is **constrained by what the backend allows** (a teacher picks a parent of a student in a class they teach; a parent picks their child's teacher) — the FE offers the plausible options but the **server enforces** `canStartThread` (PRP-56) and the UI handles a `403` gracefully.
- **`ThreadScreen.tsx`** (`app/(school)/messages/[threadId]/page.tsx`): message history (`fetchMessages`, refetch-on-focus + light poll) + a composer (`postMessage`, optional single attachment) wrapped in `<WriteGate>`; a per-message **report** action (`reportMessage` → PRP-56's flag hook); a thread **close** for participants/`messaging.moderate`. When the school's `messaging.enabled` is false (backend reports it), the composer disables with a clear message. Admins with `messaging.moderate` get a **flagged-messages** view (a tab or `/messages/flagged`) reading PRP-56's flagged list — the only moderation surface (⚠︎ O-P6, no deeper workflow).
- Gated by `messaging.use` (`<Can>`); the moderate view by `messaging.moderate`.

### 3.6 PTM (`src/modules/ptm/`)

- **`PtmScreen.tsx`** (`app/(school)/ptm/page.tsx`): **role-branched** (PRP-25 union-abilities). For TEACHER/ADMIN (`ptm.manage`): a slot-publish panel (date/time range, section/subject, capacity; single + bulk) and a list of their slots with bookings. For PARENT (`ptm.book`): a browse of open slots for their child's teachers/sections + a **book-for-child** action (pick which child, `bookPtmSlot`) and a "my bookings" list with cancel. A dual-role user sees both sections (D13). All writes `<WriteGate>`-wrapped; the booking conflict/capacity errors from PRP-56 surface as toasts.

### 3.7 Notification preferences + in-app feed (`src/modules/notifications/`)

- **`NotificationPreferencesScreen.tsx`** (`app/(school)/settings/notifications/page.tsx`): the **category × channel matrix** (`fetchPreferences` → a grid of toggles; `updatePreferences` on change, optimistic + invalidate). `IN_APP` is **locked on** (PRP-54 — non-disable-able). The **WhatsApp** (and SMS) toggle is **rendered disabled with a "coming soon"/"not enabled for your school" hint** when the backend reports the channel unconfigured (⚠︎ O-P6) — the matrix reflects the engine's channel availability. Mandatory categories (e.g. `SYSTEM`) render locked-on too (PRP-54 documents which).
- **`NotificationBell.tsx`** (mounted in the app shell/header, not a route): a bell with an unread count + a dropdown panel listing the `IN_APP` feed (`fetchInAppFeed`), each item linking to its source (a notice/message/homework deep link) and marking read (`markFeedRead`). Refetches on focus. (An optional full `/notifications` page can reuse the same list.)
- Optional **web push registration** ⚠︎: if web push is in scope, a "Enable browser notifications" prompt registers a token via `registerPushToken` (PRP-54) — but web push is **optional in P6** (push is primarily mobile, PRP-60); guard it behind a feature flag and don't block the screen on it.

### 3.8 Menu & guards (PRP-11/25)

Add permission-tagged entries to `src/constants/project.menu.ts` (via `APP_ROUTES` only): a **Notices** entry (`notice.read`), **Events** (`event.read`), **Messages** (`messaging.use`, with the unread badge), **PTM** (`ptm.read`), and **Notification settings** under a settings group (always available — it's self-preferences). Visibility flows from `deriveAbilities` (PRP-10) — no hardcoded role checks. All pages under `(school)` inherit PRP-24's subscription banner + PRP-11 route guards. The compose/editor/publish/book controls additionally require their `*.manage`/`*.book` keys.

## 4. Implementation steps

1. **Routes:** add the `school.notices.*`, `school.events`, `school.messaging.*`, `school.ptm`, `school.notifications.*` keys to `src/constants/routes.ts` (never hardcode).
2. **Types/services:** add `src/store/{notice,event,messaging,notification}/{*.type,*.services}.ts` mirroring PRP-54/55/56 shapes; all calls via `apiClient` + `helper.*`; reuse PRP-10's `SchoolRole`/`PermissionKey`. Add a small presigned-upload helper (notices/messages attachments) + a presigned-download helper.
3. **Query hooks:** add hooks (inline or `*.queries.ts`) with the §3.2 keys; mutations `invalidateQueries`; the thread view + feed `refetchOnWindowFocus` + a light interval for the active thread (PRP-09 boundary — no parallel Zustand cache).
4. **Notices UI:** add `src/modules/notices/{NoticeListScreen,NoticeDetailScreen,NoticeComposeScreen}.tsx` (compose via PRP-13 form + `<WriteGate>` + `<Can>`).
5. **Events UI:** add `src/modules/events/EventsCalendarScreen.tsx` (+ an EventEditor modal) reusing `DataGrid`/`Modal`/`Button`/`SelectInput`.
6. **Messaging UI:** add `src/modules/messaging/{ThreadListScreen,ThreadScreen,StartThreadModal}.tsx` + the flagged-messages moderate view; composer `<WriteGate>`-wrapped; report action.
7. **PTM UI:** add `src/modules/ptm/PtmScreen.tsx` (role-branched publish vs book).
8. **Notifications UI:** add `src/modules/notifications/{NotificationPreferencesScreen,NotificationBell}.tsx`; mount the bell in the app shell header; preference matrix with locked `IN_APP` + disabled-unconfigured channels.
9. **Pages (thin):** add the `app/(school)/notices/{page,[noticeId]/page,compose/page}.tsx`, `app/(school)/events/page.tsx`, `app/(school)/messages/{page,[threadId]/page}.tsx`, `app/(school)/ptm/page.tsx`, `app/(school)/settings/notifications/page.tsx` — each renders its module.
10. **Menu + guards:** add the permission-tagged entries to `project.menu.ts` (via `APP_ROUTES`, PRP-11); confirm `<Can>`/route guards gate each screen and `<WriteGate>` wraps every mutating control.

## 5. Files added / changed

- **Add:** `src/store/notice/{notice.type,notice.services}.ts`, `src/store/event/{event.type,event.services}.ts`, `src/store/messaging/{messaging.type,messaging.services}.ts`, `src/store/notification/{notification.type,notification.services}.ts`, `src/modules/notices/{NoticeListScreen,NoticeDetailScreen,NoticeComposeScreen}.tsx`, `src/modules/events/EventsCalendarScreen.tsx`, `src/modules/messaging/{ThreadListScreen,ThreadScreen,StartThreadModal}.tsx`, `src/modules/ptm/PtmScreen.tsx`, `src/modules/notifications/{NotificationPreferencesScreen,NotificationBell}.tsx`, pages under `src/app/(school)/{notices,events,messages,ptm,settings/notifications}/…`, optional `*.queries.ts`
- **Edit:** `src/constants/routes.ts`, `src/constants/project.menu.ts`, the app shell/header component (mount `NotificationBell`)

## 6. Acceptance criteria

- [ ] A user sees a notices list filtered to what targets them (server-side, PRP-55); opening a notice records a read; an admin/teacher composes a notice (audience picker school/role/class, attachments, publish-now/schedule) gated by `notice.manage` + `<WriteGate>`, and sees read-stats.
- [ ] An events calendar shows events by range/category (audience-filtered); admin/teacher create/edit/delete via the editor (gated, `<WriteGate>`).
- [ ] Messaging: the thread list shows unread counts; a thread view shows history + a composer (refetch-on-focus, no socket); starting a thread is constrained by the backend relationship rules (a `403` is handled cleanly); a message can be reported; `messaging.enabled=false` disables composing; an admin with `messaging.moderate` sees flagged messages.
- [ ] PTM: a teacher/admin publishes slots; a parent books one per child (capacity/conflict errors surface); a dual-role user sees both sections (D13).
- [ ] The preferences screen shows the category×channel matrix with `IN_APP` (and mandatory categories) locked-on and WhatsApp/SMS toggles disabled when the backend reports them unconfigured (⚠︎ O-P6); the in-app bell shows unread `IN_APP` deliveries and deep-links to their source.
- [ ] All routes come from `APP_ROUTES`; menu entries are permission-tagged (PRP-11) and visibility flows from `deriveAbilities` (PRP-10); permission keys match the backend (PRP-54/55/56) verbatim via the PRP-10 shared module; all writes go through `store/*` services + TanStack Query (no direct axios), and the server (PRP-15/12) stays authoritative.

## 7. Validation

- `yarn type-check && yarn lint && yarn build`
- Manual (against a backend with PRP-54/55/56 + P2 seed): as an admin, compose a CLASS notice → publish → confirm it appears for a parent of that class and **not** another; open it as the parent → read recorded; check read-stats; add a HOLIDAY event → it shows in the calendar; as a teacher, start a thread with an allowed parent → send a message → the parent sees it (refetch on focus) + an in-app bell entry; try starting a thread with a disallowed parent → clean error; publish PTM slots → book as a parent → teacher notified; open `/settings/notifications` → toggle EMAIL off for NOTICE → re-publish a notice → confirm no email (DeliveryLog SKIPPED) while in-app still arrives; confirm WhatsApp toggle is disabled; force the school READ_ONLY → compose/post/book controls disable and a forced write is server-rejected.

## 8. Risks & rollback

- **Server is authoritative (PRP-15/12/56):** `<WriteGate>`/`<Can>` are UX only — the messaging relationship rule, the audience scoping, the PTM capacity, and the tenant scope are all enforced server-side; the FE must handle `403/404/409` (disallowed thread, non-targeted notice, full slot) gracefully, never assume the menu prevented it.
- ⚠︎ **O-P6 surfaces in the UI:** the WhatsApp/SMS channel toggles must reflect the backend's channel availability (disabled when unconfigured) rather than implying delivery; messaging moderation is only the flag + admin flagged-list read PRP-56 exposes — don't build a richer workflow the backend can't honor. Keep these soft so the O-P6 resolution (a BSP signs, moderation policy lands) is additive.
- **No real-time:** messaging/feed are request/response — use TanStack Query `refetchOnWindowFocus` + a light interval on the active thread; don't half-build websockets. Set the expectation in the UI (a manual refresh affordance is fine). Keep service shapes compatible so a future socket layer is additive.
- **Contract coupling:** the notice/event/message/preference shapes must mirror PRP-54/55/56 exactly — keep them in `*.type.ts` so a backend contract change is one file (mirrors PRP-43's risk note); permission keys come from the PRP-10 shared module (mirroring PRP-17), not hand-typed.
- **Attachment handling:** upload via presigned direct-to-S3 (don't proxy through the API); download via the backend's short-lived presigned GET (gated) — never construct bucket URLs client-side; respect the auth header.
- **Audience-picker drift:** the compose audience picker (role/class) must reuse P2's grade/section selectors and the PRP-10 role enum so it can't drift from what the backend resolves; the picker is a convenience — the server resolves the real recipient set (PRP-55).
- Rollback: all additive — revert the new stores/modules/pages/routes/menu entries + the bell mount in the shell. The catch-all (`app/[...slug]`) reclaims the unused routes. No existing behavior changes.
