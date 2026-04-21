# Phase 3 — Feature Coverage Sweep

_Started: 2026-04-21_
_Owner:_ devensuji@gmail.com

Per [docs/TechDebtAndSecurityPosture.md](./TechDebtAndSecurityPosture.md) Phase 3, this doc records per-area test coverage: what's covered, what's deliberately skipped, and what's a known gap.

Each session adds one section. The rule is: if a gap isn't recorded here, it's not "deliberately skipped" — it's just missed.

---

## Session 1 (2026-04-21): Dashboard metrics

**File tested:** [`lib/utils/dashboardMetrics.ts`](../CRM/elite-build-dashboard/lib/utils/dashboardMetrics.ts) — 399 lines, four pure functions driving every chart on the dashboard.

**Test file:** [`tests/unit/dashboardMetrics.test.ts`](../CRM/elite-build-dashboard/tests/unit/dashboardMetrics.test.ts) — 35 tests, ~0.2s total.

### What's covered

- **`computeMarketingMetrics`**
  - Empty-input safety (all divide-by-zero fields return 0, not NaN).
  - Source filtering: only leads whose `source` is in `team.sources` contribute.
  - CPL = `monthly_spend / totalLeads`.
  - Cost-per-site-visit uses `Site Visit + Booked + Closed` as the SV+ funnel.
  - `rejectionRate` = `rejected / total × 100`.
  - `leadQualityScore` uses audited leads as the denominator (not total), so pre-audit leads don't drag it down.
  - Source/campaign/project breakdowns are sorted descending by count.
  - Campaign attribution requires `lead.utm.campaign` to be present (leads without UTM are not counted).

- **`computeInternalMetrics`**
  - Empty-input safety.
  - `filterUid` scopes to a single assignee (used for individual-user drill-downs).
  - Terminal statuses (`Closed`, `Rejected`) are excluded from `pipelineValue`.
  - Speed-to-lead reads the first `call` entry from `activity_log`.
  - `avgClosingCycleDays` only averages closed leads that have both `created_at` and `lane_moved_at`; closed leads missing either are excluded.
  - Aging leads: >48h since last activity, terminal statuses excluded, capped at 10 entries, sorted desc by `hoursStuck`.
  - `callsThisWeek` uses the ISO-week start (Monday) — pins behavior with `vi.setSystemTime(2026-04-20 Monday)`.
  - `avgTalkTimeMins` averages `call_duration` across every call entry, in seconds, rounded to minutes.
  - `leadToSVRatio` excludes `Rejected` from the denominator (so a high rejection count doesn't suppress the ratio).

- **`computeTimeSeries`**
  - Bucket counts: daily=30, weekly=12, monthly=12, yearly=5.
  - Leads older than the oldest bucket are silently dropped (no error).
  - Buckets are returned in ascending chronological order.
  - `revenue` is only incremented for `Closed` leads; `siteVisits` counts `Site Visit + Booked + Closed`.
  - `filterUid` scopes correctly.
  - **Non-obvious behavior pinned:** call entries are bucketed by the _call's_ timestamp, not the lead's `created_at`. This matters for CSV-imported historical leads — a regression here would attribute every historical call to today.

- **`computeLeaderboard`**
  - Inactive users excluded.
  - `viewer` role excluded.
  - Sort order: `leadsClosed` desc, with `pipelineValue` desc as tiebreaker.
  - Terminal statuses excluded from `pipelineValue`.
  - `callsThisWeek` uses ISO-week start.

### Deliberately skipped

- **`formatDateKey` / `generateBuckets`** (internal, not exported) — covered transitively through `computeTimeSeries` tests. A direct test would just re-encode their implementation; if they break, the public-function tests catch it.
- **Timezone edge cases around `startOfWeek`** — the function reads the machine's local timezone (`d.getDay()`, etc.). Fixing it to always use Asia/Kolkata is a Phase 4 cleanup candidate (and would likely surface a real bug: the dashboard runs in the user's browser timezone but backend-imported dates are UTC). Pinned the current-behavior-under-UTC-fake-time here rather than paper over the issue.
- **Interaction with real Firestore Timestamp serialization** — covered by the rules suite, not this unit file. The tests build `Timestamp` via `Timestamp.fromDate` which matches prod behavior for both `.toDate()` and `.toMillis()`.

### Known gaps surfaced during coverage (not blocking Phase 3)

1. **Local-time-sensitive `startOfWeek`** — will behave differently depending on which timezone the user's browser reports. Worth a Phase 4 fix to pin to Asia/Kolkata explicitly.
2. **No coverage of `AnimatedCharts.tsx` / `InternalDashboard.tsx` / `MarketingDashboard.tsx`** — these are view components that consume the helpers. Their correctness is mostly rendering, not logic; Phase 6 (Playwright) is the right layer for them.
3. **`project.priceRange` and `project.totalUnits` are never recomputed anywhere**, even when units change. Flagged during the survey; not a dashboard-metrics bug, but worth its own follow-up.

### What this buys us

Before this session: 0% coverage on dashboard math — a silent bug in revenue/pipeline calc would reach a leadership view with no signal.
After: every chart's number has at least one pin, and the non-obvious behaviors (audited-only LQS denominator, SV+ funnel definition, call-bucket attribution, Rejected exclusion from SV ratio) are locked.
