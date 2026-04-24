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
