# Tech Debt, Security Posture & Test Coverage — Phased Plan

_Owner:_ devensuji@gmail.com
_Created:_ 2026-04-21
_Status:_ planning (no code changes yet)

---

## Why phased, not all-at-once

The ask is large: audit → visualize logic → remove dead code → find vulns → write tests for every feature → fix everything. Attempted in one session, each step degrades: shallow tests, deletions of code that only _looked_ dead, missed real vulns while chasing style debt.

Splitting the work by **risk** (what could bite us in production) rather than by **area** (what's easy to see) keeps each phase finishable and each decision reviewable.

---

## Phase 1 — Audit & Report (read-only)

**Goal:** produce a single document that tells the truth about where we are, so the next phases have real priorities instead of guesses.

**Output:** `docs/AuditReport.md` containing:

1. **Repo inventory**
   - Directory tree with line counts per area (dashboard / functions / docs)
   - Framework versions, critical dependencies, EOL risks
   - Cloud Functions list: trigger type, last-touched, secrets used
   - Firestore collections touched + read/write count per collection

2. **Test coverage baseline**
   - Grep for `*.test.*`, `*.spec.*`, `__tests__`, `vitest`, `jest`, `playwright`
   - Per-feature coverage matrix (Leads / Projects / Admin / Dashboard / WhatsApp / Auth) — expected to be near-zero
   - Which critical paths have _no_ test at all (RBAC rules, lead→WhatsApp pipeline, property matcher)

3. **Tech debt top-N**
   - Files >500 lines (likely needing split)
   - Duplicated logic (e.g., lead-filter patterns repeated across pages)
   - TODO / FIXME / HACK comments
   - Dead exports / unused files (npx depcheck, ts-prune, or manual grep)
   - Any-typed escape hatches (`as any`, `@ts-ignore`)
   - Console logs in production paths

4. **Security posture top-N**
   - Secrets audit: anything in `.env.local` or Firestore that should be in Secret Manager (we already know Gemini/WhatsApp keys are in Firestore — confirm list)
   - Firestore rules review against current UI assumptions (e.g., the CP bug we just fixed — any similar rule/query mismatches remain?)
   - Client-exposed service keys vs admin SDK usage
   - CSRF / auth-flow review for `/api/*` routes
   - Input validation: any route accepting arbitrary shapes?
   - XSS / injection surface on user-supplied strings that render as HTML
   - WhatsApp webhook signature verification status
   - Rate limiting on public-facing endpoints

5. **Dead / duplicate files**
   - Candidates for removal, each with evidence (not referenced from X, Y, Z)
   - No deletions yet — just a list

**Deliverable:** the audit report. No code changes.

**Exit criterion:** user picks priorities from the report to drive Phase 2.

---

## Phase 2 — Test Infrastructure + Highest-Risk Coverage

**Goal:** build the harness once, then cover the paths where a silent break loses money, data, or leaks access.

**Steps:**

1. **Choose stack** — proposal:
   - **Vitest** for unit/integration (fast, TS-native, works with Next.js)
   - **Firebase Emulator Suite** for Firestore rules + real integration tests
   - **Playwright** for E2E browser tests — _only after_ the first two are green
   - Rationale to be confirmed against existing `package.json` scripts in Phase 1

2. **Wire the emulator** — `firebase.json` config for firestore + auth emulators; seed data helpers; npm scripts for `test`, `test:rules`, `test:e2e`

3. **Write tests for the top-risk paths first** (order matters — stop at whatever the session permits):
   - **Firestore rules** — per-role access matrix for every collection. This is the single most leverage-heavy test file: it encodes the RBAC security boundary.
   - **Auth flow** — first-user bootstrap, devensuji@gmail.com self-heal, pending-user migration, placeholder-role redirects
   - **Lead CRUD + owner_uid scoping** — CP can only read/write own; admin sees all
   - **Permissions matrix** — `can(role, capability)` unit tests for every role × every capability
   - **WhatsApp send pipeline** — fingerprint dedup, lock acquisition, opt-out gate (mock the Graph API call)
   - **Property matcher** — threshold logic, geo gate, dedup via `last_sent_match_fingerprint`

4. **CI** — one GitHub Actions workflow runs unit + rules tests on every PR. E2E gets a separate slower workflow.

**Deliverable:** working `npm test`, at least rules + permissions + auth tests green, CI enforcing them.

**Out of scope for Phase 2:** UI component tests, visual regression, exhaustive edge cases for every form field.

**Status (2026-04-21):** Shipped — infrastructure + 4 of 6 highest-risk paths. Two paths **deferred to Phase 3/4 as tracked feature coverage gaps**:
- WhatsApp send pipeline (fingerprint dedup, lock acquisition, opt-out gate) — test file TBD
- Property matcher (threshold logic, geo gate, `last_sent_match_fingerprint` dedup) — test file TBD

Both live in Cloud Functions / `lib/hooks/usePropertyMatching.ts`. Deferred not because they're low-risk (they aren't), but because adding them belongs in the feature-coverage rhythm of Phase 3, not the infrastructure rhythm of Phase 2.

