# Codex Execution Plan — Elite Build AI CRM

_Created:_ 2026-04-24  
_Owner:_ EliteBuild Infra Tech / Codex  
_Scope:_ `/Users/devensuji/Documents/github/CRM`  
_Primary app:_ `/Users/devensuji/Documents/github/CRM/CRM/elite-build-dashboard`  
_Goal:_ turn the existing CRM into the operational backbone for real estate sales, where AI continuously matches properties to buyers, guides sales actions, improves conversion, and protects production data.

---

## 1. North Star

Elite Build CRM should become the command center for the company:

1. **Every lead is captured automatically** from Meta Ads, Google Ads, websites, walk-ins, channel partners, and future sources.
2. **Every property and unit is structured inventory** with price, location, type, BHK/plot details, media, legal status, availability, and campaign attribution.
3. **Every lead is matched to the best available properties automatically** with an explainable score and ranked recommendations.
4. **Every property can show its best-fit buyer list** so sales can move inventory proactively, not just react to incoming leads.
5. **Every sales associate gets AI-guided next actions**: whom to call, what to say, what property to pitch, and when to follow up.
6. **Every communication is logged and summarized** across WhatsApp, calls, notes, site visits, and future email/SMS.
7. **Every owner/manager sees the truth**: pipeline health, leakage, project demand, campaign ROI, associate performance, booking probability, and forecasted revenue.
8. **Every production risk is controlled**: secrets, permissions, audit trails, backups, monitoring, rules tests, and safe deployments.

---

## 2. Current Ground Truth

This is already a real internal CRM, not a public marketing SPA.

1. **Dashboard exists** with Leads, Dashboard, Projects, Admin Console, login, and role-based access.
2. **Lead pipeline exists** with Kanban lanes including New, First Call, Nurturing, Property Matched, Site Visit, Booked, Closed, and Rejected.
3. **Property matching exists** in the dashboard via `lib/hooks/usePropertyMatching.ts` and `lib/utils/propertyMatcher.ts`.
4. **Inventory exists** through Projects → Units, with dynamic project/unit schema fields.
5. **WhatsApp exists** for property details and site-visit messaging, but browser-side token exposure must be fixed.
6. **AI exists in pieces**: note polishing in the dashboard and lead audit/matching concepts in Cloud Functions.
7. **RBAC exists** across UI and Firestore rules, but some rules still need hardening.
8. **Tests exist** for unit logic and Firestore rules; more production and E2E coverage is needed.

---

## 3. Execution Principles

1. **Protect revenue paths first.** Matching, lead routing, WhatsApp sends, and bookings are more important than cosmetic cleanup.
2. **Make AI explainable.** Every AI score must show reasons, inputs, confidence, and recommended action.
3. **Keep humans in control.** AI can suggest, rank, draft, and automate safe flows; sales/admin users must be able to override.
4. **Prefer server authority.** Critical actions must not depend on a browser tab being open.
5. **No silent magic.** Automated moves, messages, assignments, and matches must write activity logs.
6. **Security before scale.** Secrets, role rules, and API auth must be hardened before widening access.
7. **Ship in thin vertical slices.** Each phase must leave the CRM better and usable, not half-rewritten.

---

## 4. Phase 1 — Matching Engine V2

### 1.1 Add a scored, explainable match contract

1. Extend match results with:
   - `score` from 0 to 100.
   - `reasons` explaining why the project matched.
   - best price and available unit count.
   - distance when lead/project geo exists.
2. Keep current hard gates:
   - lead must have interest and budget.
   - unit type must match lead interest.
   - unit must be `Available`.
   - unit price must be within budget + threshold.
   - BHK must meet or exceed lead BHK for Apartment, Villa, and Individual House.
   - dismissed projects must stay excluded.
3. Rank matches by:
   - higher score first.
   - closer distance when scores are close.
   - lower best price as final tie-breaker.
4. Store reasons on system-matched property tags so sales can see why a match exists.
5. Add tests for score, reasons, ranking, and backward compatibility.

### 1.2 Make matching server-authoritative

1. Replace the legacy `functions/match_lead/main.py` matching logic with the same V2 contract.
2. Trigger matching on:
   - lead created.
   - lead preference changed.
   - inventory created/updated.
   - project geo/type changed.
   - global match threshold changed.
3. Ensure dashboard hook becomes display/diagnostic support, not the only writer.
4. Write a match fingerprint to prevent duplicate updates and duplicate WhatsApp sends.
5. Write activity log entries for automated match changes.

### 1.3 Add reverse matching

