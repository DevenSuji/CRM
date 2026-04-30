# WhatsApp — Security Hardening Plan

_Created:_ 2026-04-21
_Status:_ **FOUNDATION HARDENED** on 2026-04-30. Dashboard sends now go through a server route, the access token is no longer stored in browser-facing config/UI, inbound webhook signature verification is implemented, and the CRM-owned conversation model now supports role-scoped inbox reads.

---

## Why this doc exists

During the Phase 1 audit (`docs/AuditReport.md` §4.1, §4.4, §4.8) we identified multiple HIGH-severity issues with the WhatsApp integration.

**Current posture:** code no longer expects a WhatsApp token in Firestore. Set the real token as `WHATSAPP_ACCESS_TOKEN` for the Next.js server route and as `whatsapp-access-token` in Google Secret Manager for Cloud Functions. New chat UI should read from `whatsapp_conversations`, not the legacy flat `whatsapp_messages` collection.

## CRM-owned inbox model

- `whatsapp_messages` remains a legacy, Admin/SuperAdmin-only audit collection during migration.
- `whatsapp_conversations/{phone}` is the role-scoped inbox boundary. It denormalizes `assigned_to`, `lead_id`, phone/name preview fields, last-message metadata, unread count, and 24-hour service-window status.
- `whatsapp_conversations/{phone}/messages/{message}` stores inbound/outbound chat events and remains browser-read-only. All writes go through Admin SDK routes/webhooks.
- Sales Exec reads are allowed only when `whatsapp_conversations.assigned_to == request.auth.uid`; Admin and Super Admin can read all conversations. Channel Partner, Viewer, and Digital Marketing currently have no WhatsApp inbox access.
- Lead reassignment must call the server sync path so conversation ownership changes with the lead. This is the privacy line for shared-company-number messaging.
- Free-text outbound messages are allowed only while the 24-hour service window is open. Expired conversations require the approved-template flow.
- Dev deployment note: `elite-build-infra-tech-dev` currently has no WhatsApp Secret Manager entries. Create `whatsapp-access-token`, `whatsapp-app-secret`, and `whatsapp-webhook-verify-token`, then redeploy through `npm run deploy:dev` so Cloud Run receives `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, and `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

---

---

## Findings (from `docs/AuditReport.md`)

### 1. WhatsApp access token readable by any authenticated user (HIGH)
- **Where:** `crm_config/whatsapp` Firestore doc
- **Status:** remediated in code/rules. `crm_config/whatsapp` is admin-readable only, the config type no longer has `access_token`, and token inputs were removed from the Admin UI.
- **Remaining manual step:** delete any legacy `access_token` field still present in production Firestore and rotate the token.

### 2. WhatsApp send runs from the browser (HIGH)
- **Where:** `app/page.tsx` — send helper fetches `crm_config/whatsapp`, builds the Graph API call, attaches `Authorization: Bearer <token>`, and calls `graph.facebook.com` directly.
- **Status:** remediated. Browser calls now go to `POST /api/whatsapp/send` with a Firebase ID token. The server route verifies the user and attaches the Meta token server-side.

### 3. No inbound webhook signature verification (LOW → HIGH once inbound exists)
- **Status:** remediated for the Next.js webhook. The route verifies `X-Hub-Signature-256` using the raw request body and app secret before processing inbound messages/status events.
- **Remaining:** make sure the production deployment has the Meta app secret available in the runtime environment before exposing the webhook URL publicly.

### 4. No opt-out enforcement on server (MEDIUM)
- **Current state:** Opt-out is checked in the client (`app/page.tsx`) before calling the Graph API.
- **Why that's fragile:** Client-side checks can be bypassed. If the send moves to a server route (we plan this in #2) the opt-out check must move with it.

### 5. Template name leak via client read (LOW)
- **Where:** `crm_config/whatsapp.template_*` fields
- **Why it's minor:** Template names are not secrets, but exposing them simplifies reconnaissance. Low priority — fixed for free when we do #1.

---

## Remediation Plan (ordered by dependency)

### Phase A — Move send to server (unblocks everything else)

