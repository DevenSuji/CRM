# Audit Report — Phase 1

_Date:_ 2026-04-21
_Scope:_ read-only audit of `/Users/devensuji/Documents/github/CRM`
_Follow-up:_ see `docs/TechDebtAndSecurityPosture.md` for the phased plan

---

## 1. Repo inventory

### Top-level layout
```
CRM/
├── elite-build-dashboard/   Next.js 16 app (TS, React 19)
├── functions/               Python Cloud Functions (7 total)
└── scripts/                 One-off Python seeders
docs/                        Markdown notes (11 files)
history/                     Stale transcript (1 file)
.gemini/                     Gemini Code Assist context
```

### Dashboard — lines of code (top files)
```
2273   app/page.tsx                           ← Leads page + all modals inline
1646   app/admin/page.tsx                     ← All admin tabs in one file
 764   components/projects/ProjectUnitsTab.tsx
 398   lib/utils/dashboardMetrics.ts
 373   lib/hooks/usePropertyMatching.ts
 363   components/projects/ProjectOverviewTab.tsx
 322   app/projects/page.tsx
 319   components/KanbanCard.tsx
```
**Total TS/TSX:** ~12k LOC across dashboard.

### Dependencies (dashboard)
- `next: 16.2.2` · `react: 19.2.4` · `firebase: 12.11.0` · `firebase-admin: 13.8.0`
- `playwright: 1.59.1` (installed, **not used** — no tests exist)
- **No** Zod, no Vitest, no Jest, no React Testing Library, no MSW.
- `@dnd-kit` · `lucide-react` · `recharts` · `tailwindcss v4`

### Cloud Functions (Python, `functions_framework`)
| Function | LOC | Trigger | Secret |
|---|---|---|---|
| `lead_ingestion_webhook` | 234 | HTTP | `webhook-api-key` (Secret Manager) |
| `check_site_visit_reminders` | 215 | Scheduled | — |
| `match_lead` | 86 | Firestore onUpdate | — |
| `on_lead_match_update` | 281 | Firestore onUpdate | `whatsapp-access-token` (Secret Manager) |
| `inventory_cleanup/cleanup_inventory.py` | (script) | Manual | — |
| `lead_cleanup/cleanup_lead.py` | (script) | Manual | — |

The last two are one-off scripts, **not** cloud functions — they live in the `functions/` directory but aren't deployable. Move or rename to clarify.

### Firestore collections (as seen in rules + code)
`leads` · `users` · `projects` · `inventory` · `project_schemas` · `crm_config` · `marketing_teams` · `whatsapp_send_locks` · `processed_events`

---

## 2. Test coverage baseline

**Result: zero application tests exist.**

- No `*.test.*` / `*.spec.*` files anywhere in `CRM/` or `docs/`
- No `__tests__` directories
- No test runner configured in `package.json` (`"lint": "eslint"` is the only check)
- `playwright` is installed but no `playwright.config.*` and no `tests/` directory
- Firebase Emulator is not configured (`firebase.json` has only rules, no `emulators` block)

### Coverage matrix (what *should* be tested, vs what is)

| Feature area | Critical paths | Tested? |
|---|---|---|
| **Firestore rules** | Per-role CRUD for every collection; CP owner_uid scoping; digital_marketing `campaigns`-only field write | **No** |
| **Auth flow** | First-user bootstrap; devensuji@gmail.com self-heal; pending-user migration; placeholder redirects; AuthGuard route caps | **No** |
| **Leads** | Create/update/delete; owner_uid stamping; activity log append; callback schedule; lane moves; CSV import parsing | **No** |
| **WhatsApp pipeline** | Fingerprint dedup; lock acquisition; opt-out gate; 5km geo gate; template substitution | **No** |
| **Property matcher** | Threshold logic; resolveInterests; diagnoseMatches; dismiss state | **No** |
| **Projects & campaigns** | CRUD; campaigns tab field-level write rule | **No** |
| **Admin console** | Role changes (with superadmin guardrails); active toggle; pending user creation | **No** |
| **Dashboard metrics** | `computeInternalMetrics`, `computeTimeSeries` correctness | **No** |
| **API routes** | `/api/polish-note`, `/api/geocode`, `/api/resolve-map-url` | **No** |

---

## 3. Tech debt top-N

### 3.1 Oversized files (fix by splitting)
- **`app/page.tsx` — 2273 lines.** Contains Leads page, Kanban setup, property matching wiring, *and* inline `AddLeadModal`, `ImportCSVModal`, `LeadDetailModal`, `CallLogModal`, `ScheduleCallbackModal`, `WhatsAppSendModal`. At least 6 separate components to extract.
- **`app/admin/page.tsx` — ~1500 lines after Exotel removal.** All admin tabs (KanbanLanes / WhatsApp / AI Settings / Team / Branding / CardColors / Marketing Teams) in one file. Each should be its own file (most have `function XxxTab()` boundaries already).
- **`components/projects/ProjectUnitsTab.tsx` — 764 lines.** Subscribe + inline forms + table.

