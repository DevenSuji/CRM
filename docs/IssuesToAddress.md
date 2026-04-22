# Issues to Address

Running log of known bugs and follow-ups that surfaced during development. Each entry has a short description, where it was surfaced, severity, and current status.

The rule: an issue stops being "known" and starts being "forgotten" unless it's written down. This file is that shield.

---

## Open

### 1. Property matcher runs for Channel Partners

**Surfaced:** 2026-04-22, while debugging the CP leads-page crash (missing composite index).

**What's wrong:** [lib/hooks/usePropertyMatching.ts](../CRM/elite-build-dashboard/lib/hooks/usePropertyMatching.ts) is gated only on `enabled: !leadsLoading` in [app/page.tsx](../CRM/elite-build-dashboard/app/page.tsx#L96). A Channel Partner mounting the leads page triggers the matcher, which attempts to write to `inventory` (updating `status`, stamping `booked_by_lead_id`) and to `leads` (stamping `suggested_plot`). Both writes are denied by Firestore rules for the `channel_partner` role — the matcher doesn't crash but every match attempt logs a `permission-denied` error and nothing gets matched.

**Why it matters:** silent failure. The CP sees nothing wrong, but their leads never get property-matched even if inventory exists. Inverts the intent: we built this hook to help close sales, and for the role most dependent on matches (CPs), it just logs errors.

**Fix shape:** gate the hook on a capability check — `can(role, 'manage_inventory')` or a new `can(role, 'auto_match_properties')`. Easiest fix is to add `enabled: !leadsLoading && can(crmUser?.role, 'manage_inventory')` at the call site. If the product decision is that CPs *should* get matches but rules should allow it, then the rules need updating instead.

**Priority:** Low for now — user has deprioritized CP surface. Revisit when CP experience becomes a focus.

---

### 2. Firestore indexes were not tracked in source before 2026-04-22

**Surfaced:** 2026-04-22, CP leads-page query failed because the `(owner_uid ASC, created_at DESC)` composite index didn't exist. `firestore.indexes.json` did not exist in the repo, and `firebase.json` did not reference one. All prior indexes had been created ad-hoc via the console links that Firestore emits when a query fails.

**What's fixed now:** [firestore.indexes.json](../CRM/elite-build-dashboard/firestore.indexes.json) created with the `leads(owner_uid, created_at)` index, [firebase.json](../CRM/elite-build-dashboard/firebase.json) now points at it, and `firebase deploy --only firestore:indexes` has been run against the `elite-build-crm` project.

**What's still open:** the Firebase project likely has indexes created via console that are NOT in this file. The next time we run `firebase deploy --only firestore:indexes` without `--force`, it won't touch them (additive by default), but if we ever run `firebase firestore:indexes --project ... > firestore.indexes.json` to sync, we'll discover them. Someone should do that reconciliation once to get a full snapshot.

**Priority:** Low. The declared index covers both places where a composite query exists today. Any future composite query that's missing will surface the same way this one did (query fails with a console link).

**Follow-up task:** before deploying any new composite query, add the index to `firestore.indexes.json` FIRST so we never ship a feature with a missing index to prod again.

---
