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

## 4. MVP Critical Feature Set — Release Cycle 1 Active Work

These are the must-have pillars for a world-class internal MVP. They are not “later nice-to-haves”; they should be actively worked through before the CRM is treated as production-complete.

1. **Production security, auditability, and recovery**
   - No API keys or tokens in public code, docs, browser bundles, or client-readable Firestore docs.
   - All server routes verify Firebase ID tokens unless they are signed external webhooks.
   - Sensitive routes have schema validation, payload limits, and rate-limit strategy.
   - Firestore rules prevent privilege escalation and protect sensitive config.
   - Admin and critical business actions produce audit logs.
   - Firestore backup/export and recovery runbook exist.
2. **Executive intelligence and forecasting**
   - C-suite dashboard shows speed-to-lead, pipeline leakage, booking velocity, revenue forecast, expected bookings, team bottlenecks, and campaign ROI.
   - Dashboard stays data-driven and uncluttered by operational task queues.
3. **Inventory intelligence**
   - Unsold and stale inventory views.
   - Project/unit health scores.
   - Best buyers per project/unit as an action queue.
   - Demand vs supply by price band, property type, and location.
   - “Which project needs marketing push?” recommendations.
4. **Data quality and governance**
   - Duplicate prevention everywhere leads enter the system.
   - Stage-specific required fields.
   - Missing-data warnings.
   - Structured closure, cancellation, and rejection reasons.
   - Lead source hygiene and admin cleanup tools.
5. **AI assistant layer**
   - Natural-language search across leads, tasks, projects, and inventory.
   - Daily briefing for hot leads, overdue actions, new matches, and inventory opportunities.
   - Booking probability and next-best-action explanations.
   - “Why revenue is blocked” summaries.
6. **Communication platform**
   - Parked until WhatsApp Business number / telephony are ready for end-to-end validation.
   - Must eventually include inbound/outbound timeline, delivery failures, consent/opt-out, templates, and call/email/SMS history.

### Release Cycle 2 Deferred Scope

1. **Mobile-first sales workflow**
   - Field-ready views for today’s calls, overdue tasks, lead detail, property pitch sheet, and site visit schedule.
   - One-tap call/WhatsApp actions once communication providers are ready.
   - Removed from Release Cycle 1 on 2026-04-28 to keep the first production release focused on security, intelligence, governance, auditability, and production readiness.

Immediate order of work:

1. Security hardening and backup/recovery.
2. Executive forecasting.
3. Inventory intelligence.
4. Data quality governance.
5. AI assistant expansion.
6. Communication platform after provider readiness.

---

## 5. Phase 1 — Matching Engine V2

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

## 6. Phase 2 — Lead Routing, Follow-Up, and Sales Automation

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

## 7. Phase 3 — Communications Platform

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

## 8. Phase 4 — AI Sales Copilot

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

## 9. Phase 5 — Management Intelligence

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

## 10. Phase 6 — Security, Production Readiness, and QA

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

## 11. Phase 7 — Release Cycle 2: UX, Mobile, and Scale

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

## 12. Execution Log

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

### 2026-04-26

18. Started Phase 2 with the first duplicate-detection slice:
   - added normalized duplicate keys for new leads (`phone`/WhatsApp variants, email, name).
   - added a pure duplicate-detection utility with exact phone/email matches and likely same-name/same-phone-ending matches.
   - surfaced possible duplicates in the Create Lead modal before saving a new lead.
   - added CSV duplicate preview and exact-duplicate skipping during import.
   - added unit coverage for duplicate normalization/detection and CSV duplicate-key stamping.
19. Continued Phase 2 with the first duplicate-merge workflow:
   - added an admin-only merge action in the lead detail modal.
   - current lead remains the primary record; selected duplicate history is folded into it.
   - merge preserves activity logs, site visits, callbacks, tagged properties, dismissed matches, missing contact fields, and duplicate-key metadata.
   - duplicate lead document is deleted only after the primary update is batched successfully.
   - booked-unit conflicts are blocked when both records point to different booked units; a single duplicate booking can be transferred safely to the primary lead.
   - added unit coverage for merge field precedence, timeline merging, booking transfer, and booking conflict blocking.
20. Continued Phase 2 with automatic lead assignment:
   - added a server-side assignment endpoint so sales users do not need direct access to the users collection.
   - new walk-in and CSV leads now request an assignment before saving and stamp `assigned_to` plus a `lead_assigned` activity entry.
   - assignment supports enabled/disabled mode, lowest-open-workload fallback, round-robin fallback, eligible sales executives, and source-based routing rules.
   - added a Lead Assignment tab in Admin Console to configure strategy, eligible assignees, and source rules.
   - added unit coverage for eligible assignees, workload balancing, round-robin cursor behavior, source rules, and disabled assignment.
21. Continued Phase 2 with lead SLA timers and stale alerts:
   - added configurable SLA settings for first call, missed callback grace, follow-up due, and stale-lead thresholds.
   - surfaced overdue SLA badges directly on Kanban cards so sales can see blocked follow-up work without opening each lead.
   - added a Lead SLA tab in Admin Console to tune thresholds.
   - added pure unit coverage for disabled SLA, ignored terminal statuses, first-call overdue, missed callbacks, follow-up due, and stale-lead precedence.
22. Continued Phase 2 with the first task-engine slice:
   - added deterministic task generation from first-call SLA, due callbacks, unsent property details, site visit confirmations, and post-site-visit follow-ups.
   - surfaced a dedicated Overdue Tasks page with Open and Done actions, keeping Dashboard reserved for data-driven stats.
   - task completion writes an auditable `task_completed` activity-log entry and resolves related callbacks or site-visit confirmations where applicable.
   - added unit coverage for generated task types, terminal-lead suppression, sent-property-detail suppression, and completed-task suppression.
23. Started Phase 2 automated nurture sequences with a human-approved no-response slice:
   - added nurture sequence config defaults for no-response WhatsApp follow-ups.
   - Overdue Tasks now suggests a `Send no-response follow-up` WhatsApp task when a lead goes quiet after an outbound call/message/property-details touch.
   - no nurture message is auto-sent; sales must open or mark the suggestion done.
   - added unit coverage for nurture task creation, newer-activity suppression, and disabled-sequence suppression.
24. Added Admin Console controls for nurture sequences:
   - added a Nurture Sequences tab that persists `crm_config/nurture`.
   - admins can enable/disable suggestion-only nurture automation.
   - admins can enable/disable the no-response WhatsApp suggestion and tune the silence window in days.
25. Added the new-lead welcome nurture sequence:
   - Overdue Tasks now suggests a `Send welcome message` WhatsApp task for newly captured leads.
   - admins can enable/disable the welcome sequence and tune the delay in minutes.
   - welcome suggestions are suppressed once a WhatsApp send is logged or the task is completed.
26. Added the property-match follow-up nurture sequence:
   - Overdue Tasks now suggests `Follow up on property match` after matched property details are sent and the lead goes quiet.
   - the property-specific prompt takes priority over generic no-response follow-up.
   - admins can enable/disable the sequence and tune the silence window in days.