### 3.2 Escape hatches (`as any`, `@ts-ignore`)
8 occurrences across 4 files:
- `lib/utils/dashboardMetrics.ts` (3) — likely around Firestore Timestamp handling
- `components/dashboard/InternalDashboard.tsx` (2) — `(u as any).id` pattern for legacy doc IDs
- `components/projects/ProjectUnitsTab.tsx` (2)
- `components/ui/LocationAutocomplete.tsx` (1) — Google Maps callback typing

Not huge, but each one hides a potential runtime bug. Triage in Phase 4.

### 3.3 Logging noise
84 `console.*` calls across 24 files (23 in `app/admin/page.tsx`, 22 in `app/page.tsx`). Acceptable for dev, but should be swapped for a structured logger with a `production: silent` mode before launch.

### 3.4 Duplicated logic
- **Lead ownership filtering.** Same `ownLeadsOnly` + `useMemo` filter pattern lives in `app/page.tsx`, `app/dashboard/page.tsx` (twice, in both CP and team views). Should be a hook, e.g. `useScopedLeads()`.
- **Firebase SDK version pinning.** `firebase@12.11.0` is one minor behind the version that shipped the `INTERNAL ASSERTION FAILED (ID: ca9)` fix some users report on v12.12+. Track this.

### 3.5 TODOs in code
The previous secret-migration TODO for Gemini and WhatsApp config was remediated on 2026-04-26 in dashboard code and Firestore rules. Remaining work is operational: rotate leaked/legacy credentials, set runtime secrets, delete old Firestore fields, and purge leaked Git history.

### 3.6 Misc
- **Empty `public/` directory** — Next.js default assets deleted, never replaced. Harmless.
- **`history/CRM.txt`** — looks like a leftover conversation transcript. Candidate for removal (see §5).
- **`app/admin/projects/`** — empty directory. Delete.
- **`app/admin/schema/page.tsx`**, **`app/admin/fields/page.tsx`** — thin redirect shims to `/admin?tab=…`. Consider whether to keep (bookmarks) or fold into root `AuthGuard`.

---

## 4. Security posture top-N

### 4.1 Secrets stored in Firestore (HIGH) — REMEDIATED IN CODE
As of 2026-04-26, dashboard code no longer stores Gemini or WhatsApp credentials in `crm_config/*`, Admin UI no longer accepts those secrets, and Firestore rules restrict `crm_config/ai` and `crm_config/whatsapp` reads to Admin/SuperAdmin.

**Remaining operational cleanup:** rotate any credential that was ever stored in Firestore or GitHub, set `GEMINI_API_KEY` / `WHATSAPP_ACCESS_TOKEN` in the server environment, delete legacy `crm_config/ai.api_key` and `crm_config/whatsapp.access_token` fields from production Firestore, and purge leaked Git history.

### 4.2 API routes have no caller verification (HIGH) — REMEDIATED IN CODE
`/api/geocode`, `/api/resolve-map-url`, and `/api/polish-note` now require an active CRM user, validate payload size/shape, and enforce per-user rate limits before calling Google/Gemini services.

### 4.3 Users can update their own doc without field guards (MEDIUM) — REMEDIATED IN CODE
Self-updates are now limited to display-only fields (`name`, `photo_url`). Browser clients cannot change their own `role`, `active`, or other privileged user fields. Browser first-user bootstrap writes are also blocked; the Admin SDK login resolver owns bootstrap and pending-user migration.

### 4.4 WhatsApp token sent from the browser (HIGH) — REMEDIATED IN CODE
WhatsApp sends now go through server routes. The browser no longer receives or attaches the WhatsApp access token, and Firestore rules restrict `crm_config/whatsapp` reads to Admin/SuperAdmin.

### 4.5 ~~Client-side Exotel credentials~~ — REMEDIATED 2026-04-21
Exotel click-to-call has been removed from the codebase (dashboard + Cloud Function). Calls are now manual. No credentials pass through the browser.

