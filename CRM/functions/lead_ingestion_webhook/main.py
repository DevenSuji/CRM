import functions_framework
from google.cloud import firestore
from google.cloud import secretmanager
from datetime import datetime, timezone
import re
import json
import os

db = firestore.Client()

# --- CONFIGURATION ---
# Allowed origins for CORS (restrict to your actual domains in production)
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
# Max field lengths to prevent abuse
MAX_NAME_LENGTH = 200
MAX_PHONE_LENGTH = 20
MAX_EMAIL_LENGTH = 254
MAX_NOTE_LENGTH = 2000
MAX_LOCATION_LENGTH = 300
MAX_FIELD_LENGTH = 500

# Cache the webhook key so we don't fetch it on every request
_cached_webhook_key = None


def _get_webhook_key():
    """Fetch the webhook API key from Google Secret Manager."""
    global _cached_webhook_key
    if _cached_webhook_key:
        return _cached_webhook_key

    # Try Secret Manager first
    try:
        client = secretmanager.SecretManagerServiceClient()
        project_id = os.environ.get("GCP_PROJECT", "elite-build-crm")
        secret_name = f"projects/{project_id}/secrets/webhook-api-key/versions/latest"
        response = client.access_secret_version(request={"name": secret_name})
        _cached_webhook_key = response.payload.data.decode("UTF-8").strip()
        return _cached_webhook_key
    except Exception as e:
        print(f"SECRET_MANAGER_WARN: {e}")

    # Fallback to environment variable (for local testing)
    key = os.environ.get("WEBHOOK_API_KEY", "")
    if key:
        _cached_webhook_key = key
    return key


def _sanitize_string(value, max_length=MAX_FIELD_LENGTH):
    """Sanitize a string input: strip, truncate, remove control characters."""
    if not isinstance(value, str):
        return str(value)[:max_length] if value is not None else ""
    # Remove control characters (keep newlines/tabs in notes)
    cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', value)
    return cleaned.strip()[:max_length]


def _validate_phone(phone):
    """Basic phone validation: digits, spaces, dashes, parens, plus sign."""
    if not phone or phone == "N/A":
        return phone
    cleaned = re.sub(r'[^\d+\-\s()]', '', phone)
    return cleaned[:MAX_PHONE_LENGTH] if cleaned else "N/A"


