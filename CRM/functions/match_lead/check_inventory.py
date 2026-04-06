from google.cloud import firestore

db = firestore.Client(project="elitebuild-crm")

print("--- Current Inventory in Firestore ---")
docs = db.collection('inventory').get()

if not docs:
    print("No documents found in 'inventory' collection.")

for doc in docs:
    d = doc.to_dict()
    print(f"ID: {doc.id} | Location: {d.get('location')} | Status: {d.get('status')} | Price: {d.get('price')}")