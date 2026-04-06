from google.cloud import firestore

db = firestore.Client(project="elitebuild-crm")

def cleanup_database():
    print("🚀 Starting Elite Build CRM Cleanup...")

    # 1. Clear Test Leads
    leads_ref = db.collection('leads')
    leads = leads_ref.get()
    print(f"🗑️ Deleting {len(leads)} test leads...")
    for lead in leads:
        lead.reference.delete()
    print("✅ Leads collection cleared.")

    # 2. Standardize Inventory
    # Let's fix those 'Location: None' issues once and for all
    inventory_ref = db.collection('inventory')
    plots = inventory_ref.get()
    
    print(f"🛠️ Standardizing {len(plots)} inventory items...")
    for plot in plots:
        data = plot.to_dict()
        
        # Define the 'Golden Standard' for your plots
        updates = {
            "status": data.get("status", "Available"),
            "location": data.get("location") or "Huyilalu", # Defaulting to your main area
            "price": float(data.get("price", 0)),
            "facing": data.get("facing") or "North"
        }
        
        plot.reference.update(updates)
        print(f"  Fixed Plot: {plot.id}")

    print("\n✨ Database is now clean and production-ready.")

if __name__ == "__main__":
    cleanup_database()