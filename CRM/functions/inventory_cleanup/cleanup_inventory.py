from google.cloud import firestore

db = firestore.Client(project="elitebuild-crm")

def wipe_inventory():
    plots = db.collection('inventory').get()
    if not plots:
        print("Inventory is already empty.")
        return
        
    print(f"🗑️ Deleting {len(plots)} plots from inventory...")
    for plot in plots:
        plot.reference.delete()
    print("✅ Inventory wiped clean.")

if __name__ == "__main__":
    wipe_inventory()