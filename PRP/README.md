# PRP — Frontend change plans

This folder holds **Product Requirement Prompts (PRPs)**: one self-contained, implementable plan per PR-sized work-item. The cross-repo master plan (all phases, dependencies, scope) is [`/PRD/implementation-plan.md`](../../PRD/implementation-plan.md); the product vision + decision log is [`/PRD/master-prp.md`](../../PRD/master-prp.md).

Each PRP follows: **Problem → Goal/Non-goals → Target design → Implementation steps → Files changed → Acceptance criteria → Validation → Risks**. Numbering is **global across all three repos** (this repo + `edu-platform-backend/PRP/` + `edu-platform-mobile/PRP/`); IDs are stable.

## How to use a PRP

1. Read it top to bottom; "Implementation steps" are ordered and concrete.
2. Implement on a branch (do **not** commit without explicit approval — see `CLAUDE.md`).
3. Run the **Validation** block before opening a PR.
4. Flip the status below to `Done`.

## Conventions (house style — keep these)

- UI screens in `src/modules/<feature>/`; client state + API in `src/store/<feature>/` split `*.store.ts` / `*.services.ts` / `*.type.ts` (+ optional `*.queries.ts`).
- Service responses normalize through `helper.successResponse` / `helper.errorResponse`; conditional classes via `cn()`; route strings come **only** from `APP_ROUTES`.
- Components don't call axios directly — go through `store/<feature>/*.services.ts`.
- Server state → **TanStack Query**; session/UI/global client state → **Zustand** (rule formalized in PRP-09).
- **Permission strings** mirror backend `PRP-17` verbatim (consumed via `deriveAbilities` / `<Can>` from PRP-10/11).
- Validation per PRP: `yarn type-check` · `yarn lint` · `yarn check` · `yarn build`.

## Foundation — session / auth / forms refactor

| PRP | Title | Addresses | Severity | Status |
| --- | --- | --- | --- | --- |
| [06](./PRP-06-session-consolidation.md) | Session consolidation (single redirect + refresh) | SF1, SF2, SF6–8, LG2 | 🔴 High | **Update** — single-flight infra exists; redirects still scattered |
| [07](./PRP-07-logout-state-reset.md) | Reset-all-client-state on logout | SF4 | 🟠 Med | Proposed |
| [08](./PRP-08-route-access-source-of-truth.md) | Single route-access source of truth | SF5 | 🟠 Med | Proposed |
| [09](./PRP-09-react-query-boundary.md) | Zustand ↔ React Query boundary | ST1–4 | 🔴 High | **Update** — RQ wired + school-list uses it; developer store still hand-rolls caching |
| [13](./PRP-13-forms-and-validation-stack.md) | Forms + validation stack + password policy | CC1–2, LG1, RG2–3 | 🟠 Med | Proposed |
| [14](./PRP-14-auth-ux-polish-and-cleanup.md) | Auth UX polish + dead-code cleanup | LG3–5, RG4–6, SF9, CC3–6 | 🟡 Low | **Update** — some items already addressed |

## Tooling

| PRP | Title | Severity | Status |
| --- | --- | --- | --- |
| [74](./Tests/PRP-74-frontend-test-harness.md) | Unit/component-test harness (Vitest + RTL) — in `PRP/Tests/` | 🟠 Med | Proposed |

## Product phases (P1–P8)

| PRP | Title | Phase | Status |
| --- | --- | --- | --- |
| [10](./PRP-10-rbac-model-and-abilities.md) | RBAC model, abilities & active school | 1 | Proposed |
| [11](./PRP-11-permission-menu-and-guards.md) | Permission-driven menu & route guards | 1 | Proposed |
| [22](./PRP-22-superadmin-console-ui.md) | SuperAdmin console layout + screens | 1 | Proposed |
| [23](./PRP-23-public-school-signup.md) | Public school sign-up + pending states | 1 | Proposed |
| [24](./PRP-24-subscription-status-ux-and-billing.md) | Subscription status UX + billing page | 1 | Proposed |
| [25](./PRP-25-role-landing-and-merged-nav.md) | Per-role landing pages + dual-role merged nav | 1 | Proposed |
| [26](./PRP-26-admin-invite-and-ownership-transfer.md) | Additional-admin invite + ownership transfer | 1 | Proposed |
| [35](./PRP-35-academic-setup-ui.md) | Academic setup UI | 2 | Proposed |
| [36](./PRP-36-staff-student-management-ui.md) | Staff & student management UI (SIS) | 2 | Proposed |
| [37](./PRP-37-admissions-promotion-import-ui.md) | Admissions + promotion + import UI | 2 | Proposed |
| [43](./PRP-43-parent-portal-web-and-attendance-views.md) | Parent portal (web) + attendance views | 3 | Proposed |
| [47](./PRP-47-fee-setup-ui.md) | Fee setup UI | 4 | Proposed |
| [48](./PRP-48-fee-collection-and-parent-view-ui.md) | Fee collection + parent fee view | 4 | Proposed |
| [52](./PRP-52-exam-and-marks-ui.md) | Exam setup + marks-entry UI | 5 | Proposed |
| [53](./PRP-53-results-and-report-card-ui.md) | Results & report-card viewing | 5 | Proposed |
| [58](./PRP-58-comms-ui.md) | Comms UI (notices/events/messaging/PTM) | 6 | Proposed |
| [59](./PRP-59-homework-materials-ui.md) | Homework / materials / syllabus UI | 6 | Proposed |
| [62](./PRP-62-online-payment-ui.md) | Online payment UI (parent checkout + gateway config) | 7 | Proposed |

## Recommended order

- **Foundation:** `06 → 07 → 08` (refactor, unblocks everything) → `09` (state rule) → `13` (forms) → `14` (polish).
- **P1:** `10 → 11` (RBAC, pairs with backend `PRP-12/17`) → `25` (role landing) ; `22/23/24/26` consume backend `PRP-15/16/20/21`.
- **P2 → P8:** follow the dependency order in [`/PRD/implementation-plan.md`](../../PRD/implementation-plan.md).

## Cross-repo dependencies

- **PRP-10** must use the same `resource.action` permission strings as backend **PRP-17** (the owner) and **PRP-12**.
- **PRP-13** password policy has a backend counterpart (SB11) — match the shared zod schema.
- **PRP-14 / LG5** depends on backend **SB8** (login returns `schools`) to drop the second `/auth/me` call.