27. Added the site-visit reminder nurture sequence:
   - Overdue Tasks now suggests `Send site visit reminder` before a scheduled visit.
   - reminder suggestions respect the configured hours-before window and existing reminder flags.
   - marking the task done records activity and flips the visit reminder flag so it does not repeat.
   - admins can enable/disable the sequence and tune the reminder window in hours.
28. Added configurable post-site-visit follow-up / objection handling:
   - admins can enable/disable post-visit follow-up suggestions and tune the hours-after-visit window.
   - Overdue Tasks now frames post-visit follow-up as capturing buyer feedback, objections, and next steps.
   - added unit coverage for disabling the sequence and respecting the configured follow-up window.
29. Added old-lead reactivation:
   - Overdue Tasks now suggests `Reactivate old lead` for inactive non-terminal leads.
   - reactivation is a fallback and stays hidden when a more specific task already exists for the lead.
   - admins can enable/disable reactivation and tune the inactivity threshold in days.
30. Polished the Overdue Tasks queue:
   - added My Tasks / All Tasks, assignee, task type, and priority filters.
   - added Critical, High, and Normal quick counters.
   - added task-type labels and clearer empty states so the queue remains scannable as automation grows.

### 2026-04-27

31. Started Phase 3 communications platform with inbound WhatsApp webhook support:
   - added `/api/whatsapp/webhook` with Meta GET verification and signed POST verification.
   - inbound WhatsApp messages are persisted to `whatsapp_messages`.
   - when the sender phone matches a lead duplicate key, the lead activity log gets a `whatsapp_received` entry.
   - added read-only Firestore access for active users to support future timelines/inbox UI.
   - added unit coverage for phone normalization, signature verification, and webhook payload extraction.
32. Added buyer-reply task generation for inbound WhatsApp:
   - matched inbound WhatsApp messages now create a `Reply to WhatsApp` task when sales has not responded after the buyer reply.
   - inbound replies suppress no-response/old-lead nurture suggestions so the queue points to the real buyer action.
   - added unit coverage for reply-task creation and suppression after a sales response.
33. Added the first WhatsApp Inbox:
   - sales/admin/superadmin users now get a WhatsApp navigation item and `/whatsapp` inbox page.
   - inbox reads server-owned `whatsapp_messages`, supports search and direction filtering, and links matched messages back to the lead.
   - tightened `whatsapp_messages` Firestore reads to lead-management roles instead of every active user.
34. Added WhatsApp Inbox replies:
   - the inbox detail pane now has a reply composer that sends through the existing authenticated server API.
   - successful Meta sends create outbound `whatsapp_messages` records.
   - matched lead replies append `whatsapp_sent` activity entries, which clears/suppresses the generated `Reply to WhatsApp` task.
   - failed sends surface the server/Meta error cleanly while the WhatsApp Business number is still pending.
35. Added manual linking for unmatched WhatsApp contacts:
   - unmatched inbox messages now show a lead search/link panel.
   - linking runs through an authenticated server API, updates the server-owned message `lead_id`, and appends the sender phone to the lead duplicate keys.
   - linked leads get a `whatsapp_linked` activity entry so the action is auditable.
   - future WhatsApp webhook messages from the same phone can auto-match to the linked lead.
36. Added create-lead flow for unmatched WhatsApp contacts:
   - unmatched inbox messages now offer a compact `Create Lead` action.
   - creation runs through an authenticated server API, creates a WhatsApp-source lead, links the message, stamps duplicate keys, and preserves the inbound message in activity history.
   - the route reuses automatic assignment rules so WhatsApp-created leads enter the same sales ownership flow as other new leads.
37. Parked further WhatsApp and call-intelligence work until the business number / telephony integrations are ready to validate end to end.
38. Started Phase 4 AI Sales Copilot:
   - added deterministic lead scoring with temperature, reasons, risks, and next-best-action.
   - added a lead-specific sales pitch generator based on profile, matched property, stage, and objections.
   - surfaced Copilot score, action, reasons, pitch, and objection angles in Lead Detail and on Kanban cards.
   - added structured buyer objections so sales can mark price, location, legal/RERA, family decision, loan/payment, comparison, and timing blockers.
   - objections now influence score, next action, generated pitch, activity log, and duplicate merge preservation.
39. Added the first AI Lead Summary slice:
   - Lead Detail now summarizes buyer profile, strongest property angle, current blocker, last touch, site-visit state, and recent timeline.
   - summary is generated from existing CRM data without external API calls or new secrets.
   - added unit coverage for activity summaries with and without lead history.
40. Added the first Natural-Language CRM Search slice:
   - the Leads page search box now understands structured phrases like `hot villa leads above 80L`, `stuck in nurturing for 7 days`, `unassigned buyers with price objections`, `site visits scheduled this week`, and `leads interested in Rare Earth but not contacted`.
   - recognized filters appear as compact Smart Search chips while plain name/phone/project/location search continues to work.
   - implementation is deterministic and local to CRM data, with no external AI API call.
   - added unit coverage for parsing and matching smart lead-search queries.
41. Added Smart Search Insights:
   - smart-search results now show a compact insight strip with found count, hot/high-urgency count, unassigned count, top objection, not-contacted count, stale follow-up count, top matched projects, and a suggested first action.
   - the insight engine stays deterministic and testable, with unit coverage for result-risk summaries and empty-result guidance.
42. Documented the MVP Critical Feature Set and started immediate security hardening:
   - added the must-have MVP pillars: production security/recovery, executive intelligence, inventory intelligence, data quality governance, AI assistant layer, and communication platform readiness.
   - added a shared active CRM user verifier for authenticated API routes.
   - locked `/api/geocode` and `/api/resolve-map-url` behind Firebase ID-token verification and active-user checks.
   - added payload-size checks for Maps inputs and restricted map URL resolution to Google Maps URL shapes.
   - updated geocoding and map URL browser callers to attach the logged-in user token.
43. Continued API hardening with validation and rate limits:
   - added shared JSON payload validation helpers for bounded strings, enums, and string arrays.
   - applied schema-style validation and payload byte limits to `/api/geocode`, `/api/resolve-map-url`, `/api/polish-note`, `/api/lead-assignment/next`, `/api/whatsapp/send`, `/api/whatsapp/link-lead`, and `/api/whatsapp/create-lead`.
   - replaced repeated auth parsing in several routes with the shared active CRM user verifier.
   - added per-instance rate limits to paid or side-effecting API routes as immediate abuse resistance.
   - remaining production hardening: add edge-level rate limiting / Cloud Armor because in-memory serverless rate limits are not a complete distributed protection layer.
44. Started backup/export/recovery readiness:
   - added a local Firestore export script that writes timestamped JSONL snapshots, `manifest.json`, `leads.csv`, and `inventory.csv`.
   - added `npm run backup:firestore` for manual exports from the app folder.
   - gitignored local backup folders so operational exports are not committed.
   - added `docs/BackupRecoveryRunbook.md` with local export, GCP scheduled export, restore rehearsal, validation, and retention guidance.
   - remaining production hardening: create the locked GCS backup bucket, schedule automated Firestore exports, and perform a restore rehearsal into staging.