1. Add “Best Buyers” for each project/unit.
2. Rank leads for a project by:
   - property type fit.
   - budget fit.
   - location proximity.
   - urgency.
   - recency and engagement.
   - sales status.
3. Show “why this buyer” explanations.
4. Add project-level action: “Create call list from best buyers.”

### 1.4 Add no-match intelligence

1. For leads with no matching property, identify why:
   - no inventory in type.
   - budget too low.
   - location mismatch.
   - BHK mismatch.
   - all matching projects dismissed.
2. Create a “Demand Gap” report for management:
   - what buyers want but inventory does not satisfy.
   - price ranges with unmet demand.
   - localities with unmet demand.
   - project types requested most often.

---

## 5. Phase 2 — Lead Routing, Follow-Up, and Sales Automation

1. Add duplicate detection and merge:
   - normalized phone.
   - email.
   - WhatsApp number.
   - fuzzy name + phone fallback.
2. Add automatic lead assignment:
   - source/project based.
   - round-robin.
   - workload balancing.
   - role/team/language/territory rules.
3. Add SLA timers:
   - time to first call.
   - stale lead alerts.
   - no-follow-up alerts.
   - missed callback escalation.
4. Add task engine:
   - call due.
   - WhatsApp due.
   - site visit confirmation due.
   - post-site-visit follow-up.
5. Add automated nurture sequences:
   - new lead welcome.
   - property match.
   - no-response follow-up.
   - site visit reminder.
   - post-visit objection handling.
   - reactivation for old leads.

---

## 6. Phase 3 — Communications Platform

1. Move all WhatsApp sending to server-side routes or Cloud Functions.
2. Move WhatsApp access token to Secret Manager and rotate the old token.
3. Add inbound WhatsApp webhook:
   - verify Meta signature.
   - store inbound messages.
   - update lead activity.
   - create tasks from buyer replies.
4. Add WhatsApp inbox inside CRM:
   - lead timeline.
   - unread status.
   - templates.
   - opt-out handling.
5. Add call intelligence:
   - call log structure.
   - call recording ingestion when telephony provider is ready.
   - transcription.
   - summary.
   - objections.
   - next action.
6. Add communication compliance:
   - consent fields.
   - opt-out enforcement.
   - audit logs.
   - rate limits.

---

## 7. Phase 4 — AI Sales Copilot

1. Lead score:
   - buying urgency.
   - budget realism.
   - engagement.
   - property fit.
   - source quality.
   - closure probability.
2. Next-best-action:
   - call now.
   - send property details.
   - schedule site visit.
   - ask budget clarification.
   - revive with new inventory.
3. Sales script generator:
   - based on lead profile.
   - property match.
   - objections.
   - language/tone.
4. Conversation summarizer:
   - notes.
   - calls.
   - WhatsApp threads.
   - site visit outcomes.
5. Objection handling:
   - price concern.
   - location concern.
   - legal/RERA concern.
   - family decision delay.
   - loan/payment concern.
6. Natural-language CRM search:
   - “show leads above 80L stuck in nurturing for 7 days.”
   - “show buyers for villas near Sarjapur.”
   - “which campaigns produced site visits this month?”
7. Forecasting:
   - booking probability.
   - monthly revenue forecast.
   - inventory burn-down.
   - associate targets.
8. AI-generated daily briefing:
   - hot leads.
   - overdue actions.
   - newly matched buyers.
   - inventory opportunities.

---

## 8. Phase 5 — Management Intelligence

1. Improve internal dashboard:
   - speed to lead.
   - associate conversion.
   - aging leads.
   - leakage by lane.
   - booking velocity.
2. Improve marketing dashboard:
   - CPL.
   - cost per site visit.
   - campaign quality.
   - source-to-booking funnel.
   - project demand heatmap.
3. Add inventory dashboard:
   - unsold inventory.
   - hot inventory.
   - stale inventory.
   - best buyer count per project.
   - price-band demand.
4. Add executive forecast:
   - expected bookings.
   - probable revenue.
   - campaign ROI.
   - team bottlenecks.

---

## 9. Phase 6 — Security, Production Readiness, and QA

1. Move secrets out of Firestore:
   - Gemini API key.
   - WhatsApp token.
   - future app secrets.
2. Harden Firestore rules:
   - prevent user self-promotion.
   - restrict `crm_config` reads by document sensitivity.
   - restrict storage writes by role.
3. Harden API routes:
   - verify Firebase ID token.
   - add schema validation.
   - add rate limits.
   - add App Check where practical.
