#!/usr/bin/env python3
"""
Add a lead to the Elite Build CRM from the terminal.

Usage:
  python scripts/add_lead.py --name "Ravi Kumar" --phone "+919876543210"
  python scripts/add_lead.py --name "Priya Sharma" --phone "+919123456789" --email "priya@example.com" --budget 7500000 --location "Mysore" --interest "Plotted Land" --timeline "1-3 months" --note "Wants East-facing corner plot"

Requires:
  pip install google-cloud-firestore
  Must be authenticated via: gcloud auth application-default login
"""

import argparse
from google.cloud import firestore

def main():
    parser = argparse.ArgumentParser(description="Add a lead to Elite Build CRM")
    parser.add_argument("--name", required=True, help="Lead name")
    parser.add_argument("--phone", required=True, help="Phone number")
    parser.add_argument("--email", default="N/A", help="Email address")
    parser.add_argument("--budget", type=int, default=0, help="Budget in INR")
    parser.add_argument("--timeline", default="Not Specified",
                        choices=["Immediately", "1-3 months", "3-6 months", "6-12 months", "Just exploring", "Not Specified"],
                        help="Plan to buy timeline")
    parser.add_argument("--profession", default="Not Specified", help="Profession")
    parser.add_argument("--location", default="Unknown", help="Location")
    parser.add_argument("--interest", default="General Query",
                        choices=["Plotted Land", "Apartment", "Villa", "Commercial Building",
                                 "Agricultural Land", "Managed Farmland", "Rent", "General Query"],
                        help="Interest type")
    parser.add_argument("--note", default="Added via CLI", help="Notes")
    parser.add_argument("--source", default="CLI", help="Lead source")
    parser.add_argument("--facings", nargs="*", default=[], help="Preferred facings (e.g. East North)")

    args = parser.parse_args()

    db = firestore.Client(project="elite-build-crm")

    lead_payload = {
        "status": "New",
        "created_at": firestore.SERVER_TIMESTAMP,
        "source": args.source,
        "raw_data": {
            "lead_name": args.name,
            "phone": args.phone,
            "email": args.email,
            "budget": args.budget,
            "plan_to_buy": args.timeline,
            "profession": args.profession,
            "location": args.location,
            "note": args.note,
            "pref_facings": args.facings,
            "interest": args.interest,
        }
    }

    _, doc_ref = db.collection("leads").add(lead_payload)
    print(f"Lead created: {args.name} ({args.phone})")
    print(f"Document ID: {doc_ref.id}")
    print(f"Status: New | Source: {args.source}")

if __name__ == "__main__":
    main()