45. Added the first auditability slice:
   - added server-owned `audit_logs` with admin/superadmin read access and no client write access.
   - added reusable API audit logging that records actor, role, action, target, summary, and bounded metadata without storing raw secrets or provider responses.
   - added audit entries for lead-assignment selection, WhatsApp sends, WhatsApp lead linking, and WhatsApp-created leads.
   - added Firestore rules coverage proving only admins can read audit logs and no browser role can write them.
46. Started executive intelligence on the Dashboard:
   - added a top-level Vital Stats strip for open leads, hot leads, expected bookings, forecast value, scheduled site visits, and blocked value.
   - expected bookings and forecast value are probability-weighted from current stage, AI lead temperature, site-visit state, booking state, and active objections.
   - blocked value highlights open pipeline with objections or stale-risk signals, while unassigned leads stay visible inside the same leadership summary.
   - added pure unit coverage for the new leadership metrics so dashboard totals are regression-tested.
47. Expanded dashboard graph intelligence and corrected the Marketing Team dashboard:
   - added an executive Conversion Signals graph beside Pipeline & Revenue Trend so site visits, bookings, and closed deals are visible as trend lines.
   - moved ROI ownership to the Internal Team / leadership dashboard, using closed revenue against total active marketing spend.
   - kept Marketing Team focused on acquisition efficiency: CPL, cost per site visit, lead-to-site-visit ratio, lead quality, rejection rate, source mix, campaign performance, and project attribution.
   - added Marketing Conversion Trend with the same animated chart language as the main dashboard.
   - added monthly/weekly/daily/yearly period controls to the Marketing Team dashboard.
   - added pure unit coverage for internal ROI and marketing time-series calculations.
48. Reworked Marketing Team supporting graphs:
   - changed Source Breakdown from a pie chart to a cleaner bar chart.
   - changed Campaign Performance from a horizontal bar chart to a curve profile across top campaigns.
   - changed Project Attribution from a horizontal bar chart to weighted project tiles sized by lead contribution.
   - retained the same source/campaign/project metrics while making the visual language less repetitive.
49. Started Inventory Intelligence:
   - added deterministic inventory health scoring from available/booked/sold units, available value, stale inventory age, and visible buyer demand.
   - added Internal Dashboard Inventory Intelligence with available units, available value, stale units, booked/sold count, projects needing marketing push, healthiest projects, and demand-vs-supply by property type and budget band.
   - wired the leadership dashboard to read inventory alongside leads/users/marketing teams.
   - added unit coverage for inventory totals, stale detection, project health, and demand/supply comparisons.
50. Updated release scope on 2026-04-28:
   - moved mobile-first sales workflow out of Release Cycle 1.
   - parked mobile-first field views, one-tap mobile actions, property pitch sheets, and site-visit mobile mode under Release Cycle 2.
51. Completed the Release Cycle 1 Inventory Intelligence slice:
   - added demand-vs-supply by location alongside existing type and budget-band intelligence.
   - surfaced location demand/supply in the dashboard Inventory Intelligence panel.
   - added focused unit coverage for location normalization and demand/supply comparison.
52. Started Data Quality and Governance:
   - added deterministic lead data-quality checks for missing buyer name, phone, interest, budget, location, assignee, and stage-specific readiness gaps.
   - surfaced data-quality warnings in Lead Detail so sales/admin users can clean records before they distort forecasts or automation.
   - closed the direct-edit governance gap by requiring rejection, closure, and booking-cancellation notes when status is changed from the Lead Detail status dropdown.
   - added status-change activity logging for direct status edits, matching the audit trail already used by Kanban drag moves.
53. Added structured stage-change reasons:
   - added reason categories for rejected leads, closed sales, and booking cancellations.
   - wired reason-category selection into both Kanban stage-change dialogs and direct Lead Detail status edits.
   - stored `stage_reason_kind` and `stage_reason_category` on new status-change activity entries while preserving the human-readable note text.
   - added unit coverage for reason-category options and structured status-change logs.
54. Added lead source hygiene:
   - added deterministic source normalization for common aliases such as Meta/Facebook/Instagram, Google Ads, Website, Channel Partner, Walk-in, CSV Import, WhatsApp, and Organic.
   - preserved the original `source` label while stamping `source_normalized` on newly created and CSV-imported leads.
   - updated marketing dashboard metrics and marketing time-series filters to group/report using normalized source labels.
   - updated lead source filtering to use clean source labels so aliases do not fragment the Leads page filters.
   - added unit coverage for source normalization, source matching, CSV source stamping, and normalized marketing source breakdowns.
55. Added the first data sanitization cleanup queue:
   - tightened data-quality checks so placeholder values like `N/A`, `Unknown`, and `Not Specified` are treated as incomplete data instead of valid text.
   - added lead source sanitization checks for missing, legacy, or mismatched `source_normalized` values.
   - added a Leads page `Data Quality` filter so admins can isolate records with blocking issues, warnings, missing phone/budget/location/assignee, source cleanup needs, missing visit details, booked-without-unit, rejected-without-reason, and closed-without-details.
   - added cleanup counters in the Leads header and filter options so dirty CRM data is visible before it pollutes future analytics.
   - added unit coverage for data-quality summaries used by cleanup queues.
56. Added the first bulk sanitization action:
   - added a deterministic source-normalization patch helper that identifies leads where `source_normalized` can be safely stamped from the original `source`.
   - added an admin-only `Normalize Sources` bulk action on the Leads page when source cleanup is available.
   - bulk normalization preserves the original `source`, writes only `source_normalized`, and appends a per-lead activity note for traceability.
   - batched writes are chunked so the cleanup can handle larger datasets without exceeding Firestore batch limits.
   - added unit coverage for safe source-normalization patch detection.
57. Added cleanup queue export:
   - added a CSV builder for data-quality cleanup queues with lead identity, contact, status, source, normalized source, assignee, issue counts, and issue labels.
   - added an admin-only `Export Cleanup` action that exports the currently filtered cleanup leads, so admins can narrow the queue before sharing or assigning cleanup work.
   - added unit coverage for CSV quoting and cleanup issue labels.
58. Added bulk assignment cleanup:
   - added an admin-only `Assign Unassigned` action for the currently filtered cleanup leads that are missing an assignee.
   - reused the existing authenticated lead-assignment API so bulk cleanup respects configured source rules, workload strategy, and round-robin cursor behavior.
   - each successful assignment writes `assigned_to` and a `lead_assigned` activity entry for traceability.
   - skipped leads remain untouched when no eligible assignee exists, and the UI reports assigned/skipped counts.
59. Hardened source normalization at ingestion:
   - stamped `source_normalized` on WhatsApp-created leads from the server route.
   - added source normalization to the Python universal lead-ingestion webhook so Meta/website/future external leads enter the CRM with clean reporting labels.
   - kept original `source` values intact for audit/history while adding canonical reporting labels.
   - added local Python unit coverage for webhook source normalization aliases.
60. Started the AI Assistant expansion with a deterministic Daily Briefing:
   - added a pure briefing utility that ranks hot leads, overdue SLA actions, fresh property matches, inventory opportunities, and blocked revenue signals without calling an external AI service.
   - scoped the briefing to the selected salesperson when the dashboard user filter is active.
   - added unit coverage for briefing generation, overdue/blocked revenue prioritization, and assignee scoping.
