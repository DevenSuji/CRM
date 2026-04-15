import functions_framework
from google.cloud import firestore
import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig
from google.cloud.firestore_v1.base_query import FieldFilter
import json

# Initialize AI Engine with the NEW stable model
vertexai.init(project="elite-build-crm", location="asia-south1")
model = GenerativeModel("gemini-2.5-flash")

@functions_framework.cloud_event
def match_lead_to_inventory(cloud_event):
    db = firestore.Client()
    subject = cloud_event.get("subject")
    if not subject: return
    
    lead_id = subject.split('/')[-1]
    lead_ref = db.collection('leads').document(lead_id)
    lead_doc = lead_ref.get()
    
    if not lead_doc.exists: return
    data = lead_doc.to_dict()
    lead_info = data.get('raw_data', {})
    
    # --- 1. GEMINI 2.5 INTENT AUDIT ---
    lead_note = lead_info.get('note', '')
    ai_results = {"intent": "General", "urgency": "Medium"}
    
    if lead_note:
        prompt = (
            f"Analyze this real estate lead note: '{lead_note}'. "
            "Classify 'intent' as (Construction/Investment/Speculation) "
            "and 'urgency' as (High/Medium/Low)."
        )
        try:
            # Force JSON output mode for reliable parsing
            response = model.generate_content(
                prompt,
                generation_config=GenerationConfig(
                    response_mime_type="application/json"
                )
            )
            ai_results = json.loads(response.text)
            print(f"AI_AUDIT_SUCCESS: {ai_results}")
        except Exception as e:
            print(f"AI_AUDIT_ERROR: {e}")

    # --- 2. MATCHING LOGIC (With FieldFilter to stop warnings) ---
    budget = float(lead_info.get('budget', 0))
    location = lead_info.get('location', 'Unknown')
    pref_facings = lead_info.get('pref_facings', [])

    print(f"MATCH_LOG: Processing {lead_id} | Budget: {budget} | Location: {location}")

    # The clean syntax that Firestore prefers
    query = db.collection('inventory') \
        .where(filter=FieldFilter('status', '==', 'Available')) \
        .where(filter=FieldFilter('location', '==', location)) \
        .where(filter=FieldFilter('price', '<=', budget)) \
        .order_by('price', direction=firestore.Query.DESCENDING).limit(5)

    potential_plots = query.get()
    best_match = None
    
    for plot_doc in potential_plots:
        plot = plot_doc.to_dict()
        if plot.get('facing') in pref_facings:
            best_match = plot_doc.id
            break 
    
    if not best_match and potential_plots:
        best_match = potential_plots[0].id

    # --- 3. CRM UPDATE ---
    update_payload = {
        'ai_audit': ai_results,
        'ai_audit_complete': True,
        'matched_at': firestore.SERVER_TIMESTAMP
    }
    
    if best_match:
        update_payload['suggested_plot'] = best_match
        update_payload['status'] = 'Matched'
        print(f"MATCH_LOG: SUCCESS! Match Found: {best_match}")
    
    lead_ref.update(update_payload)