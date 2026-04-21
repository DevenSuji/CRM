# Elite Build CRM - Project Context

## Executive Summary
An AI-native Real Estate CRM built for the Indian plotted development market. The system handles lead ingestion, high-resolution inventory matching, automated intent auditing, and features a full Next.js dashboard for inventory and admin management.

## Tech Stack
* **Cloud Provider:** Google Cloud Platform (GCP)
* **Region:** `asia-south1` (Mumbai)
* **Database:** Firestore Native Mode
* **Backend:** Python 3.11/3.13 (Cloud Functions Gen 2)
* **Frontend:** Next.js (App Router) in `elite-build-dashboard/`
* **AI Engine:** Google Gemini 1.5 Pro (via Vertex AI)
* **Storage:** Google Cloud Storage (GCS)

## Project Structure
- **`CRM/scripts/`**: Utility scripts (e.g., `seed_inventory.py`, `add_lead.py`).
- **`CRM/functions/`**: Cloud Functions including:
  - `meta_webhook` / `lead_ingestion_webhook`: Ingests leads from Meta Ads.
  - `match_lead`: Triggered on lead creation to match leads to inventory.
  - `check_site_visit_reminders`: Automated visit reminders.
  - `lead_cleanup` & `inventory_cleanup`: Maintenance functions.
- **`CRM/elite-build-dashboard/`**: The Next.js Admin & Inventory Console. Allows admins to add new projects, define attributes (Plotted Land, Apartment, Villa), and manage user access control.

## Core Features & Phases
1. **Cloud Core & Lead Ingestion (Phase 1 & 2)**
   - GCP infrastructure established.
   - Meta Ads Webhook deployed to receive lead payloads and write them to Firestore.
2. **Finite Inventory & Matching (Phase 3)**
   - Tracks plots/properties with attributes: location, size, price, facing, and status.
   - Budget-First Matcher automatically finds the best inventory for a lead based on: Status > Location > Budget > Facing.
   - Admin console allows dynamic attribute definition for different property types (Plotted Land, Apartment, Villa).
3. **Gemini Voice Auditor (Phase 4)**
   - Utilizes Gemini 1.5 Pro to analyze lead notes for "Construction" vs "Investment" intent and urgency.

## UI/UX & Coding Standards
* **Theme:** Dark Mode "Command Center" aesthetic (Gold `#D4AF37` / Emerald Green `#2ECC71`).
* **Strict Rule:** No emojis in any production code, comments, or terminal logs.
* **Architecture:** Modular Cloud Functions, performant async Firestore clients, and a robust Next.js Admin Console.

## Infrastructure Status
Currently deployed via `gcloud` CLI with plans to migrate to Terraform. Essential services (Firestore, Eventarc, Cloud Functions, AI Platform) are active. Requires specific IAM permissions (`roles/eventarc.serviceAgent`) for Gen 2 Firestore Triggers and a composite index on the `inventory` collection (location Asc, status Asc, price Desc) for the matching logic.