---

## Phase 3 — Feature Coverage Sweep

**Goal:** fill in tests for the remaining features once the infrastructure is trusted.

**Approach:** one session per feature area, each producing tests + a short "what's tested / what's deliberately skipped" note.

**Proposed order** (revisit after Phase 1):
1. Projects CRUD + campaigns field-level write rule for digital_marketing
2. Admin console — team management, role changes, superadmin guardrails
3. Dashboard metrics — `computeInternalMetrics`, `computeTimeSeries`, channel-partner variant
4. Kanban board — lane moves, property-match lane injection
5. Inventory & project schemas
6. CSV import — parser edge cases, error rows, duplicate detection
7. Bulk operations (delete, reassign) where they exist

**Deliverable:** per-area coverage report; gaps documented, not hidden.

---

## Phase 4 — Tech Debt Remediation

**Goal:** clean up the debt identified in Phase 1, now that tests exist to catch regressions.

**Cardinal rule:** no cleanup without a test covering the surface being changed. If tests don't exist, write them first or leave the debt alone.

**Candidate work (ordered by ROI, finalize after Phase 1):**
1. Split oversized files (`app/page.tsx` is the likely worst offender)
2. Extract duplicated lead-filter logic into a single hook (`useScopedLeads`)
3. Remove `as any` / `@ts-ignore` — each removal is a real bug fix
4. Delete dead code flagged in Phase 1
5. Move Gemini / WhatsApp keys out of Firestore into Secret Manager (this is Phase 5 territory actually — see below)
6. Consolidate redundant config read paths

**Deliverable:** smaller, tidier codebase. All tests still green.

---

## Phase 5 — Security Hardening

**Goal:** close the gaps found in Phase 1, in order of blast radius.

**Likely work (confirm scope after Phase 1):**
1. **Secret Manager migration** — Gemini / WhatsApp tokens out of Firestore. Rotate the keys as part of the migration since they've been in a readable store.
2. **Webhook signature verification** — WhatsApp inbound webhook should verify `X-Hub-Signature-256`.
3. **API route auth** — every `/api/*` route must verify the caller via Firebase ID token, not just trust the Next.js session.
4. **Input validation** — Zod schemas on every API route body.
5. **Rate limiting** — at minimum on `/api/polish-note` and the WhatsApp webhook.
6. **Firestore rules: additional hardening**
   - Lock down `users` self-update so users can't promote themselves via their own doc (currently allowed in rules with a "tighten later" comment)
   - Audit every rule for rule-vs-query mismatches like the CP bug we just fixed
7. **CSP + security headers** — Next.js `next.config.js` headers

**Deliverable:** threat-model document listing what's mitigated, what's accepted, what's deferred with ticket links.

---

## Phase 6 — E2E & Observability

**Goal:** catch regressions that unit tests can't — browser flows, real user journeys.

1. Playwright setup against emulator-backed dev server
2. Smoke flows per role:
   - SuperAdmin: create user, change role, create project, upload CSV
   - Admin: create lead, move through kanban lanes
   - Sales Exec: create lead, log call, schedule callback
   - Channel Partner: create lead, view own pipeline, no access to forbidden pages
   - Digital Marketing: tag a campaign, cannot edit project core
3. Error monitoring: Sentry (or equivalent) wired with releases/source maps
4. Structured logging on Cloud Functions with correlation IDs

**Deliverable:** green E2E suite on CI, real error visibility in production.

---

## Phase 7 — Continuous Maintenance

Once everything above is in place:
- Every new feature ships with tests (enforced via CI coverage threshold)
- Monthly dep-update session
- Quarterly rules + threat-model review
- Quarterly dead-code sweep with `ts-prune`

---

## Guardrails that apply across every phase

- **No deletion without proof it's dead.** A grep miss is an outage.
- **No test that only tests the mock.** Integration-first where affordable.
- **No cleanup that breaks green tests.** If it does, the test was valuable.
- **Absolute dates in all notes** (user preference; relative dates rot).
- **Every PR scoped to one phase item.** Easier review, easier revert.

---

## How to resume

Start Phase 1 by running the audit. Each subsequent phase is a separate session, triggered by the user picking from the prior phase's report. No phase starts without the previous one having an accepted deliverable.