1. **Create `POST /api/whatsapp/send`** in the Next.js dashboard.
   - Verifies `Authorization: Bearer <Firebase ID token>` via `firebase-admin`.
   - Authorizes the caller — only roles with `send_whatsapp` capability may call it. Add that capability to `lib/utils/permissions.ts`.
   - Accepts `{ leadId, templateName, variables, mediaUrl? }` — **not** a raw message body. Never let the client compose the outbound text.
   - Loads the lead from Firestore on the server to resolve `phone` (prevents caller from sending to arbitrary numbers).
   - **Enforces opt-out on the server** — reject if `lead.whatsapp_opt_out === true`.
   - Re-uses the same fingerprint + lock scheme as `on_lead_match_update` (Cloud Function) to prevent duplicate sends.
   - Loads the access token from Secret Manager (see Phase B), **never** from Firestore.
   - Calls Graph API, logs to `lead.activity_log`.

2. **Remove all Graph API calls from `app/page.tsx`.** Replace with a `fetch('/api/whatsapp/send', ...)` call that includes the ID token in the header.

3. **Tighten Firestore rules on `crm_config/whatsapp`.**
   - Done: secret-bearing config docs are readable by Admin/SuperAdmin only.

### Phase B — Secret Manager migration

1. **Rotate the Meta access token.** Because it's been in a readable Firestore doc since launch, assume it's compromised. Generate a new long-lived access token via Meta Business.
2. **Store new token in Secret Manager** as `whatsapp-access-token` for Cloud Functions and as `WHATSAPP_ACCESS_TOKEN` in the Next.js runtime environment.
3. **Remove `access_token` from `crm_config/whatsapp`.** Keep `phone_number_id`, `business_account_id`, template names (non-secret).
4. **Update `WhatsAppConfig` TypeScript type** (`lib/types/config.ts`) to drop `access_token`.
5. **Update the Admin WhatsApp settings UI** — no access-token input; replace with a note directing admins to Secret Manager.

### Phase C — Inbound webhook and CRM-owned inbox

1. [x] Add a signed inbound webhook route.
2. [x] Verify `X-Hub-Signature-256` against the raw request body before parsing.
3. [ ] Store the production Meta app secret in Secret Manager and bind it to the Cloud Run runtime.
4. [x] Store inbound messages and status events through Admin SDK routes, not browser writes.
5. [x] Dual-write into `whatsapp_conversations` so the inbox can be role-scoped.
6. [ ] Add media download/storage, status-tick UI, and template-send UI.

### Phase D — Rate limiting & observability

1. Rate-limit `/api/whatsapp/send` per-user (e.g., 30 messages/min) to contain a compromised account.
2. Log every send to Cloud Logging with `{ caller_uid, lead_id, template, timestamp }` so an exfiltration attempt is visible.
3. Alert on anomalies (e.g., >100 sends/hour from a single user).

---

## Testing requirements (must exist before rollout)

Per `docs/TechDebtAndSecurityPosture.md` Phase 5, no security remediation ships without tests.

- **Firestore rules test:** `crm_config/whatsapp` is not readable by viewer / channel_partner / sales_exec. Readable by admin + superadmin.
- **API route test (`/api/whatsapp/send`):**
  - Rejects requests without a valid Firebase ID token (401).
  - Rejects callers without `send_whatsapp` capability (403).
  - Rejects sends to leads marked `whatsapp_opt_out` (409).
  - Dedups via fingerprint — two identical requests produce one send.
  - Does not expose the access token in the response on error.
- **Client test:** `app/page.tsx` imports no code that touches the Graph API directly.
- **Signature-verify test:** bad signature → 401; replay/dedup behavior should not create duplicate messages.

---

## Rollout checklist (when new number arrives)

1. [ ] Create/rotate a permanent access token (System User token, not user token).
2. [ ] Set `WHATSAPP_ACCESS_TOKEN` in the Next.js deployment environment.
3. [ ] Write `whatsapp-access-token` in Secret Manager for Cloud Functions.
4. [x] Implement server route + Firebase token verification.
5. [x] Tighten Firestore rules for `crm_config/whatsapp`.
6. [x] Update `WhatsAppConfig` type and admin UI.
7. [x] Run rules tests locally against emulator.
8. [ ] Deploy rules → deploy Next.js/functions → verify send works for an admin user.
9. [ ] Revoke OLD access token in Meta Business.
10. [ ] Remove `access_token` field from production Firestore `crm_config/whatsapp` doc.
11. [x] Build signed inbound webhook + role-scoped conversation collection.
12. [ ] Add approved-template picker/send path for expired 24-hour conversations.
13. [ ] Add media storage, delivery/read status UI, and push notifications.
14. [ ] Add rate-limiting + logging (Phase D).

---

## Deployment note

The correct sequence now is: set new server/cloud secrets → deploy rules/code/functions → verify sends → revoke old token → remove old Firestore field.
