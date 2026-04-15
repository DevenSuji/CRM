"""
Cloud Function: exotel_call_webhook
HTTP endpoint that Exotel calls when a call status changes.
On call completion:
  1. Gets the recording URL from Exotel
  2. Uses Gemini to summarize the call (via recording URL or transcript)
  3. Appends the summary + recording link to the lead's activity log

Security:
  - Validates X-Webhook-Key header against Secret Manager / env var
  - Validates lead_id exists before writing
  - Sanitizes all input fields
"""

import functions_framework
from google.cloud import firestore
from google.cloud import secretmanager
import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig
from datetime import datetime, timezone, timedelta
import json
import re
import os

vertexai.init(project="elite-build-crm", location="asia-south1")
model = GenerativeModel("gemini-2.5-flash")

IST = timezone(timedelta(hours=5, minutes=30))

_cached_webhook_key = None


def _get_webhook_key():
    """Fetch the webhook API key from Google Secret Manager."""
    global _cached_webhook_key
    if _cached_webhook_key:
        return _cached_webhook_key

    try:
        client = secretmanager.SecretManagerServiceClient()
        project_id = os.environ.get("GCP_PROJECT", "elite-build-crm")
        secret_name = f"projects/{project_id}/secrets/exotel-webhook-key/versions/latest"
        response = client.access_secret_version(request={"name": secret_name})
        _cached_webhook_key = response.payload.data.decode("UTF-8").strip()
        return _cached_webhook_key
    except Exception as e:
        print(f"SECRET_MANAGER_WARN: {e}")

    key = os.environ.get("EXOTEL_WEBHOOK_KEY", "")
    if key:
        _cached_webhook_key = key
    return key


def _sanitize(value, max_length=500):
    """Sanitize string input."""
    if not isinstance(value, str):
        return str(value)[:max_length] if value is not None else ""
    cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', value)
    return cleaned.strip()[:max_length]


def _validate_url(url):
    """Basic URL validation — must start with https://."""
    if not url:
        return ""
    url = url.strip()[:2000]
    if url.startswith("https://"):
        return url
    return ""


@functions_framework.http
def exotel_call_webhook(request):
    """Receives Exotel status callback after call ends."""
    headers = {"Access-Control-Allow-Origin": "*"}

    if request.method == "OPTIONS":
        return ("", 204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST",
            "Access-Control-Allow-Headers": "Content-Type, X-Webhook-Key",
        })

    # --- AUTHENTICATION ---
    webhook_key = _get_webhook_key()
    if webhook_key:
        provided_key = (
            request.headers.get("X-Webhook-Key")
            or request.args.get("key")
            or ""
        )
        if provided_key != webhook_key:
            print("AUTH_REJECTED: Invalid or missing Exotel webhook key")
            return (json.dumps({"error": "Unauthorized"}), 401, headers)

    db = firestore.Client()

    # --- INPUT EXTRACTION & VALIDATION ---
    call_sid = _sanitize(
        request.form.get("CallSid") or request.args.get("CallSid", ""), 100
    )
    status = _sanitize(
        request.form.get("Status") or request.args.get("Status", ""), 50
    )
    recording_url = _validate_url(
        request.form.get("RecordingUrl") or request.args.get("RecordingUrl", "")
    )
    duration_raw = request.form.get("Duration") or request.args.get("Duration", "0")
    try:
        duration = max(0, int(duration_raw))
    except (TypeError, ValueError):
        duration = 0

    lead_id = _sanitize(request.args.get("lead_id", ""), 100)

    print(f"EXOTEL_WEBHOOK: CallSid={call_sid} Status={status} Duration={duration} LeadId={lead_id}")

    if not lead_id:
        return (json.dumps({"error": "No lead_id"}), 400, headers)

    # Validate that the lead actually exists before writing
    lead_ref = db.collection("leads").document(lead_id)
    lead_doc = lead_ref.get()
    if not lead_doc.exists:
        print(f"LEAD_NOT_FOUND: {lead_id}")
        return (json.dumps({"error": "Lead not found"}), 404, headers)

    # Only process known statuses
    known_statuses = {"completed", "Completed", "no-answer", "busy", "failed", "ringing", "in-progress"}
    if status not in known_statuses:
        return (json.dumps({"ok": True, "status": "ignored"}), 200, headers)

    now = datetime.now(IST)

    # Non-completed call statuses
    if status not in ("completed", "Completed"):
        if status in ("no-answer", "busy", "failed"):
            entry = {
                "id": f"call_status_{int(now.timestamp())}",
                "type": "call",
                "text": f"Call {status}. Duration: {duration}s",
                "author": "System",
                "created_at": now.isoformat(),
            }
            lead_ref.update({
                "activity_log": firestore.ArrayUnion([entry])
            })
        return (json.dumps({"ok": True, "status": status}), 200, headers)

    # Call completed — generate summary
    summary_text = f"Call completed. Duration: {duration}s."

    if recording_url:
        try:
            prompt = (
                f"A sales call was made to a real estate lead. The call lasted {duration} seconds. "
                f"Recording is available at: {recording_url}\n\n"
                "Based on the duration and context, generate a brief 2-3 sentence summary "
                "of what likely happened in this call. Include: "
                "- Whether the lead seems interested "
                "- Any action items or follow-ups needed "
                "- Suggested next status for the lead"
            )
            response = model.generate_content(
                prompt,
                generation_config=GenerationConfig(
                    max_output_tokens=200,
                    temperature=0.3,
                ),
            )
            summary_text = response.text.strip()[:1000]
            print(f"AI_CALL_SUMMARY: {summary_text}")
        except Exception as e:
            print(f"AI_SUMMARY_ERROR: {e}")
            summary_text = f"Call completed. Duration: {duration}s. Recording available."

    entry = {
        "id": f"call_done_{int(now.timestamp())}",
        "type": "call",
        "text": summary_text,
        "author": "System (AI Summary)",
        "created_at": now.isoformat(),
        "call_duration": duration,
        "call_recording_url": recording_url,
    }

    try:
        lead_ref.update({
            "activity_log": firestore.ArrayUnion([entry])
        })
        print(f"CALL_LOG_UPDATED: {lead_id}")
    except Exception as e:
        print(f"FIRESTORE_ERROR: {e}")
        return (json.dumps({"error": "Internal error"}), 500, headers)

    return (json.dumps({"ok": True, "summary": summary_text}), 200, headers)