### 4.6 No input validation on API routes (MEDIUM)
All three routes do minimal `typeof x !== 'string'` checks. No length limits, no schema validation (Zod isn't installed). Partly mitigated by Google/Gemini rejecting garbage, but `/api/polish-note` accepts up to 4000 chars that get concatenated into a prompt — prompt-injection surface.

### 4.7 Firestore rules vs UI mismatches (MEDIUM)
Major mismatches closed during Security Audit Pass 2:
- `inventory` reads are project-scoped; Channel Partners can read only inventory for assigned projects.
- Sales Exec lead visibility is enforced in Firestore rules, not only in the UI.
- Reverse-match buyer snapshots, demand-gap reports, marketing teams, audit logs, and call recordings are restricted to Admin/SuperAdmin where the data contains cross-team or sensitive buyer intelligence.
- `marketing_teams` read — same. Tighten to roles that actually need it (admin, sales_exec, digital_marketing).

### 4.8 WhatsApp webhook auth (LOW)
`lead_ingestion_webhook` validates a shared secret via header. That pattern is fine for internal webhooks but **Meta's WhatsApp webhook signs requests with HMAC-SHA256** (`X-Hub-Signature-256`). We don't have an inbound WhatsApp webhook yet, but if/when added, must verify the signature, not just a shared key. See `docs/WhatsAppHardening.md`.

### 4.9 No CSP / security headers
`next.config.ts` is default. No `Content-Security-Policy`, no `Strict-Transport-Security`, no `X-Frame-Options`. Mitigation: add via `next.config.ts` `headers()`.

### 4.10 Dependencies
- `playwright: 1.59.1` in dependencies — moving to `devDependencies` would trim production image.
- `firebase` and `firebase-admin` both in the dashboard bundle. `firebase-admin` is server-side only; confirm no client-side import path pulls it in.

---

## 5. Dead / duplicate files

### Confirmed safe to delete
- `history/CRM.txt` — leftover transcript, not referenced.
- `app/admin/projects/` (empty directory).

### Investigate before deleting
- `app/admin/schema/page.tsx`, `app/admin/fields/page.tsx` — redirect-only shims. Decision point: keep for backwards-compat bookmarks or remove.
- `functions/inventory_cleanup/`, `functions/lead_cleanup/` — one-off scripts masquerading as functions dirs. Move to `CRM/scripts/` to match `seed_inventory.py`, `add_lead.py`.

### NOT dead (confirmed via grep)
- `components/LeadDetailPopover.tsx` — used by `KanbanCard.tsx`.
- `components/ui/ImageUpload.tsx` — used by `app/admin/page.tsx`.
- Both initially looked orphaned; call-sites exist.

---

## 6. Visualized logic map (quick)

```
[Google Sign-In]
     │
     ▼
AuthContext  ──► self-heal devensuji@gmail.com → superadmin
     │        ──► first-user bootstrap → superadmin
     ▼
AuthGuard  ──► role-gated route access (ROUTE_CAPS)
     │        ──► placeholder roles (hr, payroll_finance) → /coming-soon
     ▼
Pages
 ├─ /           LeadsPage          (kanban, lead modals, property match)
 ├─ /dashboard  DashboardPage      (CP view vs TeamView)
 ├─ /projects   UnifiedProjectsPage (overview, schema, units, campaigns)
 ├─ /admin      AdminConsolePage   (8 tabs)
 └─ /coming-soon placeholder roles

Realtime listeners  ──►  Firestore  ◄── Cloud Functions
                             │             ├─ match_lead          (onUpdate)
                             │             ├─ on_lead_match_update (onUpdate → WhatsApp)
                             │             ├─ lead_ingestion_webhook (HTTP, Secret-Manager key)
                             │             └─ check_site_visit_reminders (cron)
                             ▼
                      Firestore rules enforce RBAC
```

---

## 7. Recommended priorities for Phase 2

Driven by the highest-impact findings above, in order:

1. **Firestore rules tests** (§2, §4.3, §4.7) — Vitest + Firebase emulator. One file covering every role × every collection. Biggest leverage: it locks RBAC as a contract.
2. **Permissions matrix unit test** (`can(role, capability)`) — pure function, no infra. 30 minutes.
3. **Auth flow tests** — first-user bootstrap, self-heal, AuthGuard redirects.
4. **Server-side migration of WhatsApp send** (§4.4) — blocked on new WhatsApp number; see `docs/WhatsAppHardening.md`. Phase 5 in the plan, but lands before Phase 5 when the new number arrives.
5. **API route hardening** (§4.2, §4.6) — ID-token verify + Zod schemas.
6. **Secret Manager migration for AI / WhatsApp config** (§4.1) — removes the "any user can read secrets" class of bug.

Everything else — dead-file cleanup, oversized-file splits, duplicated-hook extraction — is lower risk and can happen in later phases.

---

## 8. What this report is NOT

- Not a threat model. Phase 5 produces that.
- Not an exhaustive dead-code check (ts-prune / depcheck not run; manual grep only). Phase 4 does the thorough pass with tests backing it.
- Not a dep-vulnerability scan (no `npm audit` output here). Phase 5 includes `npm audit` + fixes.

Nothing in this report has modified the codebase.