61. Corrected the product boundary for dashboard vs operational work:
   - dashboard must remain C-suite focused: leadership stats, forecasts, funnels, trends, ROI, inventory signals, and polished graphs only.
   - operational action queues such as Daily Briefing, overdue work, hot lead actions, follow-up lists, cleanup queues, and next-best-action lists must not clutter the dashboard.
   - moved Daily Briefing out of the Internal Dashboard and merged it into the Tasks experience as `Tasks & Briefing`.
   - kept the deterministic briefing utility intact, but changed its UI placement so execution work lives with overdue tasks instead of leadership reporting.
62. Made `Tasks & Briefing` actionable:
   - added deep links from briefing hot leads, overdue actions, and blocked revenue cards directly to the relevant lead detail view.
   - added project links for fresh property matches and inventory opportunities.
   - kept demand-gap briefing items pointed at the Projects workspace for inventory/project review.
   - added unit coverage so briefing action links remain deterministic and regression-tested.
63. Completed the first security-audit blocker fix pass:
   - moved CRM user resolution, first-user bootstrap, root self-heal, and pending-user migration behind a server route so the browser no longer needs broad user-write rules.
   - tightened Firestore `users` rules to block self-promotion, post-bootstrap self-profile creation, unsafe role/active edits, and cross-user pending-profile reads/deletes.
   - tightened Storage rules so project/branding/theme uploads require admin access and valid image files, while recordings require lead-management access and audio file constraints.
   - added explicit role gates to Admin-SDK side-effect APIs for lead assignment, WhatsApp sends, and note polishing.
   - verified the hardening with unit tests, Firestore rules emulator tests, build, lint, and a Storage rules emulator smoke check.
64. Continued Security Audit Pass 1 on lead ownership and lead-mutating APIs:
   - tightened channel-partner lead creates so external partners can create only self-owned `New` leads with channel-partner source labels and no forged assignee.
   - tightened channel-partner updates so external partners can maintain normal working fields on their own leads but cannot mutate assignment, ownership, booking, merge, or other internal system fields.
   - added Firestore rules coverage for forged source, forged assignee, internal booking fields, merge fields, and ownership reassignment attempts.
   - hardened WhatsApp send/link APIs so server-side lead activity updates require the WhatsApp phone/contact to match the selected lead before the Admin SDK writes lead timeline data.
   - architecture audit status: current architecture is modern and production-pilot ready for a Firebase/Next.js CRM, but enterprise maturity still depends on completing API boundary hardening, production environment controls, monitoring, backup automation, and the second security audit.
65. Continued Security Audit Pass 1 on project boundaries and high-risk lead mutations:
   - granted Channel Partners access to Projects while scoping their project list to `channel_partner_uids` assignments.
   - kept Channel Partner Dashboard and Leads access scoped to their own stats/leads, while Sales Exec/Admin/Super Admin retain broader lead visibility.
   - added admin-managed Channel Partner project assignment controls on the Project Overview tab.
   - tightened Firestore project, inventory, project schema, and no-match intelligence reads so Channel Partners can read only assigned project surfaces or their own lead intelligence.
   - blocked Channel Partners from reverse-match best-buyer snapshots so project access does not expose internal sales intelligence.
   - tightened lead rules and UI flows so Sales Execs/Channel Partners cannot directly mutate booking, unbooking, merge, assignment, or booked-stage transitions from the browser; Admin/Super Admin remain responsible for those high-risk mutations until dedicated server-side transaction routes are added.
   - kept the Dashboard boundary note active: executive dashboards stay C-suite focused, and operational queues/actions continue to live outside the dashboard.
   - corrected external partner surface area: Channel Partners must not see internal Tasks & Briefing, inventory opportunity queues, employee names, or unassigned/internal operational queues.
   - completed a Channel Partner privacy sweep: added route guards for Tasks and WhatsApp, removed broad project fetches from lead property/location pickers, blocked Channel Partner reads of demand-gap reports and marketing-team docs, blocked internal CRM assignment/nurture/user-count config reads, and blocked Channel Partner writes to the global property-match threshold.
66. Continued Security Audit Pass 1 by moving booked-lead mutations behind a server transaction:
   - added `/api/leads/booking` with active CRM-user verification, Admin/Super Admin authorization, rate limiting, Admin SDK transactions, governance-note validation, and audit-log entries for booking, release, and booked-stage transitions.
   - switched Lead Detail booking/release actions, Kanban booked lead moves, and direct Lead Detail booked-status changes to call the server route instead of writing lead/inventory booking state from the browser.
   - tightened booking API input hygiene: release requests can only move a lead to an open non-booked stage, status names must be known CRM stages, and stage reason categories must be from the governed list.
   - preserved data sanitization goals by requiring structured reason categories and notes for closure, rejection, and booking-cancellation transitions.
   - validation completed: `npm test`, `npm run test:rules`, `npm run build`, `npm run lint` (warnings only from the existing lint backlog), and `git diff --check`.
67. Continued Security Audit Pass 1 by moving merge/delete lifecycle actions behind a server transaction:
   - added `/api/leads/lifecycle` for Admin/Super Admin merge and archive actions with active CRM-user verification, rate limiting, Admin SDK transactions, and audit-log entries.
   - converted lead delete into soft archive so lead history stays available for audit, recovery, and future CRM data analysis; active Leads, Dashboard, Tasks, WhatsApp link candidates, property matching, cleanup queues, and callback alarms now ignore archived leads.
   - changed duplicate merge so the duplicate lead is archived instead of hard-deleted, while its timeline and useful buyer data are merged into the primary lead.
   - kept inventory consistent during archive/merge: active booked units are released on archive, and transferred duplicate bookings point inventory back to the primary lead.
   - tightened Firestore lead rules so browser clients cannot hard-delete leads or directly mutate booking, merge, archive, or owner fields; these lifecycle writes now go through the server route.
   - validation completed: `npm test`, `npm run test:rules`, `npm run build`, and `npm run lint` (warnings only from the existing lint backlog).
68. Documented the production deployment course of action and added browser security headers:
   - added `docs/ProductionDeploymentCourseOfAction.md` with the staging, production-candidate, two-audit, backup/recovery, UAT, deployment, and rollback path.
   - added global Next.js security headers in `next.config.ts`: CSP, HSTS, frame protection, MIME sniffing protection, referrer policy, permissions policy, COOP, and DNS prefetch control.
   - kept CSP compatible with current Firebase, Google Maps, Firebase Storage, Google user images, and local development needs; `upgrade-insecure-requests` is production-only.
   - validated headers with a temporary `next start` smoke check on port 3011 and `curl -I`.
   - validation completed: `npm run build`, `npm test`, `npm run test:rules`, `npm run lint` (warnings only from the existing lint backlog), and `git diff --check`.