def _validate_email(email):
    """Basic email format validation."""
    if not email or email == "N/A":
        return email
    email = email.strip().lower()[:MAX_EMAIL_LENGTH]
    if re.match(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$', email):
        return email
    return "N/A"


def _validate_budget(budget):
    """Ensure budget is a non-negative number."""
    try:
        val = float(budget)
        return max(0, val)
    except (TypeError, ValueError):
        return 0


def _cors_headers(origin="*"):
    """Return CORS headers, restricted to allowed origins."""
    if ALLOWED_ORIGINS == ["*"]:
        return {"Access-Control-Allow-Origin": "*"}
    if origin in ALLOWED_ORIGINS:
        return {"Access-Control-Allow-Origin": origin}
    return {"Access-Control-Allow-Origin": ALLOWED_ORIGINS[0]}


@functions_framework.http
def ingest_universal_lead(request):
    origin = request.headers.get("Origin", "*")

    # Handle CORS preflight
    if request.method == "OPTIONS":
        headers = {
            **_cors_headers(origin),
            "Access-Control-Allow-Methods": "POST",
            "Access-Control-Allow-Headers": "Content-Type, X-Webhook-Key",
            "Access-Control-Max-Age": "3600",
        }
        return ("", 204, headers)

    headers = _cors_headers(origin)

    # --- AUTHENTICATION ---
    # Check for API key in header or query parameter
    webhook_key = _get_webhook_key()
    if webhook_key:
        provided_key = (
            request.headers.get("X-Webhook-Key")
            or request.args.get("key")
            or ""
        )
        if provided_key != webhook_key:
            print("AUTH_REJECTED: Invalid or missing webhook key")
            return (json.dumps({"error": "Unauthorized"}), 401, headers)

    # --- INPUT PARSING ---
    data = request.get_json(silent=True)
    if not data:
        return (json.dumps({"error": "No data received"}), 400, headers)

    # Reject absurdly large payloads (basic sanity check)
    if len(json.dumps(data)) > 10000:
        return (json.dumps({"error": "Payload too large"}), 413, headers)

    # --- FIELD EXTRACTION & VALIDATION ---
    lead_name = _sanitize_string(
        data.get("lead_name") or data.get("full_name") or data.get("name") or "Unknown",
        MAX_NAME_LENGTH,
    )
    phone = _validate_phone(
        data.get("phone") or data.get("mobile") or "N/A"
    )
    email = _validate_email(
        data.get("email") or data.get("email_address") or "N/A"
    )
    source = _sanitize_string(data.get("source") or "Website", 100)
    budget = _validate_budget(data.get("budget", 0))

    # --- PROJECT ATTRIBUTION FROM ADS ---
    project_id = _sanitize_string(
        data.get("project_id")
        or data.get("ad_project_id")
        or data.get("utm_project_id")
        or "",
        100,
    ) or None

    # UTM campaign tracking
    utm_source = _sanitize_string(data.get("utm_source", ""), 200)
    utm_medium = _sanitize_string(data.get("utm_medium", ""), 200)
    utm_campaign = _sanitize_string(data.get("utm_campaign", ""), 200)

    # Build the lead payload
    lead_payload = {
        "status": "New",
        "created_at": firestore.SERVER_TIMESTAMP,
        "source": source,
        "raw_data": {
            "lead_name": lead_name,
            "phone": phone,
            "email": email,
            "budget": budget,
            "plan_to_buy": _sanitize_string(
                data.get("plan_to_buy") or data.get("timeline") or "Not Specified", 200
            ),
            "profession": _sanitize_string(data.get("profession", "Not Specified"), 200),
            "location": _sanitize_string(data.get("location", "Unknown"), MAX_LOCATION_LENGTH),
            "note": _sanitize_string(data.get("note", "No note provided"), MAX_NOTE_LENGTH),
            "pref_facings": data.get("pref_facings") or data.get("facing", []),
            "interest": _sanitize_string(data.get("interest", "General Query"), 200),
        },
    }

    # Ensure pref_facings is a list of sanitized strings
    facings = lead_payload["raw_data"]["pref_facings"]
    if isinstance(facings, list):
        lead_payload["raw_data"]["pref_facings"] = [
            _sanitize_string(f, 50) for f in facings[:10]
        ]
    else:
        lead_payload["raw_data"]["pref_facings"] = []

    # Add UTM tracking if present
    if utm_source or utm_medium or utm_campaign:
        lead_payload["utm"] = {
            "source": utm_source,
            "medium": utm_medium,
            "campaign": utm_campaign,
        }

    # Auto-tag the project if project_id was provided
    if project_id:
        try:
            project_id_str = str(project_id)
            project_doc = db.collection("projects").document(project_id_str).get()
            if project_doc.exists:
                p = project_doc.to_dict()
                lead_payload["interested_properties"] = [
                    {
                        "projectId": project_id_str,
                        "projectName": p.get("name", ""),
                        "location": p.get("location", ""),
                        "propertyType": p.get("propertyType", ""),
                        "heroImage": p.get("heroImage"),
                        "tagged_at": datetime.now(timezone.utc).isoformat(),
                        "tagged_by": "system",
                    }
                ]
        except Exception as e:
            print(f"PROJECT_LOOKUP_WARN: {e}")

    try:
        doc_ref = db.collection("leads").add(lead_payload)
        print(f"LEAD_INGESTED: {doc_ref[1].id} source={source} project={project_id}")
        return (
            json.dumps({
                "success": True,
                "lead_id": doc_ref[1].id,
                "project_tagged": bool(project_id),
            }),
            200,
            headers,
        )
    except Exception as e:
        print(f"INGESTION_ERROR: {e}")
        return (json.dumps({"success": False, "error": "Internal error"}), 500, headers)
