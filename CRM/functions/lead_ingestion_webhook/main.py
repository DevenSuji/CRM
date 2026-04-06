import functions_framework
from google.cloud import firestore

db = firestore.Client()

@functions_framework.http
def ingest_universal_lead(request):
    # Handle CORS for your Website Form
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)

    headers = {'Access-Control-Allow-Origin': '*'}
    data = request.get_json(silent=True)
    
    if not data:
        return ("No data received", 400, headers)

    # --- THE UNIVERSAL MAPPING LOGIC ---
    # This logic tries to find the lead details regardless of the source
    lead_name = data.get('lead_name') or data.get('full_name') or data.get('name', 'Unknown')
    phone = data.get('phone') or data.get('mobile') or 'N/A'
    
    # Identify where the lead came from (default to Web if not specified)
    source = data.get('source') or 'Website' 
    
    # The payload we want to send to our Firestore 'leads' collection
    lead_payload = {
        "status": "New",
        "created_at": firestore.SERVER_TIMESTAMP,
        "source": source,
        "raw_data": {
            "lead_name": lead_name,
            "phone": phone,
            "budget": data.get('budget', 0),
            "location": data.get('location', 'Unknown'),
            "note": data.get('note', 'No note provided'),
            "pref_facings": data.get('pref_facings') or data.get('facing', []),
            "interest": data.get('interest', 'General Query')
        }
    }

    try:
        # This write will automatically trigger your match-lead/AI function!
        doc_ref = db.collection('leads').add(lead_payload)
        return ({"success": True, "lead_id": doc_ref[1].id}, 200, headers)
    except Exception as e:
        print(f"INGESTION_ERROR: {e}")
        return ({"success": False, "error": str(e)}, 500, headers)