69. Continued Security Audit Pass 1 by hardening inventory write boundaries:
   - made browser-side inventory creates available-only, with required structured `projectId`, `price`, and `fields` data.
   - blocked browser clients, including Admin/Super Admin, from directly creating booked/sold inventory, setting `booked_by_lead_id`, changing inventory lifecycle status, changing a unit's project binding, or deleting booked/sold units.
   - kept Admin/Super Admin able to maintain available-unit details and price from the Projects Units tab.
   - changed the Projects Units UI so inventory status is display-only; booking/sold state now stays controlled by the server-side lead booking lifecycle.
   - disabled the public Next.js `X-Powered-By` header as a small production hardening follow-up.
   - validation completed: `npm run test:rules`, `npm test`, `npm run build`, `npm run lint` (warnings only from the existing lint backlog), and `git diff --check`.
70. Continued Security Audit Pass 1 by hardening project write boundaries:
   - constrained browser-created project documents to the known project shape with required name, builder, location, property type, and status fields.
   - validated project status and property type values in Firestore rules so malformed project state cannot enter through browser writes.
   - constrained Admin/Super Admin project updates to known editable fields: core info, media, project fields, Channel Partner access, campaigns, geocode, and `updated_at`.
   - guarded `channel_partner_uids` as a list so Channel Partner project access stays structured and queryable.
   - added document-exists guards on project and inventory update rules to avoid noisy create-vs-update emulator evaluation paths.
   - validation completed: `npm run test:rules`, `npm test`, `npm run build`, `npm run lint` (warnings only from the existing lint backlog), and `git diff --check`.
71. Prepared backup/export readiness and staging UAT verification:
   - expanded the local Firestore export collection list to include `audit_logs`, `whatsapp_send_locks`, `whatsapp_send_failures`, and `processed_events` in addition to the core CRM data collections.
   - added `npm run backup:verify` to validate a completed export's manifest, JSONL files, collection counts, and business CSVs before the backup is trusted.
   - updated the backup/recovery runbook with the verifier command, production readiness gate, restore rehearsal sign-off table, and expanded collection coverage.
   - added `docs/StagingUATChecklist.md` with core smoke tests, seed-data requirements, Channel Partner privacy checks, and role-view verification matrix.
   - validation completed: backup verifier fixture smoke test, `node --check` for backup scripts, `npm test`, `npm run test:rules`, `npm run build`, `npm run lint` (warnings only from the existing lint backlog), and `git diff --check`.
72. Completed the live backup automation and restore rehearsal gate:
   - created the production Firestore backup bucket `gs://elite-build-crm-firestore-backups` in `asia-south1`.
   - enabled uniform bucket-level access, public access prevention, object versioning, and 30-day retention.
   - created the `firestore-backup-exporter` service account and daily Cloud Scheduler job `crm-firestore-daily-export` at 2:00 AM India time.
   - triggered the scheduled export path and confirmed it writes Firestore export metadata/data under `gs://elite-build-crm-firestore-backups/scheduled`.
   - created the staging Firestore database in `elite-build-infra-tech-dev`, linked staging billing, imported the production rehearsal export, and deployed current Firestore rules/indexes to staging.
   - verified the restored staging data with the local backup verifier: 16 collections and 80 documents.
   - verified restored Channel Partner privacy data: the restored partner has 1 owned lead and only the `Blossom Palms` assigned project.
   - verified the all-role UI capability matrix and high-risk Firestore role/privacy rules: 65 permission tests and 254 rules tests passed.
   - documented the evidence in `docs/ProductionOpsVerification-2026-04-28.md`.
   - noted the deployment account assumption at that time; this was superseded by item 73.
73. Updated the current deployment target after user clarification:
   - set local `gcloud` active account to `devensuji@gmail.com`.
   - set local `gcloud` active project to `elite-build-infra-tech-dev`.
   - verified the GCP project name is `Elite Build CRM` and project number is `484810469771`.
   - set the Application Default Credentials quota project to `elite-build-infra-tech-dev` so local deployment/client tooling uses the same quota context.
   - initialized Firebase on `elite-build-infra-tech-dev`.
   - registered the `elite-build-crm-web` Firebase Web App and updated local CRM Firebase env config to the new project.
   - initialized the default Firebase Storage bucket in `ASIA-SOUTH1`.
   - deployed Firestore rules/indexes and Storage rules to `elite-build-infra-tech-dev`.
   - added `.firebaserc` so Firebase CLI defaults to `elite-build-infra-tech-dev`.
   - documented that all current deployment work should target `devensuji@gmail.com` / `elite-build-infra-tech-dev` unless explicitly changed.
74. Completed the first Cloud Run dev deployment pass:
   - enabled Cloud Run, Cloud Build, Artifact Registry, and IAM Credentials APIs in `elite-build-infra-tech-dev`.
   - deployed the Next.js CRM service as `elite-build-crm-dev` in `asia-south1`.
   - passed local `npm run build` with the new Firebase project env.
   - fixed the Cloud Run source-build issue by supplying Firebase public config at both build time and runtime.
   - moved the Cloud Run service onto `crm-cloud-run-dev@elite-build-infra-tech-dev.iam.gserviceaccount.com`.
   - granted the runtime service account only `roles/datastore.user` and `roles/firebaseauth.viewer`.
   - verified `/login` returns `200` on both Cloud Run service domains and the auth resolve route rejects unauthenticated POSTs with `401`.
   - initialized Firebase Auth/Identity Toolkit config and authorized the Cloud Run domains plus localhost.
   - enabled the Firebase Auth Google provider with the project OAuth Web client.
   - fixed the production CSP so Firebase Auth can load `https://apis.google.com`.
   - redeployed Cloud Run revision `elite-build-crm-dev-00003-d5t`.
   - verified the browser OAuth popup reaches Google Accounts sign-in with the correct client ID and redirect URI.
   - confirmed real browser login with `devensuji@gmail.com` as Super Admin.
   - found one restored duplicate Super Admin profile from the backup dataset; current Auth UID is `z3nefR1HqMfu5yUYsvuYAvzwW3k2`, stale restored UID is `8t9G7COmPDPmtIQSzoBL5AFeaum2`.
   - reconciled the restored duplicate user profile: transferred 1 lead owner reference and 2 lead assignment references to the active UID, demoted/deactivated the stale UID, and wrote audit log `VyMG8XTNJqye1drw78v0`.
   - seeded pending role-view UAT users for Admin, Sales Exec, Channel Partner, Digital Marketing, and Viewer using `@elitebuild.in` placeholder emails.
   - remaining UAT handoff: log in with the five UAT accounts so pending profiles migrate to real Firebase UIDs, assign Channel Partner test access, then run role-view UAT.
75. Fixed Admin Console pending-user email normalization:
   - corrected the add-member flow so pending document IDs are generated from the lowercased email, matching the server-side login resolver.
   - hardened `/api/auth/resolve-crm-user` to migrate older mixed-case pending documents by matching the normalized email, so existing invites do not get stranded.
   - normalized the live `elitebuildinfratech@gmail.com` pending Admin record from `pending_EliteBuildInfraTech_gmail_com` to `pending_elitebuildinfratech_gmail_com`.
   - added a regression test for mixed-case pending document migration.
   - redeployed Cloud Run revision `elite-build-crm-dev-00005-xp8` and verified `/login` returns `200`.