4. Add security headers:
   - CSP.
   - HSTS.
   - frame protections.
5. Add observability:
   - structured logging.
   - function failure alerts.
   - WhatsApp send failure queue.
   - dashboard error monitoring.
6. Add backup/export:
   - scheduled Firestore export.
   - lead/inventory CSV export.
   - recovery runbook.
7. Add CI gates:
   - unit tests.
   - rules tests.
   - build.
   - lint warning budget.
   - targeted E2E smoke tests.

---

## 10. Phase 7 — UX, Mobile, and Scale

1. Split oversized files:
   - Leads page modals.
   - Admin tabs.
   - Project units tab.
2. Add mobile-first field sales views:
   - today’s calls.
   - lead detail.
   - property pitch sheet.
   - site visit schedule.
3. Add faster navigation:
   - global command menu.
   - saved filters.
   - smart search.
4. Add role-specific home screens:
   - owner.
   - sales associate.
   - digital marketing.
   - channel partner.
5. Add onboarding/admin setup wizard:
   - company branding.
   - first project.
   - inventory import.
   - WhatsApp setup.
   - users and roles.

---

## 11. Execution Log

### 2026-04-24

1. Created this plan.
2. Completed the first Phase 1.1 slice:
   - added match `score` and `reasons` to the pure matching engine.
   - stored `matchScore` and `matchReasons` on system-matched lead property tags.
   - surfaced match score and first reason in the Lead Detail tagged-property UI.
   - included inventory/project fingerprints so new or changed inventory can refresh matches instead of being skipped by the processed-lead cache.
   - added property matcher tests for score, reasons, price-stretch penalty, and score-first ranking.
3. Validation completed:
   - `npm test -- tests/unit/propertyMatcher.test.ts`
   - `npm test`
   - `npm run build`
   - focused lint completed with warnings only in existing files.
4. Resumed Phase 1.2 with the first server-authoritative slice:
   - replaced the legacy `functions/match_lead/main.py` budget/location/facing matcher with the V2 scored matcher contract used by the dashboard.
   - server matcher now writes `interested_properties` system-match tags with `matchScore`, `matchReasons`, `matchedUnitCount`, `bestPrice`, and optional `distanceKm`.
   - server matcher now persists `last_match_fingerprint`, keeps `suggested_plot` in sync for legacy UI reads, and writes an activity-log entry for automated match changes.
   - aligned `functions/on_lead_match_update/main.py` fingerprint dedup with the richer V2 match payload so score/reason/distance changes are treated as distinct match sets.
5. Validation completed for the server slice:
   - `python3 -m py_compile CRM/functions/match_lead/main.py CRM/functions/on_lead_match_update/main.py`
6. Continued Phase 1.2 trigger coverage:
   - added reusable matcher helpers so the same server-side write path can be called from multiple Eventarc entry points.
   - added `rematch_leads_on_inventory_change`, `rematch_leads_on_project_change`, and `rematch_leads_on_threshold_change` handlers in `CRM/functions/match_lead/main.py`.
   - current implementation re-sweeps all eligible leads for those non-lead triggers; this is correct for behavior and a good thin slice, with lead targeting optimization left for a later pass.
7. Validation completed for the trigger slice:
   - `python3 -m py_compile CRM/functions/match_lead/main.py CRM/functions/on_lead_match_update/main.py`
   - `npm test -- tests/unit/propertyMatcher.test.ts`
8. Added rollout documentation for the new trigger handlers:
   - documented `gcloud functions deploy` commands for lead-create, inventory-update, project-update, and threshold-update matcher triggers in `README.md`.
   - documented the current rollout shape explicitly so deployment wiring is not tribal knowledge.
9. Deployed the matcher trigger slice to production (`elite-build-crm`, `asia-south1`):
   - `match-lead` updated to the new V2 server-authoritative implementation.
   - `rematch-leads-on-inventory-change`, `rematch-leads-on-project-change`, and `rematch-leads-on-threshold-change` deployed and active.
10. Live verification completed:
   - threshold trigger executed in production and logged `REMATCH_SWEEP` over eligible leads.
   - project trigger executed in production after a safe `updated_at` touch on a project doc.
   - inventory trigger deployment verified, but not force-fired with a business-impacting inventory mutation; a dedicated controlled inventory test remains optional.
