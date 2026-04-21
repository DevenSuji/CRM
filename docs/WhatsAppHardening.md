# WhatsApp — Security Hardening Plan

_Created:_ 2026-04-21
_Status:_ **BLOCKED** on new WhatsApp Business Account number. No code changes until the new number is provisioned.

---

## Why this doc exists

During the Phase 1 audit (`docs/AuditReport.md` §4.1, §4.4, §4.8) we identified multiple HIGH-severity issues with the current WhatsApp integration. The user is waiting on a new WhatsApp Business number before any WhatsApp code can change — patching the live number now would break the existing send flow, and the new number is close enough that re-work is wasteful.

**This doc captures the full plan so that when the new number lands, remediation is a checklist — not a re-investigation.**

---

## Findings (from `docs/AuditReport.md`)

### 1. WhatsApp access token readable by any authenticated user (HIGH)
- **Where:** `crm_config/whatsapp` Firestore doc
- **Why it's broken:** `firestore.rules` allows any `isActive()` user to `read` `crm_config/*`. Viewer, Channel Partner, anyone — all can pull the Meta Graph token via browser devtools.
- **Impact:** Token can be used to send messages from our business number to any number, bypassing our CRM entirely. Reputation + compliance risk.

### 2. WhatsApp send runs from the browser (HIGH)
- **Where:** `app/page.tsx` — send helper fetches `crm_config/whatsapp`, builds the Graph API call, attaches `Authorization: Bearer <token>`, and calls `graph.facebook.com` directly.
- **Why it's broken:** Token is in browser memory and on the wire. Any user with the app loaded has a live sending credential.
- **Impact:** Compromise of *any* user account = ability to send from our business number.

### 3. No inbound webhook signature verification (LOW → HIGH once inbound exists)
- **Current state:** No inbound WhatsApp webhook is wired up yet.
- **Future risk:** When we wire inbound (delivery receipts, replies), Meta signs requests with HMAC-SHA256 via `X-Hub-Signature-256`. The existing `lead_ingestion_webhook` pattern (shared secret in header) is **not** sufficient for Meta — signature verification is required or anyone can POST fake events.

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
   - `allow read: if isSuperAdmin() || isAdmin()` (only admins need to see the config UI).
   - Keep `write` restricted to superadmin.

### Phase B — Secret Manager migration

1. **Rotate the Meta access token.** Because it's been in a readable Firestore doc since launch, assume it's compromised. Generate a new long-lived access token via Meta Business.
2. **Store new token in Secret Manager** as `whatsapp-access-token` (already exists for the `on_lead_match_update` Cloud Function — reuse the same secret).
3. **Remove `access_token` from `crm_config/whatsapp`.** Keep `phone_number_id`, `business_account_id`, template names (non-secret).
4. **Update `WhatsAppConfig` TypeScript type** (`lib/types/config.ts`) to drop `access_token`.
5. **Update the Admin WhatsApp settings UI** — no access-token input; replace with a note directing admins to Secret Manager.

### Phase C — Inbound webhook (when we need it)

1. Add a `POST /api/webhooks/whatsapp-inbound` (or a Cloud Function).
2. Verify `X-Hub-Signature-256`:
   ```
   expected = hmac_sha256(app_secret, raw_request_body)
   if not hmac.compare_digest(expected, header_value): 401
   ```
3. Store `app_secret` in Secret Manager as `whatsapp-app-secret`.
4. Handle subscription types we care about: `messages` (replies), `message_status` (delivery/read).
5. Dedup by `event_id` via `processed_events` collection (same pattern as `lead_ingestion_webhook`).

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
- **Signature-verify test** (when Phase C ships): bad signature → 401; replay of a processed event → 200 with no side effects.

---

## Rollout checklist (when new number arrives)

1. [ ] Provision new number in Meta Business; note `phone_number_id`.
2. [ ] Create new permanent access token (System User token, not user token).
3. [ ] Write `whatsapp-access-token` secret in Secret Manager.
4. [ ] Implement Phase A (server route + permission + rules tightening).
5. [ ] Run rules + API tests locally against emulator.
6. [ ] Deploy rules → deploy Next.js → verify send works for an admin user.
7. [ ] Revoke OLD access token in Meta Business (after verifying new path works).
8. [ ] Remove `access_token` field from Firestore `crm_config/whatsapp` doc.
9. [ ] Update `WhatsAppConfig` type and admin UI (Phase B #4, #5).
10. [ ] If inbound webhook needed: Phase C.
11. [ ] Add rate-limiting + logging (Phase D).
12. [ ] Mark findings §4.1 and §4.4 as REMEDIATED in `docs/AuditReport.md`.

---

## What NOT to do before the new number lands

- Don't rotate the **current** access token — users' in-browser sessions will start failing and we have no server-side fallback yet.
- Don't tighten Firestore rules on `crm_config/whatsapp` — the current client reads it.
- Don't add the server route yet — it needs the token in Secret Manager to work, and rotating on the old number is the wrong order.

The correct sequence is: new number → new token in Secret Manager → server route shipped → old token revoked → old Firestore field removed. Skipping steps breaks live sends.