76. Fixed Admin access to Lead Assignment settings:
   - corrected Firestore rules so Admin and Super Admin can read `crm_config/lead_assignment`, matching the existing write access and Admin Console tab.
   - kept Channel Partner, Sales Exec, Digital Marketing, and Viewer blocked from internal lead-assignment config.
   - updated the CRM config rules regression test and deployed Firestore rules to `elite-build-infra-tech-dev`.
77. Fixed Branding tab wiring:
   - confirmed branding data was saving correctly but most saved values were not applied outside the Admin preview.
   - added a sanitized public `/api/branding` endpoint so the unauthenticated login screen can render company branding without opening Firestore config reads.
   - added a shared Branding provider, wired the top nav and login page to saved company name, tagline, logo, banner, and brand color variables.
   - changed Branding save to merge future-safe fields and refresh visible branding immediately.
   - added unit coverage for branding normalization and deployed Cloud Run revision `elite-build-crm-dev-00006-mpj`.
78. Added Branding banner image guardrails:
   - the Branding tab now states that banner images must be landscape, minimum `1600 x 900px`, and real high-resolution background images rather than small logos or screenshots.
   - the banner upload control validates image dimensions before upload and rejects undersized files.
   - deployed Cloud Run revision `elite-build-crm-dev-00007-hw8`.
79. Enabled Admin user onboarding from the Team tab:
   - added an `onboard_users` capability for Admin and Super Admin.
   - Admins can now add pending users from Team, including non-Super-Admin roles, so new users can sign in and migrate to real Firebase UID-backed profiles.
   - Super Admin remains the only role that can create/onboard Super Admins, change roles, toggle active status, or remove users.
   - hardened Firestore rules so Admin onboarding is limited to safe `pending_*` documents with `pending_registration: true` and non-Super-Admin roles.
   - added unit and Firestore rules coverage; deployed Firestore rules and Cloud Run revision `elite-build-crm-dev-00008-q9l`.
80. Fixed deployed Google Places location autocomplete:
   - confirmed manual lead location entry uses the shared `LocationAutocomplete` component for all roles, including Channel Partner.
   - found the Cloud Run dev service had Firebase public env vars but was missing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, so Google Places could not load in the browser.
   - redeployed Cloud Run with the Google Maps public key supplied at both build time and runtime.
   - verified Cloud Run revision `elite-build-crm-dev-00009-bdc` is serving 100% of traffic and has the key present in both build/runtime env without exposing the secret.
81. Completed the Google Places browser referrer fix:
   - reproduced the remaining browser failure as `RefererNotAllowedMapError` from Google Maps JavaScript API.
   - updated the Google Maps browser key allowed referrers to include the active Cloud Run CRM URL, alternate Cloud Run URL, local dev ports, future `crm.elitebuild.in`, and regex-style path patterns required by the API key service.
   - verified from the deployed CRM origin that Google Places now returns live suggestions for location queries such as `Vijaya` and `Gokulam` with no browser API errors.
82. Fixed Channel Partner lead assignee display and self-assignment:
   - confirmed live Channel Partner-owned leads were already assigned to the partner in data, but the UI excluded Channel Partner users from the Assignee option list, causing the dropdown to look unassigned.
   - updated the Leads page assignee options to include active Channel Partners, so partner-owned leads render the partner name correctly.
   - changed Channel Partner manual lead creation to self-assign locally instead of relying on the internal sales assignment dropdown.
   - tightened Firestore rules so Channel Partners can only self-assign their own older unassigned leads and still cannot assign leads to other users or unassign themselves.
   - validation completed: targeted unit tests, targeted Firestore rules tests, `npm run build`, `npm run lint` (warnings only from existing backlog), Firestore rules deploy, and Cloud Run revision `elite-build-crm-dev-00010-45c`.
83. Enabled Channel Partner scoped property matching:
   - changed the Leads page so Channel Partner sessions load available inventory only from projects assigned to that partner.
   - re-enabled the existing auto property matcher for Channel Partner leads using that scoped inventory/project dataset, instead of disabling matching for partners entirely.
   - added Firestore rules coverage proving Channel Partners can query available inventory within an assigned project and cannot query global available inventory across unassigned projects.
   - validation completed: targeted unit tests, targeted Firestore rules tests, `npm run build`, `npm run lint` (warnings only from existing backlog), and Cloud Run revision `elite-build-crm-dev-00011-tbz`.
   - live data note: current Channel Partner `EliteBuild` has access to `Curve` and `Blossom Palms`, but both currently have 0 total inventory units and 0 available units, so no match can be generated until available units are added.
84. Restored Gemini AI Polish server configuration:
   - confirmed `/api/polish-note` intentionally reads the Gemini credential only from the server-side `GEMINI_API_KEY` env var, while Firestore `crm_config/ai` stores only non-secret enabled/model settings.
   - found the Cloud Run dev service was deployed without `GEMINI_API_KEY`, causing the runtime error `Gemini API key not configured on the server`.
   - enabled Secret Manager in `elite-build-infra-tech-dev`, created the `gemini-api-key` secret, and granted secret access only to the Cloud Run runtime service account `crm-cloud-run-dev@elite-build-infra-tech-dev.iam.gserviceaccount.com`.
   - redeployed Cloud Run revision `elite-build-crm-dev-00012-2r7` with `GEMINI_API_KEY=gemini-api-key:latest`; the revision is serving 100% of traffic.
   - removed the legacy `api_key` field from Firestore `crm_config/ai` after confirming the Cloud Run secret reference.
   - verification completed: Secret Manager secret exists, Cloud Run has the `GEMINI_API_KEY` secret ref, `/login` returns `200`, and Firestore AI config has `enabled: true`, `model: gemini-2.5-flash`, and no legacy key field.
   - remaining smoke test: click the live AI Polish action from an authenticated Super Admin/Admin/Sales Exec browser session; local automated token minting was not used because it would require persistent IAM token-signing permission outside the runtime service account boundary.
85. Tightened Sales Executive dashboard scope:
   - Sales Executives no longer see the Marketing Team dashboard tab; that dashboard is reserved for Admin and Super Admin.
   - Sales Executive dashboard data now subscribes only to leads assigned to that Sales Executive, so dashboard stats and charts show personal pipeline performance instead of whole-team performance.
   - Sales Executive view no longer shows the All Team selector, ROI card, inventory/team intelligence panel, or team leaderboard.
   - Admin and Super Admin keep the leadership dashboard experience, including Internal Team, Marketing Team, All Team filtering, ROI, demand gap, inventory intelligence, and leaderboard.
   - validation completed: `npm run build`, `npm run lint` (warnings only from existing backlog), Cloud Run revision `elite-build-crm-dev-00013-9cr`, `/login` live check `200`, and Cloud Run env/secret binding verification.
86. Completed Sales Executive dashboard UAT/security follow-up:
   - verified live Sales Exec user `elitebuildinfratech@gmail.com` is active as `sales_exec` and currently has 3 active assigned leads, which is the dataset used by the personal dashboard query.
   - closed the rules-level privacy gap for `marketing_teams`: reads are now Admin/Super Admin only, matching the Marketing Team dashboard ownership decision.
   - added Firestore rules regression coverage proving Sales Exec, Channel Partner, Digital Marketing, and Viewer cannot read marketing team data.
   - validation completed: 106 targeted unit tests passed, 138 targeted Firestore rules tests passed, Firestore rules deployed to `elite-build-infra-tech-dev`, `/login` live check `200`, and Cloud Run revision `elite-build-crm-dev-00013-9cr` still serving 100% with the Gemini secret binding intact.
   - next Security Audit Pass 2 focus: finish role-view UAT for Sales Exec lead workflows, then review remaining Admin SDK lead mutation routes and production code-freeze checklist.
