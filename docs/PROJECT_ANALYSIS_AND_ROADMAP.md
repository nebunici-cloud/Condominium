# Condominium Platform — Analysis & Roadmap

*Prepared: 2026-07-15 · Scope: full repository review (features, architecture, UI/UX, security) plus a phased action plan.*

---

## 1. Executive summary

The project is a **multi-tenant condominium management platform** (Next.js 16 + Supabase) currently built around the **administrator/accountant workflow**: entity management (associations → buildings → units → owners/occupants), a capability-based permission system, an audit log, and a mature Finance module (fee types, six allocation methods, draft→publish invoicing, meter readings, payments, Excel imports).

The foundations are unusually strong for this stage — defense-in-depth RLS, versioned allocation rules, reproducible invoice calculations, effective-dated ownership history. The three biggest gaps standing between the current state and a "next level" product are:

1. **No resident experience.** Owners/occupants have roles and view capabilities, but RLS is tenant-wide, so finance visibility for residents is deliberately disabled. There is no "my unit / my invoices / my balance" portal — the single highest-value missing feature.
2. **No engineering safety net.** Zero automated tests (including for the money-calculating allocation engine), no CI, no type generation from the database schema, no error monitoring.
3. **A closed loop with the outside world.** No email/notification delivery (even invites are silent), no invoice PDF/delivery, no online payment collection, no communication channel (announcements, requests).

Security posture is good overall, with a small number of concrete items to fix — most notably the **dev-login backdoor being gated only on the presence of `SUPABASE_SERVICE_ROLE_KEY`**, which would grant anyone administrator access if that variable ever reaches a production deployment.

---

## 2. Current state

### 2.1 Technology stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router, `src/proxy.ts` middleware), React 19, TypeScript | Server components + server actions throughout |
| UI | Tailwind CSS 4, shadcn/ui (Radix primitives), lucide, sonner toasts | Dark-mode tokens exist in `globals.css` but no toggle wired up |
| Forms/validation | react-hook-form + zod | Consistent pattern in dialogs |
| i18n | next-intl, locales `ro` (default) + `ru`, always-prefixed routes | `profiles.preferred_locale` already allows `en`, but `en` is not offered |
| Backend | Supabase: Postgres + RLS, Auth (magic link), 32 SQL migrations | No Edge Functions, no Storage usage yet |
| Imports/exports | exceljs (XLSX templates + import for units, owners, opening balances, payments) | |
| Tests / CI | **None** | No test runner, no `.github/` workflows |

### 2.2 Feature inventory (what exists today)

**Core entity graph**
- Tenants (platform account) → associations → buildings → units; owners and occupants as tenant-wide directories.
- Effective-dated `ownerships` and `occupancies` (history is ended, never deleted); owner-as-occupant linking; auto-synced `resident_count` with manual override.
- Association/building codes and auto-generated numeric unit account codes ("Cod Personal") for payment reconciliation.

**Permissions & administration**
- Capability catalog (`core.*`, `finance.*`) + per-tenant editable roles + per-association scoped grants; six seeded role bundles (owner, tenant, board president, council member, administrator, accountant).
- Permission management UI per association/role (capability checklist).
- Team invitations by email with role pre-assignment, accepted automatically on first sign-in (`accept_pending_invite`).
- Tenant onboarding flow (first sign-in with no tenant → create organization).
- Audit log (trigger-based, SECURITY DEFINER write path, read gated by `core.audit.view`) with UI.
- Config registry (per-tenant/per-association key-value entries with active toggle).

**Finance module**
- Fee types per association; **versioned, append-only allocation rules** with six methods: `cota_parte`, `by_area`, `per_unit`, `per_resident`, `by_meter`, `tariff_rate` (rate × unit quantity).
- Pure, testable allocation engine (`src/lib/allocation-engine.ts`) with proportional distribution, rounding reconciliation, and missing-data exclusion.
- Guided invoice generation: carried-forward periods/amounts, preview with exclusion warnings, **atomic batch commit via `commit_invoice_batch` RPC**, whole-month periods, overlap constraints at the DB level.
- Draft → publish workflow (separate publish capability, per-tenant invoice numbering, issue/due dates assigned atomically), bulk publish/cancel, per-line adjustments requiring a reason, invoice detail page styled as a real branded invoice with meter indices (Ind. precedent/curent), prior balance and Consum/U.M./Tarif columns.
- Meter readings: per-unit entry and building-wide bulk entry.
- Payments: manual recording, Excel import, manual invoice matching, opening balances import; per-unit outstanding balance.

