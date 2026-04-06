import functions_framework
from google.cloud import firestore

db = firestore.Client()

@functions_framework.cloud_event
def match_lead_to_inventory(cloud_event):
    data = cloud_event.data
    lead_data = data["value"]["fields"]
    
    # Extract attributes
    budget = float(lead_data.get("budget", {}).get("doubleValue", 0))
    # Handling array for facings
    pref_facings_data = lead_data.get("pref_facings", {}).get("arrayValue", {}).get("values", [])
    pref_facings = [f.get("stringValue") for f in pref_facings_data]
    location = lead_data.get("location", {}).get("stringValue", "Huyilalu")
    
    lead_id = cloud_event["source"].split('/')[-1]

    print(f"Processing Lead {lead_id} | Budget: {budget} | Location: {location}")

    # Query for Available plots within Budget and Location
    potential_plots = db.collection('inventory') \
        .where('status', '==', 'Available') \
        .where('location', '==', location) \
        .where('price', '<=', budget) \
        .order_by('price', direction=firestore.Query.DESCENDING) \
        .limit(5).get()

    best_match = None
    
    # Tie-breaker: Facing preference
    for plot_doc in potential_plots:
        plot = plot_doc.to_dict()
        if plot.get('facing') in pref_facings:
            best_match = plot_doc.id
            break 
    
    if not best_match and potential_plots:
        best_match = potential_plots[0].id

    if best_match:
        print(f"Match Found: {best_match}")
        db.collection('leads').document(lead_id).update({
            'suggested_plot': best_match,
            'status': 'Matched',
            'matched_at': firestore.SERVER_TIMESTAMP
        })
    else:
        print(f"No match found for criteria.")