87. Security Audit Pass 2 hardening:
   - reviewed high-risk Admin SDK mutation routes: lead booking/release/closed transitions, lead archive/merge lifecycle, lead assignment, WhatsApp create/link/send, WhatsApp webhook, Google Maps URL resolution, and shared auth/rate-limit helpers.
   - kept booking and lifecycle routes Admin/Super Admin only; they already enforce transaction-based booking state, audit logs, and no direct browser hard-delete path.
   - hardened Google Maps URL resolution so the server follows only strict Google Maps hosts, blocking spoofed hosts such as `maps.google.evil.com` before any server-side fetch. Added `tests/unit/googleMapsUrl.test.ts`.
   - hardened WhatsApp lead creation so new leads can be created only from inbound, unlinked WhatsApp messages with a usable phone number.
   - hardened WhatsApp linking so an already-linked message cannot be relinked to a different lead and archived leads cannot receive new WhatsApp links.
   - hardened WhatsApp sending so outbound messages require either a matching linked lead or an existing WhatsApp conversation, and archived leads cannot be messaged from the lead context.
   - updated lead-detail WhatsApp sends and site-visit confirmation sends to include `leadId`, so the server can validate the recipient phone against the lead.
   - validation completed: 124 targeted unit tests passed, 162 targeted Firestore rules tests passed, `npm run build`, `npm run lint` (warnings only from existing backlog), Cloud Run revision `elite-build-crm-dev-00014-xsv`, `/login` live check `200`, unauthenticated API check `401`, and Cloud Run env/secret verification.
   - remaining before code freeze: authenticated browser UAT for Sales Exec lead create/edit/status/location/AI Polish/Projects/Admin block, plus a final review of public unauthenticated GET routes and production secret inventory.
88. Corrected lead AI declutter:
   - removed the large AI Sales Copilot panel from the opened lead detail modal, including summary, pitch, risks, and objection handling, so the modal returns to operational lead fields and activity.
   - restored the compact AI score pill on Kanban lead cards as a lightweight scan signal, without bringing back the card-level next-best-action copilot block.
   - validation completed: `npm run build`, `npm run lint` (warnings only from existing backlog), Cloud Run revision `elite-build-crm-dev-00016-frb`, `/login` live check `200`, and Cloud Run Gemini secret binding verification.
89. Scoped Overdue Tasks by role:
   - Sales Executives now query and see only overdue tasks for leads assigned to their own UID.
   - Admins see all overdue tasks except leads assigned to Super Admin users; the page waits for the team list before rendering Admin task results so Super Admin tasks are not briefly exposed.
   - Super Admins continue to see all overdue tasks.
   - Channel Partners now have access to Overdue Tasks, scoped to their own lead ownership boundary, without subscribing to internal nurture config.
   - Viewer, Digital Marketing, HR, and Payroll/Finance remain blocked from Overdue Tasks.
   - validation completed: targeted unit tests (`taskVisibility`, `permissions`) passed, `npm run build`, `npm run lint` (warnings only from existing backlog), Cloud Run revision `elite-build-crm-dev-00017-q6w`, `/login` live check `200`, and Cloud Run Gemini secret binding verification.
90. Scoped Sales Executive Leads page visibility:
   - Sales Executives now see leads assigned to their own UID plus unassigned non-Channel-Partner leads.
   - Leads assigned to Super Admin, Admin, another Sales Exec, or a Channel Partner now disappear from a Sales Exec Leads page as soon as the assignment changes.
   - Channel Partner leads remain excluded from the Sales Exec unassigned pool using the durable lead source normalization.
   - routed the Leads board, filters, smart search, data-quality counts, direct lead links, duplicate checks, property matching, and callback alarm overlay through the same scoped visible lead list.
   - validation completed: targeted unit tests (`leadVisibility`, `taskVisibility`, `permissions`) passed, `npm run build`, `npm run lint` (warnings only from existing backlog), Cloud Run revision `elite-build-crm-dev-00018-njt`, `/login` live check `200`, and Cloud Run Gemini secret binding verification.
91. Added Sales Exec lead claiming and improved visual contrast:
   - Sales Executives can now assign an unassigned non-Channel-Partner lead to themselves from the lead detail assignee control.
   - Firestore rules now allow only that narrow Sales Exec assignment transition: unassigned -> current Sales Exec UID; assigning to another user, taking an already assigned lead, or claiming Channel Partner leads remains blocked.
   - increased text contrast in both light and dark themes, made cards/panels less translucent, reduced metallic background overlays, and restored browser-default font smoothing for sharper text rendering.
   - validation completed: targeted unit tests (`leadVisibility`, `taskVisibility`, `permissions`) passed, Firestore leads rules test passed (59 rules tests), Firestore rules deployed cleanly, `npm run build`, `npm run lint` (warnings only from existing backlog), Cloud Run revision `elite-build-crm-dev-00019-c9j`, `/login` live check `200`, and Cloud Run Gemini secret binding verification.
92. Removed the legacy white-on-silver action button styling:
   - confirmed the issue was real: primary buttons and selected controls were using the heading token `--mn-h2` as a background with `text-white`, which became low contrast in dark mode after `--mn-h2` was correctly made a light heading color.
   - introduced dedicated brand/action contrast tokens for buttons and destructive actions, so action backgrounds no longer depend on heading colors.
   - updated the shared `Button` primary style, disabled primary state, mobile nav active state, date picker selection, project/inventory edit buttons, image action buttons, marketing dashboard CTA, and project overview selected controls.
   - verified the old high-risk patterns (`bg-mn-h2 text-white`, `bg-mn-danger...text-white`, and `!bg-mn-danger` overrides) are no longer present under `app/` or `components/`.
   - deployment correction: revision `elite-build-crm-dev-00020-6jz` was rolled back because the deployment env file preserved literal quotes around Firebase public env values, breaking Firebase/Auth initialization and public Firestore reads.
   - redeployed the same UI fix as no-traffic revision `elite-build-crm-dev-00021-5bp` using sanitized env values, inspected the revision env to confirm no leading quote characters, then routed 100% traffic to the corrected revision.
   - validation completed: `npm run build`, `npm run lint` (warnings only from existing backlog), `/login` live check `200`, `/api/branding` live check `200`, browser-side login button visible/enabled with no console errors, Cloud Run revision `elite-build-crm-dev-00021-5bp`, and Cloud Run Gemini secret binding verification.