**What does *not* exist yet** (referenced in code comments as future modules): resident portal, notifications/email of any kind, PDF export/printing, online payments, announcements, maintenance requests, documents, meetings/voting, reporting/exports beyond templates, dashboards.

### 2.3 Architecture assessment

**Strengths worth preserving**
- **Authorization lives in the database.** Every table has RLS; write policies check capabilities scoped per association via `has_capability()`. Server actions can be thin because RLS is the real gate.
- **Auditability by design**: allocation rules are immutable versions, `invoice_lines.calculation_input` snapshots everything that produced a number, audit triggers cover finance tables. A disputed bill can be reproduced months later.
- SECURITY DEFINER functions consistently pin `search_path`, and `anon`/`public` execute grants were explicitly revoked (two hardening migrations).
- Clean separation of the pure calculation core from I/O; period helpers isolated; consistent server-action + zod pattern.

**Weaknesses / debt**
- **No database-derived TypeScript types** — all Supabase queries are untyped (`row.roles` needs a hand-rolled `embedOne` helper). One schema rename away from silent runtime breakage.
- **N+1 patterns** in invoice computation (per-fee-type queries in a loop) and full-table fetches with no pagination on lists (owners, audit, invoices) — fine at 1 building, painful at 50.
- Business logic is accumulating inside route-level `actions.ts` files (678 lines in `invoices/actions.ts`); no service layer to share logic between (future) admin and resident surfaces.
- `commitInvoiceGeneration` sets `generated_by: user?.id ?? ""` — an empty-string UUID would fail the insert; should hard-fail on missing user instead.
- Zod schemas accept `periodStart`/`periodEnd` as bare strings (no ISO-date validation).
- Invoice status vs. payments: `partially_paid`/`paid` statuses exist, but reconciliation to status appears manual — no trigger/function keeps `invoices.status` in sync with matched payments.

---

## 3. Security review

### 3.1 What is already done right

- RLS enabled on every table, with capability-scoped write policies and no delete policy on history tables.
- Tenant isolation anchored on `tenant_users` + `is_tenant_member()`; helper functions are SECURITY DEFINER with pinned `search_path` and revoked public grants.
- Audit log writes only through a definer function; direct table writes revoked.
- Service-role client is server-only, null-safe when the key is absent, and documented as non-production-only.
- Invite integrity hardening migration (role/tenant match enforcement); atomic invoice batch commit removes partial-write states.
- No secrets committed (`.env.example` only; `.mcp.json` contains just a project ref).

### 3.2 Findings (ordered by severity)

