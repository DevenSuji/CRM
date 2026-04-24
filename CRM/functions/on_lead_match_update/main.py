"""
Cloud Function: on_lead_match_update
Firestore-triggered (onDocumentUpdated leads/{leadId}).

Fires when a lead's system-matched interested_properties change (written by the
client-side matcher in usePropertyMatching.ts). Sends a WhatsApp template message
to the lead summarizing matched projects, exactly once per distinct match set.

Guardrails:
  1. Fingerprint dedup — skip if the system-match set is unchanged from last send.
  2. Server-side lock (whatsapp_send_locks/{leadId}, 60s TTL) — prevents concurrent
     sends across retries / tabs / users.
  3. Event-id dedup (processed_events/{eventId}) — Pub/Sub may redeliver events.
  4. Never sends for opted-out leads (whatsapp_opt_out == True).
  5. On failure, does NOT update the fingerprint, so the next matcher write retries.

Config:
  - crm_config/whatsapp (Firestore): phone_number_id, template_property_match, enabled
  - Secret Manager: whatsapp-access-token (preferred) — falls back to
    crm_config/whatsapp.access_token for transition.

Activity log entry on success:
  { type: 'whatsapp_sent', sent_by: 'system-match',
    projects: [projectName, ...], created_at: <ISO>, author: 'System (Auto-Match)' }
"""

import functions_framework
from google.cloud import firestore
from google.cloud import secretmanager
from google.cloud.firestore_v1.transforms import Sentinel
from datetime import datetime, timezone, timedelta
import requests
import json
import os

IST = timezone(timedelta(hours=5, minutes=30))

_cached_access_token = None


def _get_access_token(fallback_from_config):
    """Fetch WhatsApp access token from Secret Manager; fall back to config doc."""
    global _cached_access_token
    if _cached_access_token:
        return _cached_access_token

    try:
        client = secretmanager.SecretManagerServiceClient()
        project_id = os.environ.get("GCP_PROJECT", "elite-build-crm")
        secret_name = f"projects/{project_id}/secrets/whatsapp-access-token/versions/latest"
        response = client.access_secret_version(request={"name": secret_name})
        _cached_access_token = response.payload.data.decode("UTF-8").strip()
        return _cached_access_token
    except Exception as e:
        print(f"SECRET_MANAGER_WARN: {e}")

    if fallback_from_config:
        _cached_access_token = fallback_from_config
    return _cached_access_token or ""


def _system_match_fingerprint(interested_properties):
    """Stable fingerprint of system-match entries — mirrors client-side shape."""
    if not interested_properties:
        return ""
    parts = []
    for p in interested_properties:
        if p.get("tagged_by") != "system-match":
            continue
        parts.append(
            f"{p.get('projectId', '')}:{p.get('matchedUnitCount', 0)}:{p.get('bestPrice', 0)}:{p.get('distanceKm', '')}:{p.get('matchScore', 0)}:{'~'.join(p.get('matchReasons', []))}"
        )
    parts.sort()
    return "|".join(parts)


def _clean_phone(phone):
    """Normalize an Indian phone number for WhatsApp Graph API."""
    if not phone or phone == "N/A":
        return ""
    cleaned = "".join(c for c in phone if c.isdigit() or c == "+")
    if cleaned.startswith("+"):
        cleaned = cleaned[1:]
    if len(cleaned) == 10:
        cleaned = "91" + cleaned
    return cleaned


def _send_whatsapp_template(wa_config, access_token, to_phone, template_name, params):
    """Send a WhatsApp template. Returns (ok, response_dict)."""
    url = f"https://graph.facebook.com/v21.0/{wa_config['phone_number_id']}/messages"
    body = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": "en"},
            "components": [{
                "type": "body",
                "parameters": [{"type": "text", "text": str(p)} for p in params],
            }],
        },
    }
    try:
        resp = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=10,
        )
        if resp.status_code == 200:
            return True, resp.json()
        return False, {"status": resp.status_code, "body": resp.text[:500]}
    except Exception as e:
        return False, {"error": str(e)}


def _try_acquire_lock(db, lead_id, ttl_seconds=60):
    """Transactionally acquire a send lock. Returns True if acquired."""
    lock_ref = db.collection("whatsapp_send_locks").document(lead_id)

    @firestore.transactional
    def _txn(txn):
        snap = lock_ref.get(transaction=txn)
        now = datetime.now(timezone.utc)
        if snap.exists:
            data = snap.to_dict()
            expires_at = data.get("expires_at")
            if expires_at and expires_at > now:
                return False
        txn.set(lock_ref, {
            "acquired_at": now,
            "expires_at": now + timedelta(seconds=ttl_seconds),
        })
        return True

    return _txn(db.transaction())