11. Controlled inventory-trigger verification completed in production:
   - safely updated inventory unit `KRvsx4hmvjSvlAzU2RRN` with a non-business field (`_codex_inventory_trigger_verified_at`) to force an Eventarc update without changing pricing, status, or availability.
   - `rematch-leads-on-inventory-change` fired immediately and logged `REMATCH_SWEEP: reason=inventory:KRvsx4hmvjSvlAzU2RRN leads=12 updated=9`.
   - the same run logged multiple `MATCH_V2_UPDATED` events, confirming the inventory trigger now re-matches eligible leads end-to-end in production.
   - Phase 1.2 server-authoritative matching is now operationally verified across lead-create, project-change, threshold-change, and inventory-change paths.
12. Started Phase 1.3 reverse matching with a usable thin slice:
   - added a pure reverse-ranking utility in `CRM/elite-build-dashboard/lib/utils/reverseMatcher.ts` to rank buyers for a project or a specific unit.
   - ranking now combines existing property-match fit with urgency, recency, engagement depth, and current sales stage.
   - added explainable “why this buyer” output so sales can see both the property-fit reasons and the commercial-priority signals.
   - surfaced `Best Buyers` in the project overview and inside each selected unit detail panel.
   - added project-level `Export Call List` CSV output so sales can act on the ranked buyers immediately.
13. Validation completed for the Phase 1.3 slice:
   - `npm --prefix CRM/elite-build-dashboard test -- tests/unit/reverseMatcher.test.ts`
   - `./node_modules/.bin/tsc --noEmit` from `CRM/elite-build-dashboard`
14. Phase 1.3 moved to server-authoritative reverse matching:
   - extended `CRM/functions/match_lead/main.py` to persist `reverse_match_projects/{projectId}` and `reverse_match_units/{unitId}` snapshots.
   - lead-triggered matcher updates now refresh reverse snapshots for affected projects, while inventory/project/threshold sweeps rebuild the full snapshot layer and clean up stale docs.
   - project and unit `Best Buyers` UI now reads persisted snapshot docs instead of recomputing rankings in the browser.
   - added Firestore rules for read-only reverse snapshot access and focused rules coverage for those collections.
15. Validation and rollout completed for server-authoritative reverse matching:
   - `python3 -m py_compile CRM/functions/match_lead/main.py`
   - `npm --prefix CRM/elite-build-dashboard test -- tests/unit/reverseMatcher.test.ts`
   - `./node_modules/.bin/tsc --noEmit` from `CRM/elite-build-dashboard`
   - `npm run test:rules` from `CRM/elite-build-dashboard` passed with 178 tests.
   - redeployed `match-lead`, `rematch-leads-on-inventory-change`, `rematch-leads-on-project-change`, and `rematch-leads-on-threshold-change` in `elite-build-crm` (`asia-south1`).
   - deployed updated Firestore rules so `reverse_match_projects/*` and `reverse_match_units/*` are readable by active users and remain client-write-protected.
   - safely updated `crm_config/property_match` with `_codex_reverse_snapshot_seeded_at` to seed the first production snapshot refresh.
   - production logs confirmed `REVERSE_SNAPSHOTS_REFRESHED: reason=property_match_threshold projects=6 units=3 staleProjects=0 staleUnits=0`.
16. Started Phase 1.4 no-match intelligence:
   - extended `CRM/functions/match_lead/main.py` to classify unmatched active leads into server-persisted `no_match_intelligence/{leadId}` docs.
   - added a server-owned `demand_gap_reports/current` summary with reason breakdowns, top unmet property types, localities, budget bands, and recent unmatched leads.
   - wired the internal dashboard to show the management-facing Demand Gap report for admin and superadmin users.
   - added Firestore rules so `no_match_intelligence/*` and `demand_gap_reports/*` are readable by active users and remain client-write-protected.
17. Validation and rollout completed for Phase 1.4:
   - `python3 -m py_compile CRM/functions/match_lead/main.py`
   - `./node_modules/.bin/tsc --noEmit` from `CRM/elite-build-dashboard`
   - `npm run test:rules` from `CRM/elite-build-dashboard` passed with 204 tests.
   - redeployed `match-lead`, `rematch-leads-on-inventory-change`, `rematch-leads-on-project-change`, and `rematch-leads-on-threshold-change` in `elite-build-crm` (`asia-south1`).
   - deployed updated Firestore rules for the no-match intelligence collections.
   - safely updated `crm_config/property_match` with `_codex_demand_gap_seeded_at` to force a production refresh.
   - production logs confirmed `DEMAND_GAP_REFRESHED: reason=property_match_threshold leads=4`.
   - production snapshot check confirmed `demand_gap_reports/current.totalNoMatchLeads = 4`, with `Budget Too Low` as the top blocker and `Plotted Land` as the top unmet demand type.