| # | Severity | Finding | Recommendation |
|---|---|---|---|
| S1 | **High** | **Dev login is gated only on `SUPABASE_SERVICE_ROLE_KEY` being set** (`login/page.tsx:16`, `dev-login-actions.ts`). If that env var is ever added to the production environment (a one-click mistake in Vercel), *anyone* on the login page can mint an administrator session with no credentials. | Gate additionally on `process.env.NODE_ENV !== "production"` **and** an explicit `ALLOW_DEV_LOGIN=true` flag; strip the panel from production builds. |
| S2 | High (operational) | No test coverage or CI on code that computes money and no staging pipeline; regressions in the allocation engine or RLS would ship silently. | Vitest unit tests for `allocation-engine.ts`/`period.ts`/`balance.ts`; pgTAP or SQL-based RLS tests (owner cannot read another unit's invoices, cross-tenant isolation); GitHub Actions running lint + typecheck + tests on every PR. |
| S3 | Medium | No HTTP security headers: no CSP, HSTS, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `Permissions-Policy` (`next.config.ts` sets none). | Add a `headers()` block; start with report-only CSP, then enforce. |
| S4 | Medium | `getUserCapabilities` interpolates `associationId` into a PostgREST `.or()` filter string (`capabilities.ts:32`) without validating it; the value originates from route params. Low exploitability (RLS still applies) but it is filter injection into an authorization helper. | Validate with `z.string().uuid()` before use, or split into two queries and merge. |
| S5 | Medium | Invites never expire and produce no email — the invitee is silently authorized whenever they happen to sign in, indefinitely, and the inviter gets no delivery confirmation. | Add `expires_at` (e.g., 14 days) checked in `accept_pending_invite`, plus actual email delivery (see Phase 2). |
| S6 | Medium | Capability granularity: cancelling invoices is gated by `finance.payment.record` (the generic `invoices_update` policy) rather than a dedicated capability; publish rights exist but cancel/adjust rights are conflated with payment recording. | Introduce `finance.invoice.cancel` (and consider `finance.invoice.adjust`) with their own policies. |
| S7 | Low–Medium | All tenant members can read the full owners/occupants directories including emails/phones (`owners_select` = `is_tenant_member`). Fine while users are staff only; becomes a PII leak the day residents log in. | Fold into the per-unit RLS work in Phase 1 (residents see only their own records/co-residents). |
| S8 | Low | Magic-link only, no MFA option for administrator/accountant accounts that can rewrite financial records. | Enable Supabase MFA (TOTP) and require enrollment for roles holding `finance.*` write or `core.role.manage`. |
| S9 | Low | No rate limiting/monitoring at the app layer (login link requests, import endpoints); no error tracking. | Configure Supabase auth rate limits, add Sentry (or similar) with PII scrubbing, alert on RLS-denied spikes. |
| S10 | Low | GDPR/data-lifecycle gaps typical at this stage: no data export/erasure path for resident PII, audit log grows unboundedly. | Document retention policy; add archival/partitioning for `audit_log`; plan a subject-access export. |

---

## 4. UI/UX review

**Working well:** consistent shadcn design language; loading skeletons on every list page; breadcrumbs; guided invoice dialog with carry-forward defaults and preview warnings (excellent workflow design); bulk meter entry; color-coded invoice statuses; localized dd.mm.yyyy dates; RO/RU switcher in the header.

**Gaps, roughly in order of impact:**

1. **No dashboard.** Signing in lands on the associations list. Admins need an at-a-glance home: collection rate this month, total outstanding debt, top debtors, units missing meter readings, draft batches awaiting publish.
2. **No resident-facing surface at all** — see roadmap Phase 1; this is a product gap more than a UI one.
3. **Tables don't scale or adapt.** No pagination/virtualization (audit log and payments will grow unboundedly); wide tables will overflow on phones — and meter submission/balance checking are exactly the tasks residents will do from phones.
4. **Navigation depth**: finance lives under `buildings/[id]/invoices`; there is no cross-building "Finance" area, no global search / command palette to jump to a unit or owner by name/code.
5. **Feedback & empty states**: error handling surfaces raw Supabase/constraint messages in places; empty states are plain text without a "what to do first" call to action; no confirmation summary after bulk actions beyond a toast.
6. **Polish items**: dark-mode tokens exist but there's no toggle; `en` locale supported in data model but not offered; no keyboard shortcuts for the heavy data-entry flows (bulk meter entry begs for Enter-to-next-row); accessibility audit not yet done (Radix gives a good baseline; focus order and table semantics need verification).
7. **Print/PDF**: the invoice detail page is styled like a real invoice but cannot be exported, printed cleanly, or sent — invoices exist only inside the app.

---

## 5. Action plan

Guiding principle: **first make what exists safe and trustworthy (Phase 0), then open it to residents (Phase 1), then connect it to the outside world — money in, messages out (Phase 2), then broaden into a full community platform (Phase 3+).** Each phase is independently shippable.

### Phase 0 — Hardening & foundations (1–2 weeks)

*Goal: nothing embarrassing can happen in production; changes become safe to make.*

- **Security fixes:** S1 (dev-login gating — do this first), S3 (security headers), S4 (UUID validation), fix `generated_by` empty-string fallback, strict ISO-date zod validation.
- **Testing:** Vitest + unit tests for `allocation-engine.ts` (all six methods, rounding reconciliation, exclusion rules), `period.ts`, `balance.ts`; SQL/pgTAP tests for tenant isolation and finance RLS.
- **CI:** GitHub Actions — lint, typecheck, tests, build on every PR; supabase migration dry-run check.
- **Type safety:** generate DB types (`supabase gen types typescript`), type all clients, delete `embedOne`-style workarounds.
- **Observability:** Sentry (client+server), Supabase log drains; Vercel preview env documented with dev-login enabled *only* there.
- Quick wins bundle: invoice status auto-sync from matched payments (DB trigger), `finance.invoice.cancel` capability (S6), invite expiry (S5, DB part).

### Phase 1 — Resident portal MVP (3–5 weeks)

*Goal: an owner/occupant can log in and serve themselves; this is the "superior experience for habitants" core.*

- **Per-unit RLS layer** (the prerequisite for everything): helper `user_unit_ids()` resolving via `owners.user_id`/`occupants.user_id` → current ownerships/occupancies; extend finance select policies to `capability OR own-unit`; tighten the owners/occupants directory visibility (S7).
- **"My home" area** (mobile-first): current balance and history; invoice list + detail (same branded view admins see); payment history; my meter readings + **self-submission of readings** (new capability + admin review/anomaly flag); household info (co-owners, declared residents).
- **Resident onboarding at scale:** bulk-invite all owners of a building (uses existing invite machinery), invite-state dashboard for admins.
- **Invoice PDF/print:** print stylesheet + server-side PDF (e.g., `@react-pdf/renderer` or headless Chromium) — needed by both portal and Phase 2 email delivery.
- **i18n:** add `en` locale (data model already allows it); extract any remaining hardcoded strings.
- **UX:** dashboard for admins (collection rate, outstanding debt, missing readings, drafts pending) — landing page instead of the associations list; global search for units/owners by name/code.

### Phase 2 — Money in, messages out (4–6 weeks)

*Goal: close the financial loop and stop being a silent system.*

- **Notifications infrastructure:** transactional email (Resend/Postmark) + in-app notification center; events: invite sent, invoice published (with PDF attached), payment recorded/receipt, monthly reading reminder, debt reminder sequence with configurable thresholds. Respect `preferred_locale` per recipient.
- **Online payments:** provider abstraction + one integration to start (for the RO/MD market: maib ecommerce / MIA Instant Payments / Paynet, or Stripe where available); payment intents tied to invoices; webhook → auto-matched payment row (reusing the existing `payments` + matching model); receipts; partial-payment support (split matching — currently one payment ↔ one invoice).
- **Automatic reconciliation for bank imports:** match imported payments by unit account code ("Cod Personal" already exists for exactly this), with a review queue for ambiguous rows.
- **Announcements module** (first community feature): association/building-scoped posts, read tracking, email fan-out — small build, big perceived value.
- **Reporting v1:** monthly Excel exports accountants actually need — debt register per building, collection report, fee-type totals; owner account statement (PDF).

### Phase 3 — Community & operations platform (6–10 weeks, prioritize by demand)

- **Maintenance requests:** resident submits with photos (Supabase Storage) → triage → status updates + notifications; SLA overview for the board.
- **Documents:** association document library (minutes, contracts, regulations) with per-role visibility.
- **Meetings & voting:** convocation notices, agenda, proxy support, **cota_parte-weighted voting** (the share data model already supports this), quorum computation, signed minutes output.
- **Late-payment penalties:** config-driven penalty rules (grace period, rate) feeding invoice generation as a computed fee type — the versioned-rule engine is built for this.
- **Deeper finance:** expense tracking against supplier invoices (so admins can show where the money went), budget vs. actual per association, fund accounting (repair fund vs. operations).

### Phase 4 — Scale & product maturity (ongoing)

- Multi-tenant SaaS onboarding (self-serve tenant creation already exists — add plans/billing for the platform itself).
- Performance: pagination/virtualization on all lists, materialized balance views instead of on-the-fly aggregation, `audit_log` partitioning.
- PWA + push notifications (readings reminders, payment confirmations); consider native wrappers later only if push/UX demands it.
- Dark-mode toggle, accessibility audit (WCAG 2.1 AA), keyboard-first data entry for admin power users.
- MFA rollout for privileged roles (S8), penetration test before large-scale resident onboarding, GDPR data-subject export (S10).

---

## 6. Suggested success metrics

| Area | Metric | Target after Phase 2 |
|---|---|---|
| Resident adoption | % of units with ≥1 registered resident login | > 50% |
| Self-service | % of meter readings self-submitted | > 60% |
| Collections | Days-to-pay after invoice publish | −30% vs. baseline |
| Admin efficiency | Time to run a monthly billing cycle | < 30 min per building |
| Quality | CI green on every merge; allocation engine coverage | 100% of methods tested |
| Security | Dev-login unreachable in prod; headers scored | A on securityheaders.com |

---

## 7. Immediate next steps (this week)

1. Fix S1 (dev-login production gating) — one small PR, highest risk-reduction per line.
2. Add CI + first allocation-engine tests — unlocks confident iteration on everything else.
3. Add security headers and the two input-validation fixes (S3, S4).
4. Decide Phase 1 scope with stakeholders: which building/association pilots the resident portal, and which payment rail matters for your market (this drives Phase 2 lead times, since payment-provider onboarding has external latency).