def _release_lock(db, lead_id):
    try:
        db.collection("whatsapp_send_locks").document(lead_id).delete()
    except Exception as e:
        print(f"LOCK_RELEASE_WARN: {e}")


@functions_framework.cloud_event
def on_lead_match_update(cloud_event):
    """Handle Firestore update events on leads/{leadId}."""
    db = firestore.Client()

    event_id = cloud_event.get("id") or cloud_event.get("Id") or ""
    subject = cloud_event.get("subject", "")
    if not subject:
        return

    lead_id = subject.split("/")[-1]
    print(f"ON_LEAD_MATCH_UPDATE: event={event_id} lead={lead_id}")

    # --- Event-id dedup (Pub/Sub can redeliver) ---
    if event_id:
        processed_ref = db.collection("processed_events").document(event_id)
        if processed_ref.get().exists:
            print(f"EVENT_ALREADY_PROCESSED: {event_id}")
            return
        processed_ref.set({
            "processed_at": firestore.SERVER_TIMESTAMP,
            "lead_id": lead_id,
        })

    # --- Load the lead ---
    lead_ref = db.collection("leads").document(lead_id)
    lead_snap = lead_ref.get()
    if not lead_snap.exists:
        return
    lead = lead_snap.to_dict()

    # --- Opt-out gate ---
    if lead.get("whatsapp_opt_out"):
        print(f"OPT_OUT: {lead_id}")
        return

    # --- Fingerprint dedup ---
    new_fp = _system_match_fingerprint(lead.get("interested_properties", []))
    if not new_fp:
        # No system matches (matches dried up or none found). Nothing to send.
        return
    if lead.get("last_sent_match_fingerprint") == new_fp:
        print(f"FINGERPRINT_UNCHANGED: {lead_id}")
        return

    # --- Phone available? ---
    raw = lead.get("raw_data", {})
    phone = _clean_phone(raw.get("phone", ""))
    if not phone:
        print(f"NO_PHONE: {lead_id}")
        return

    # --- Load WhatsApp config ---
    wa_doc = db.collection("crm_config").document("whatsapp").get()
    if not wa_doc.exists:
        print("WA_CONFIG_MISSING")
        return
    wa_config = wa_doc.to_dict()
    if not wa_config.get("enabled"):
        print("WA_DISABLED")
        return
    if not wa_config.get("phone_number_id"):
        print("WA_NO_PHONE_NUMBER_ID")
        return
    template_name = wa_config.get("template_property_match", "").strip()
    if not template_name:
        print("WA_NO_TEMPLATE_CONFIGURED")
        return

    access_token = _get_access_token(wa_config.get("access_token"))
    if not access_token:
        print("WA_NO_ACCESS_TOKEN")
        return

    # --- Acquire lock ---
    if not _try_acquire_lock(db, lead_id):
        print(f"LOCK_HELD: {lead_id}")
        return

    now = datetime.now(IST)
    system_matches = [
        p for p in lead.get("interested_properties", [])
        if p.get("tagged_by") == "system-match"
    ]
    project_names = [p.get("projectName", "") for p in system_matches if p.get("projectName")]

    # Template params: [lead_name, project_count, top_project_name]
    # Admin configures actual template on Meta; keep params compact and obvious.
    params = [
        raw.get("lead_name", "there"),
        str(len(system_matches)),
        project_names[0] if project_names else "a matching project",
    ]

    try:
        ok, resp = _send_whatsapp_template(
            wa_config, access_token, phone, template_name, params
        )

        if ok:
            # Update fingerprint + activity log atomically
            activity_entry = {
                "id": f"wa_match_{int(now.timestamp())}",
                "type": "whatsapp_sent",
                "sent_by": "system-match",
                "text": f"Auto-sent match summary: {', '.join(project_names[:3])}"
                        + ("..." if len(project_names) > 3 else ""),
                "author": "System (Auto-Match)",
                "projects": project_names,
                "created_at": now.isoformat(),
            }
            lead_ref.update({
                "last_sent_match_fingerprint": new_fp,
                "last_match_send_at": firestore.SERVER_TIMESTAMP,
                "activity_log": firestore.ArrayUnion([activity_entry]),
            })
            print(f"WA_MATCH_SENT: lead={lead_id} projects={len(project_names)}")
        else:
            # Log failure for admin review. DO NOT update fingerprint — next
            # matcher write will retry naturally.
            db.collection("whatsapp_send_failures").add({
                "lead_id": lead_id,
                "phone": phone,
                "template": template_name,
                "fingerprint": new_fp,
                "response": resp,
                "failed_at": firestore.SERVER_TIMESTAMP,
            })
            print(f"WA_MATCH_FAIL: lead={lead_id} resp={resp}")
    finally:
        _release_lock(db, lead_id)
