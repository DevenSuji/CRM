# Progress Log — 20 April 2026

Summary of changes shipped, decisions made, and work still open.

---

## 1. Kanban Swim Lane Reorder

**Goal:** move Lead Nurturing to the 3rd lane and Property Matched to the 4th lane, without breaking the logic either lane currently drives.

**Changes shipped:**
- [`config.ts:18-25`](../../CRM/elite-build-dashboard/lib/types/config.ts#L18-L25) — swapped `order` of `nurturing` (now 2) and `property_matched` (now 3) in `DEFAULT_KANBAN_CONFIG`.
- [`page.tsx:84-89`](../../CRM/elite-build-dashboard/app/page.tsx#L84-L89) — backfill logic now inserts a missing Property Matched lane *after* Nurturing (falls back to First Call → New if Nurturing is absent).
- [`page.tsx:675`](../../CRM/elite-build-dashboard/app/page.tsx#L675) — `STATUS_OPTIONS` array reordered to match.

**Not touched:** `usePropertyMatching.ts` — the auto-match and auto-move logic operates on status strings, not lane ordering, so reordering is purely cosmetic to the matcher.

**Known caveat:** users with a previously-saved `kanbanConfig` in Firestore keep their old order until they edit the config (or it is reset). The default only applies when no saved config exists.

---

## 2. Property Matching Explainer Document

**Goal:** write a plain-English doc describing the property-match algorithm.

**Shipped:** new file [`PropertyMatchingExplained.md`](../PropertyMatchingExplained.md) covering:
- What the engine needs from a lead (interests, budget, status).
- The five matching gates (type, availability, price-with-threshold, BHK floor for Apartment/Villa/Individual House, dismissals).
- The threshold slider (global + per-lead override).
- Project grouping and distance-then-price ranking.
- Auto-lane-move rules.
- 2-second debounced execution.
- The "Why didn't this match?" diagnostic.
- A full pseudocode block.
- The rejection flow (sales associate untags → dismissed list → re-evaluation → move to Nurturing if last match).

Pseudocode and doc were iterated on together:
- User's draft had `Budget ≤ Unit Price + 5%` — flagged as backwards; corrected to `Unit Price ≤ Budget × (1 + threshold%)`.
- Added explicit Availability, BHK, and dismissal gates that the user's draft omitted.
- Clarified BHK rule: a 3 BHK lead matches 3 / 4 / 5 BHK units (bigger is fine), never smaller.

---

## 3. Kanban Board — Fit-To-Window Toggle

**Goal:** add a toggle so all swim lanes fit in a single viewport when switched on; horizontal scroll when off.

**Changes shipped:**
- [`page.tsx`](../../CRM/elite-build-dashboard/app/page.tsx) — added `Maximize2` / `Minimize2` icon imports, `fitToWindow` state (persisted to `localStorage` under key `leads_fit_to_window`), a toggle button in the page header next to the threshold slider.
- [`KanbanBoard.tsx`](../../CRM/elite-build-dashboard/components/KanbanBoard.tsx) — accepts `fitToWindow` prop; switches the board container between `overflow-x-auto` and `overflow-x-hidden`.
- [`KanbanLane.tsx`](../../CRM/elite-build-dashboard/components/KanbanLane.tsx) — accepts `fitToWindow` prop; swaps lane width between fixed (`min-w-[300px] w-[300px] flex-shrink-0`) and fluid (`flex-1 min-w-0`).

**Behavior with lane count changes:** fluid mode auto-redistributes width as lanes are added or removed. Fixed mode keeps each lane at 300px regardless of count, widening or narrowing the total scrollable width. No code change is needed when the admin adds/removes lanes — the map over `sortedLanes` handles it.

---

## 4. Property-Match Algorithm: Doc-vs-Code Audit & Fixes

**Goal:** after user requested Nurturing leads also participate in auto-match, 5% default threshold, 5 km geo gate, auto-fire WhatsApp, and activity logging, we did a full audit of the existing code against the updated doc.

### Mismatches found and fixed today

| # | Claim in doc | Before | After |
|---|---|---|---|
| 1 | Nurturing is eligible for auto-match | Skipped | Included ([`usePropertyMatching.ts:168,274`](../../CRM/elite-build-dashboard/lib/hooks/usePropertyMatching.ts#L168)) |
| 2 | Auto-move to Property Matched covers Nurturing | Only New / First Call | Now New / First Call / Nurturing ([`usePropertyMatching.ts:338`](../../CRM/elite-build-dashboard/lib/hooks/usePropertyMatching.ts#L338)) |
| 3 | When last match dries up, move to Nurturing | Moved to New | Moves to Nurturing ([`usePropertyMatching.ts:346`](../../CRM/elite-build-dashboard/lib/hooks/usePropertyMatching.ts#L346)) |
| 4 | Default threshold 5% | 20% | 5% ([`config.ts:130`](../../CRM/elite-build-dashboard/lib/types/config.ts#L130)) |
| 5 | Doc's "Matching Rules" table + "Auto-Moving" section | Said 20% + New-only re-home | Updated in [`PropertyMatchingExplained.md`](../PropertyMatchingExplained.md) |

**Behavior side-effect to be aware of:** existing leads in Firestore with status `Nurturing` will now start getting auto-matched on the next matcher tick. If a specific lead should stay parked, a future "opt-out of auto-match" flag may be needed.

### Mismatches found and *not yet* fixed

| # | Claim in doc | Current code | Decision |
|---|---|---|---|
| 6 | 5 km geo gate on project location | Distance is computed but only used for ranking, never as a filter | **User chose lenient:** skip the gate when either lead or project has no `geo`. Pending implementation. |
| 7 | Auto-fire WhatsApp on match | WhatsApp send is a manual button in `LeadDetailModal` ([`page.tsx:980`](../../CRM/elite-build-dashboard/app/page.tsx#L980)) | **User chose Cloud Function + server-side lock.** Design below. Pending implementation. |
| 8 | Activity log entry on auto-send | Activity log fires only on manual send | Ships as part of item 7. |

---

## 5. Next Build — Cloud-Function-Driven Auto-WhatsApp

**Design agreed with the user:**

- **New Cloud Function `onLeadMatchUpdate`**, triggered by Firestore `onDocumentUpdated` on `leads/{leadId}` when `interested_properties` or `status` changes.
- **Server-side lock** at `whatsapp_send_locks/{leadId}` with a 60-second TTL, acquired transactionally, to prevent concurrent sends across browser tabs / users / function retries.
- **Dedup via fingerprint**: a hash of the current system-matched project IDs stored on the lead as `last_sent_match_fingerprint`. The function sends only when the fingerprint changes.
- **Message format**: a Meta-pre-approved WhatsApp **template** (MARKETING category). Templates are required because freshly-captured leads are almost always outside the 24-hour free-form messaging window. Manual "Send Property Details" button keeps using rich free-form text for post-reply conversations.
- **Secret Manager**: the WhatsApp access token moves out of `crm_config/whatsapp` in Firestore into Google Secret Manager, read by the Cloud Function. (Matches the security-hardening task already tracked in memory.)
- **Activity log**: on successful send, append `{ type: 'whatsapp_sent', sent_by: 'system-match', projects: [...], created_at: <ISO> }` to the lead's `activity_log`.
- **Failure handling**: v1 writes failures to a `whatsapp_send_failures` collection (admin-review only); does **not** update fingerprint on failure so the next matcher-triggered write re-attempts. No exponential-backoff retry inside the function — simpler and the matcher re-fires often enough.
- **Client-side matcher**: unchanged. Continues to compute and write `interested_properties`; the Cloud Function observes and sends.

### Open questions to answer before coding starts

1. Is there already a `functions/` folder / Firebase Functions deploy setup in this repo? (Not seen in files read so far.) Decide: Firebase Functions Gen 2, Node 20, TypeScript — confirm.
2. User registers the WhatsApp MARKETING template with Meta Business Manager (1–2 day approval). User sends back the approved template name + variable order.
3. Confirm lead opt-in for WhatsApp marketing is covered by the Meta-Ad lead-form consent. If not, where is opt-in tracked?
4. Failure visibility in v1: silent log in `whatsapp_send_failures` (admin-only), OR badge on lead card. User's preference pending.

### Scoping

- The **5 km geo gate (item 6)** is ~3 lines in the existing matcher and can ship independently of the Cloud Function.
- The **Cloud Function (items 7 + 8)** is new infra and blocked on template approval. Should be a separate PR.

---

## 6. Related Observations from This Session

- The [`PropertyMatchingExplained.md`](../PropertyMatchingExplained.md) doc currently has an internal inconsistency: the "Auto-Moving Between Lanes" section says "manual tags are preserved". User mentioned wanting to change this (drop manual tags entirely) but set it aside — "I'll work on the algorithm later". Leaving as-is until revisited.
- Memory was not updated today because current memory already covers the Secret Manager migration and activity-timestamp requirements that overlap with this work. A new memory entry may make sense once the Cloud Function ships, to record the new architecture.

---

## Quick Reference — Files Touched Today

- [`CRM/elite-build-dashboard/lib/types/config.ts`](../../CRM/elite-build-dashboard/lib/types/config.ts) — lane reorder, default threshold 20 → 5
- [`CRM/elite-build-dashboard/app/page.tsx`](../../CRM/elite-build-dashboard/app/page.tsx) — status options order, backfill logic, fit-to-window toggle UI + state
- [`CRM/elite-build-dashboard/components/KanbanBoard.tsx`](../../CRM/elite-build-dashboard/components/KanbanBoard.tsx) — fit-to-window prop + container overflow
- [`CRM/elite-build-dashboard/components/KanbanLane.tsx`](../../CRM/elite-build-dashboard/components/KanbanLane.tsx) — fit-to-window prop + width classes
- [`CRM/elite-build-dashboard/lib/hooks/usePropertyMatching.ts`](../../CRM/elite-build-dashboard/lib/hooks/usePropertyMatching.ts) — Nurturing eligibility, auto-move destinations, diagnostic text
- [`docs/PropertyMatchingExplained.md`](../PropertyMatchingExplained.md) — new file, iterated through the day