93. Added Cloud Run deployment guardrails:
   - created `scripts/deploy-cloud-run.mjs` as the mandatory deploy path for dev Cloud Run.
   - the script sanitizes `NEXT_PUBLIC_*` values from `.env.local`, validates the Firebase project shape, writes a safe env YAML file, and rejects embedded quote characters before deployment.
   - deployment now happens as a tagged `--no-traffic` candidate first; the script inspects the candidate revision env, verifies `GEMINI_API_KEY=gemini-api-key:latest`, smoke-checks `/login` and `/api/branding`, and only then promotes the candidate to 100% traffic.
   - added `npm run deploy:dev` and `npm run deploy:dev:dry-run`.
   - updated the production deployment course of action so no Cloud Run revision receives traffic before env, secret, and smoke checks pass.
   - validation completed: script syntax check passed, `npm run deploy:dev:dry-run` passed with sanitized env output, `npm run build` passed after one transient Google Fonts retry, `npm run lint` passed with existing warnings only, and the guarded script successfully created/validated no-traffic candidate revision `elite-build-crm-dev-00024-yuf` while live traffic stayed 100% on `elite-build-crm-dev-00021-5bp`.
94. Resumed Security Audit Pass 2 / role-view UAT with rules-level Sales Exec scoping:
   - closed the remaining Sales Exec lead privacy gap at Firestore rules level: Sales Execs can read/update leads assigned to their UID plus unassigned non-Channel-Partner leads only; leads assigned to Super Admin, Admin, another Sales Exec, or Channel Partner are denied by rules, not just hidden by the UI.
   - changed the Leads page to use scoped Sales Exec listeners (`assigned_to == current UID` and `assigned_to == null` plus `source_normalized != Channel Partner`) instead of a full-collection listener followed by client filtering.
   - Sales Exec-created manual/CSV leads now self-assign to the creator so new leads do not disappear into another user assignment flow.
   - full WhatsApp Inbox and unmatched WhatsApp link/create flows are now Admin/Super Admin only until a properly scoped Sales Exec inbox is built; Sales Exec WhatsApp sends remain allowed only from a lead they are permitted to mutate.
   - global property-match threshold editing is Admin/Super Admin only; Sales Execs still keep per-lead match threshold edits through allowed lead fields.
   - added the required Firestore composite index for the Sales Exec unassigned-lead query: `leads(assigned_to ASC, source_normalized ASC)`.
   - validation completed: TypeScript passed, targeted unit tests passed, full Firestore rules suite passed (304 tests), `npm run build` passed, `npm run lint` passed with existing warnings only, Firestore indexes/rules deployed to `elite-build-infra-tech-dev`, and guarded Cloud Run revision `elite-build-crm-dev-00025-kog` passed candidate smoke checks before promotion.
   - UAT note: wait for the new Firestore composite index to report `READY`, then verify live Sales Exec role-view in browser: assigned leads visible, unassigned non-CP leads visible, leads assigned to Super Admin/Admin/other Sales Exec hidden, full WhatsApp Inbox hidden, Admin/Super Admin views unchanged.
95. Added the CRM-owned WhatsApp conversation foundation:
   - introduced `whatsapp_conversations/{phone}` with denormalized `assigned_to` plus `messages/{message}` so one company WhatsApp number can be shown as role-scoped CRM inboxes without exposing every chat to every Sales Exec.
   - re-enabled the WhatsApp Inbox route for Sales Execs, but their Firestore query and rules boundary now return only conversations assigned to their own UID; Admin and Super Admin can still see all conversations.
   - kept the legacy `whatsapp_messages` collection Admin/SuperAdmin-only during the transition and dual-wrote inbound/outbound/link/create flows into the new conversation model.
   - added a lead-sync API so lead reassignment updates the related WhatsApp conversation ownership boundary, keeping chat visibility aligned with lead assignment.
   - enforced the WhatsApp 24-hour service-window rule for free-text replies in the server send route; expired conversations now require an approved template flow.
   - added the required Firestore index `whatsapp_conversations(assigned_to ASC, last_message_at DESC)` and rules coverage for Admin/SuperAdmin/Sales Exec isolation.
   - validation completed: TypeScript passed, targeted unit tests passed, full Firestore rules suite passed (317 tests), `npm run build` passed, `npm run lint` passed with existing warnings only, Firestore index reached `READY`, Firestore rules deployed, and guarded Cloud Run candidate `elite-build-crm-dev-00027-zuy` passed smoke checks before promotion.
   - deployment guardrail follow-up: `scripts/deploy-cloud-run.mjs` now detects and binds optional WhatsApp secrets (`whatsapp-access-token`, `whatsapp-app-secret`, `whatsapp-webhook-verify-token`) when they exist, preventing future deploys from silently dropping Meta runtime settings.
   - current dev-project blocker: the three WhatsApp secrets do not exist yet in `elite-build-infra-tech-dev`, so real Meta send/webhook traffic will stay disabled until those values are created and the service is redeployed.
   - next WhatsApp slices: template picker and approved-template send path, media download/storage, delivery/read status webhooks, PWA/mobile push notifications, and a backfill/migration job for older legacy WhatsApp messages.
96. Resumed Security Audit Pass 2 with WhatsApp configuration parked:
   - left WhatsApp Meta configuration out of scope; the guarded deploy confirmed the optional WhatsApp secrets are still absent, so real Meta traffic remains disabled.
   - restricted reverse-match buyer snapshots and aggregate demand-gap reports to Admin/SuperAdmin because those documents can include cross-team buyer details and executive intelligence.
   - updated the Projects page so non-leadership roles no longer subscribe to Admin-only buyer-signal snapshots, preventing denied-listener errors after the tighter rules.
   - locked Storage `recordings/**` to Admin/SuperAdmin read/write and added Storage emulator coverage; broad sales-team recording access stays blocked until a lead-scoped recording workflow exists.
   - closed stale browser bootstrap writes: browser clients can no longer create `crm_config/_user_count` or self-create a Super Admin profile; the Admin SDK login resolver owns bootstrap and pending-user migration.
   - hardened direct lead status writes by validating status values at Firestore rules level, and blocked invalid `source_normalized` writes from browser admin clients.
   - hardened `/api/resolve-map-url` redirect handling so the server follows redirects manually and stops if a Google Maps short URL attempts to leave the supported Google Maps host set.
   - made the server root Super Admin email configurable through `ROOT_SUPERADMIN_EMAIL`, with the current dev email retained as fallback; production must set this to the production owner Google account.
   - updated `docs/AuditReport.md`, `docs/ProductionDeploymentCourseOfAction.md`, and the app README to reflect the current security posture and production root-account requirement.
   - validation completed: `npx tsc --noEmit`, full unit suite passed (453 tests), full Firestore/Auth/Storage rules suite passed (340 tests), `npm run build` passed, `npm run lint` passed with the existing 57-warning backlog only, and `git diff --check` passed for touched files.
   - deployment completed: guarded Cloud Run candidate `elite-build-crm-dev-00029-gun` passed env/smoke checks and was promoted to 100% traffic; Firestore and Storage rules deployed to `elite-build-infra-tech-dev`; live smoke checks passed (`/login` 200, `/api/branding` 200, unauthenticated `/api/resolve-map-url` 401).
   - remaining Security Pass 2 work: authenticated role-view UAT in the browser after this deployment, production `ROOT_SUPERADMIN_EMAIL` setup, and the final production secret/backup/code-freeze checklist.
