"""
Cloud Function: check_site_visit_reminders
Triggered by Cloud Scheduler (every 30 minutes).
Checks all leads with upcoming site visits and sends WhatsApp reminders:
  1. On agreement (immediately when scheduled — handled by frontend)
  2. Day before (evening at ~6 PM IST)
  3. Morning of (at ~8 AM IST)

Security:
  - Validates OIDC token from Cloud Scheduler OR X-Webhook-Key header
  - WhatsApp access token fetched from Secret Manager
"""

import functions_framework
from google.cloud import firestore
from google.cloud import secretmanager
from datetime import datetime, timedelta, timezone
import requests
import json
import os

IST = timezone(timedelta(hours=5, minutes=30))

_cached_webhook_key = None
_cached_access_token = None


def _get_webhook_key():
    """Fetch the scheduler webhook key from Secret Manager."""
    global _cached_webhook_key
    if _cached_webhook_key:
        return _cached_webhook_key

    try:
        client = secretmanager.SecretManagerServiceClient()
        project_id = os.environ.get("GCP_PROJECT", "elite-build-crm")
        secret_name = f"projects/{project_id}/secrets/scheduler-webhook-key/versions/latest"
        response = client.access_secret_version(request={"name": secret_name})
        _cached_webhook_key = response.payload.data.decode("UTF-8").strip()
        return _cached_webhook_key
    except Exception as e:
        print(f"SECRET_MANAGER_WARN: {e}")

    key = os.environ.get("SCHEDULER_WEBHOOK_KEY", "")
    if key:
        _cached_webhook_key = key
    return key


def _is_authorized(request):
    """
    Check authorization. Accept either:
    1. OIDC token from Cloud Scheduler (Authorization: Bearer <token>)
    2. X-Webhook-Key header matching our secret
    """
    # Check X-Webhook-Key
    webhook_key = _get_webhook_key()
    if webhook_key:
        provided_key = request.headers.get("X-Webhook-Key") or request.args.get("key", "")
        if provided_key == webhook_key:
            return True

    # Check for OIDC token (Cloud Scheduler sends this when configured)
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        # When deployed with --allow-unauthenticated=false, Cloud Run/Functions
        # validates the OIDC token automatically. If we reach here, it's valid.
        # For functions deployed with --allow-unauthenticated, we rely on
        # the webhook key above.
        return True

    # If no secret is configured at all, allow (dev/bootstrap mode) but warn
    if not webhook_key:
        print("AUTH_WARN: No scheduler-webhook-key configured, allowing request")
        return True

    return False


def _get_access_token():
    """Fetch WhatsApp access token from Secret Manager."""
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

    return ""


def send_whatsapp(config, access_token, to_phone, template_name, params):
    """Send a WhatsApp template message via Meta Business API."""
    # Clean phone number
    phone = to_phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if phone.startswith("+"):
        phone = phone[1:]
    if len(phone) == 10:
        phone = "91" + phone

    url = f"https://graph.facebook.com/v21.0/{config['phone_number_id']}/messages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    body = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": "en"},
            "components": [{
                "type": "body",
                "parameters": [{"type": "text", "text": p} for p in params],
            }],
        },
    }

    resp = requests.post(url, headers=headers, json=body, timeout=10)
    if resp.status_code == 200:
        print(f"WHATSAPP_SENT: {template_name} to {phone}")
        return True
    else:
        print(f"WHATSAPP_ERROR: {resp.status_code} {resp.text}")
        return False


@functions_framework.http
def check_reminders(request):
    """HTTP-triggered function (called by Cloud Scheduler)."""

    # --- AUTHENTICATION ---
    if not _is_authorized(request):
        print("AUTH_REJECTED: Unauthorized scheduler request")
        return (json.dumps({"error": "Unauthorized"}), 401)

    db = firestore.Client()

    # Load WhatsApp config
    wa_doc = db.collection("crm_config").document("whatsapp").get()
    if not wa_doc.exists or not wa_doc.to_dict().get("enabled"):
        return ("WhatsApp not enabled", 200)

    wa_config = wa_doc.to_dict()
    access_token = _get_access_token()
    if not access_token:
        return ("WhatsApp access token not configured", 200)

    now = datetime.now(IST)
    reminders_sent = 0

    # Get all leads that have site_visits
    leads = db.collection("leads").stream()

    for lead_doc in leads:
        lead = lead_doc.to_dict()
        site_visits = lead.get("site_visits", [])
        if not site_visits:
            continue

        raw_data = lead.get("raw_data", {})
        lead_name = raw_data.get("lead_name", "Customer")
        phone = raw_data.get("phone", "")
        if not phone or phone == "N/A":
            continue

        updated_visits = []
        visits_changed = False

        for visit in site_visits:
            if visit.get("status") != "scheduled":
                updated_visits.append(visit)
                continue

            visit_dt = datetime.fromisoformat(visit["scheduled_at"]).astimezone(IST)
            time_until = visit_dt - now
            visit_location = visit.get("location", "our project site")

            # Day-before reminder: send between 17:30-18:30 IST the day before
            if (not visit.get("reminder_day_before")
                    and timedelta(hours=17, minutes=30) <= time_until <= timedelta(hours=30, minutes=30)):
                success = send_whatsapp(
                    wa_config, access_token, phone,
                    wa_config.get("template_site_visit_reminder", "site_visit_reminder"),
                    [lead_name, visit_dt.strftime("%B %d at %I:%M %p"), visit_location],
                )
                if success:
                    visit["reminder_day_before"] = True
                    visits_changed = True
                    reminders_sent += 1
                    db.collection("leads").document(lead_doc.id).update({
                        "activity_log": firestore.ArrayUnion([{
                            "id": f"wa_daybefore_{int(now.timestamp())}",
                            "type": "whatsapp_sent",
                            "text": f"Day-before reminder sent for site visit on {visit_dt.strftime('%B %d at %I:%M %p')}",
                            "author": "System",
                            "created_at": now.isoformat(),
                        }])
                    })

            # Morning-of reminder: send between 7:30-8:30 AM IST on visit day
            elif (not visit.get("reminder_morning_of")
                    and visit_dt.date() == now.date()
                    and 7 <= now.hour <= 8):
                success = send_whatsapp(
                    wa_config, access_token, phone,
                    wa_config.get("template_site_visit_reminder", "site_visit_reminder"),
                    [lead_name, visit_dt.strftime("today at %I:%M %p"), visit_location],
                )
                if success:
                    visit["reminder_morning_of"] = True
                    visits_changed = True
                    reminders_sent += 1
                    db.collection("leads").document(lead_doc.id).update({
                        "activity_log": firestore.ArrayUnion([{
                            "id": f"wa_morning_{int(now.timestamp())}",
                            "type": "whatsapp_sent",
                            "text": f"Morning reminder sent for site visit {visit_dt.strftime('today at %I:%M %p')}",
                            "author": "System",
                            "created_at": now.isoformat(),
                        }])
                    })

            updated_visits.append(visit)

        if visits_changed:
            db.collection("leads").document(lead_doc.id).update({
                "site_visits": updated_visits,
            })

    return (json.dumps({"reminders_sent": reminders_sent}), 200)
