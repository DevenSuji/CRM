# Elite Build CRM

A real estate CRM platform built for the Indian plotted development market. Replaces fragmented workflows (Excel, WhatsApp, paper maps) with a unified system that manages lead ingestion from ad platforms, AI-powered inventory matching, a Kanban sales pipeline, and automated WhatsApp notifications.

## Architecture Overview

```
                    Meta Ads / Google Ads / Websites
                                |
                        POST (with API key)
                                |
                                v
                  +----------------------------+
                  | lead-ingestion-webhook     |  Cloud Function (HTTP)
                  | - Validates & sanitizes    |
                  | - Auto-tags project        |
                  | - Writes to Firestore      |
                  +----------------------------+
                                |
                        Firestore trigger
                                |
                                v
                  +----------------------------+
                  | match-lead                 |  Cloud Function (Eventarc)
                  | - Gemini 2.5 Flash intent  |
                  |   audit (urgency/intent)   |
                  | - Budget-first inventory   |
                  |   matching                 |
                  +----------------------------+
                                |
                                v
              +------------------------------------------+
              |           Firestore (asia-south1)        |
              |  leads | projects | inventory | users    |
              |  crm_config (whatsapp, exotel, kanban)   |
              +------------------------------------------+
                      ^                     ^
                      |                     |
            +------------------+   +----------------------------+
            | Next.js Dashboard|   | check-site-visit-reminders |
            | (Browser)        |   | Cloud Scheduler (30 min)   |
            | - Kanban board   |   | - WhatsApp reminders       |
            | - Dashboard      |   +----------------------------+
            | - Inventory      |
            | - Admin console  |   +----------------------------+
            +------------------+   | exotel-call-webhook        |
                                   | - Call status logging       |
                                   | - Gemini AI call summaries  |
                                   +----------------------------+
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4 |
| Database | Cloud Firestore (Native Mode, asia-south1) |
| Auth | Firebase Auth (Google Sign-In) + RBAC via Firestore |
| Backend | Python 3.13 Cloud Functions (Gen 2) |
| AI | Google Gemini 2.5 Flash via Vertex AI |
| Storage | Firebase Storage (project images, branding assets) |
| Messaging | WhatsApp Business API (Meta), Exotel (telephony) |
| Secrets | Google Secret Manager |
| Region | asia-south1 (Mumbai) |

## Project Structure

```
CRM/
├── CRM/
│   ├── elite-build-dashboard/        # Next.js frontend
│   │   ├── app/                      # Pages (App Router)
│   │   │   ├── page.tsx              # / - Kanban leads board
│   │   │   ├── dashboard/            # Metrics & analytics
│   │   │   ├── inventory/            # Inventory command center
│   │   │   ├── admin/                # Admin console (7 tabs)
│   │   │   │   └── projects/         # Project CRUD
│   │   │   ├── login/                # Google auth login
│   │   │   └── api/resolve-map-url/  # Google Maps URL resolver
│   │   ├── components/               # React components
│   │   ├── lib/                      # Firebase config, hooks, types, utils
│   │   ├── firestore.rules           # Firestore security rules
│   │   └── storage.rules             # Storage security rules
│   │
│   ├── functions/                    # Cloud Functions (Python)
│   │   ├── lead_ingestion_webhook/   # HTTP: receives leads from ad platforms
│   │   ├── match_lead/               # Eventarc: AI lead audit + inventory matching
│   │   ├── exotel_call_webhook/      # HTTP: call status from Exotel
│   │   └── check_site_visit_reminders/ # HTTP: Cloud Scheduler WhatsApp reminders
│   │
│   └── scripts/                      # CLI utilities
│       ├── add_lead.py               # Add leads from terminal
│       └── seed_inventory.py         # Populate test inventory
│
└── docs/                             # Documentation
    ├── INFRA_MIGRATION_LOG.md        # Infrastructure setup runbook
    ├── Phases.md                     # Project phases
    └── Inventory.md                  # Inventory schema spec
```

## Cloud Components

### Cloud Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `lead-ingestion-webhook` | HTTP POST | Receives leads from Meta Ads, Google Ads, websites. Validates input, authenticates via API key, auto-tags projects, writes to Firestore. |
| `match-lead` | Firestore document create (`leads/{leadId}`) | Runs Gemini 2.5 Flash to classify lead intent (Construction/Investment/Speculation) and urgency (High/Medium/Low). Matches lead to available inventory by budget, location, and facing preference. |
| `exotel-call-webhook` | HTTP POST | Receives call status callbacks from Exotel. On call completion, uses Gemini to generate a summary. Logs all call activity to the lead's activity log. |
| `check-site-visit-reminders` | HTTP (Cloud Scheduler, every 30 min) | Checks all leads with upcoming site visits. Sends WhatsApp reminders: day-before at 6 PM IST, morning-of at 8 AM IST. |

### Firestore Collections

| Collection | Purpose |
|-----------|---------|
| `leads` | Lead records with raw data, AI audit, activity log, site visits, callback requests, interested properties, UTM tracking |
| `projects` | Real estate projects with name, builder, location, property type, hero image, gallery |
| `inventory` | Property units within projects, with dynamic schema fields per property type |
| `users` | CRM user profiles with roles (admin, sales_exec, viewer) |
| `crm_config` | System configuration: kanban lanes, card colors, WhatsApp/Exotel credentials, branding, user count |

### Security

- **Firestore rules**: Role-based access. Admins get full CRUD, sales execs can read/write leads, viewers read-only. Cloud Functions (server SDK) bypass rules.
- **Storage rules**: Project images and branding publicly readable, authenticated write. Recordings authenticated only.
- **Webhook auth**: All HTTP Cloud Functions require an API key via `X-Webhook-Key` header. Keys stored in Google Secret Manager.
- **Input validation**: All webhook inputs are sanitized, length-limited, and format-validated.
- **RBAC**: Three roles (admin, sales_exec, viewer) enforced at both Firestore rules and UI component level.

### Secret Manager Secrets

| Secret | Used By |
|--------|---------|
| `webhook-api-key` | `lead-ingestion-webhook` - authenticates Meta/Google/Website webhook calls |
| `exotel-webhook-key` | `exotel-call-webhook` - authenticates Exotel callbacks |
| `scheduler-webhook-key` | `check-site-visit-reminders` - authenticates Cloud Scheduler |

## Dashboard Features

- **Kanban Board**: 7-lane drag-and-drop lead pipeline (New, First Call, Nurturing, Site Visit, Booked, Closed, Rejected). Customizable lanes via Admin Console.
- **Lead Detail**: Full lead profile with contact info, AI audit (intent/urgency), activity log, site visit scheduling, callback alarms, property tagging, WhatsApp integration.
- **Dashboard Metrics**: Pipeline value, revenue, lead-to-site-visit ratio, call volume, funnel analysis by source/demand/geography, associate leaderboard.
- **Inventory Command Center**: Browse projects and units, filter by status, dynamic fields per property type schema.
- **Admin Console**: Schema Architect (custom fields per property type), Kanban lane customization, WhatsApp/Exotel config, team management with RBAC, branding, card color palette.
- **Projects**: Full CRUD with multi-image gallery, Google Maps location autocomplete.
- **Theme**: Light/dark mode, 8 font families, 9 wallpaper gradients.

## Prerequisites

- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (`gcloud` CLI)
- [Node.js](https://nodejs.org/) 18+ and npm
- Python 3.13+
- A GCP project with billing enabled
- Firebase project linked to the GCP project

## Deployment

### 1. GCP Project Setup

```bash
# Authenticate
gcloud auth login
gcloud config set project elite-build-crm

# Enable required APIs
gcloud services enable \
    firestore.googleapis.com \
    aiplatform.googleapis.com \
    cloudfunctions.googleapis.com \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    eventarc.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com \
    logging.googleapis.com

# Create Firestore database (if not exists)
gcloud firestore databases create --location=asia-south1 --type=firestore-native
```

### 2. Secret Manager Setup

Generate API keys for webhook authentication:

```bash
# Create secrets
openssl rand -hex 32 | gcloud secrets create webhook-api-key --data-file=- --replication-policy=automatic
openssl rand -hex 32 | gcloud secrets create exotel-webhook-key --data-file=- --replication-policy=automatic
openssl rand -hex 32 | gcloud secrets create scheduler-webhook-key --data-file=- --replication-policy=automatic

# Grant Cloud Functions service account access
PROJECT_NUMBER=$(gcloud projects describe elite-build-crm --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for SECRET in webhook-api-key exotel-webhook-key scheduler-webhook-key; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor"
done
```

### 3. Deploy Firestore & Storage Rules

```bash
cd CRM/elite-build-dashboard
npm install -g firebase-tools   # if not installed
firebase deploy --only firestore:rules --project elite-build-crm
firebase deploy --only storage --project elite-build-crm
```

### 4. Deploy Cloud Functions

```bash
# Lead ingestion webhook (HTTP, public with API key auth)
gcloud functions deploy lead-ingestion-webhook \
  --gen2 --runtime=python313 --region=asia-south1 \
  --source=CRM/functions/lead_ingestion_webhook \
  --entry-point=ingest_universal_lead \
  --trigger-http --allow-unauthenticated \
  --memory=256MB --timeout=60s

# Exotel call webhook (HTTP, public with API key auth)
gcloud functions deploy exotel-call-webhook \
  --gen2 --runtime=python313 --region=asia-south1 \
  --source=CRM/functions/exotel_call_webhook \
  --entry-point=exotel_call_webhook \
  --trigger-http --allow-unauthenticated \
  --memory=512MB --timeout=120s

# Site visit reminders (HTTP, called by Cloud Scheduler)
gcloud functions deploy check-site-visit-reminders \
  --gen2 --runtime=python313 --region=asia-south1 \
  --source=CRM/functions/check_site_visit_reminders \
  --entry-point=check_reminders \
  --trigger-http --allow-unauthenticated \
  --memory=256MB --timeout=120s

# Lead matcher (Firestore trigger)
gcloud functions deploy match-lead \
  --gen2 --runtime=python313 --region=asia-south1 \
  --source=CRM/functions/match_lead \
  --entry-point=match_lead_to_inventory \
  --trigger-event-filters="type=google.cloud.firestore.document.v1.created" \
  --trigger-event-filters="database=(default)" \
  --trigger-event-filters-path-pattern="document=leads/{leadId}" \
  --trigger-location=asia-south1 \
  --memory=512MB --timeout=120s
```

### 5. Set Up Cloud Scheduler (for WhatsApp reminders)

```bash
SCHEDULER_KEY=$(gcloud secrets versions access latest --secret=scheduler-webhook-key)

gcloud scheduler jobs create http check-reminders-job \
  --schedule="*/30 * * * *" \
  --uri="https://asia-south1-elite-build-crm.cloudfunctions.net/check-site-visit-reminders" \
  --http-method=POST \
  --headers="X-Webhook-Key=${SCHEDULER_KEY}" \
  --location=asia-south1 \
  --time-zone="Asia/Kolkata"
```

### 6. Deploy Dashboard

```bash
cd CRM/elite-build-dashboard

# Create .env.local with your Firebase config
cat > .env.local << 'EOF'
NEXT_PUBLIC_FIREBASE_API_KEY="your-api-key"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="your-project-id"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your-project.firebasestorage.app"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
NEXT_PUBLIC_FIREBASE_APP_ID="your-app-id"
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="your-maps-key"
EOF

npm install
npm run build
npm start     # or deploy to Vercel / Cloud Run
```

### 7. First User Setup

1. Open the dashboard in a browser
2. Sign in with Google — the first user is automatically promoted to **admin**
3. Go to Admin Console > Team to pre-register other users by email

## Connecting Ad Platforms

### Webhook URL

```
https://asia-south1-elite-build-crm.cloudfunctions.net/lead-ingestion-webhook
```

### Authentication

All requests must include the API key in a header:

```
X-Webhook-Key: <your-key>
```

Retrieve the key:

```bash
gcloud secrets versions access latest --secret=webhook-api-key --project=elite-build-crm
```

### Meta Ads (Facebook/Instagram Lead Ads)

1. In Meta Ads Manager, create a Lead Ad campaign for a specific project
2. Under Integrations > CRM, select "Connect with Webhooks"
3. Set the webhook URL above
4. Add custom header: `X-Webhook-Key` with your API key
5. Map the form fields: `lead_name`, `phone`, `email`
6. Add hidden fields for attribution:
   - `source`: `Meta Ads`
   - `project_id`: the Firestore document ID of the project this ad promotes
   - `utm_source`: `facebook` or `instagram`
   - `utm_medium`: `cpc` or `social`
   - `utm_campaign`: your campaign name (e.g., `greenfield-mysore-apr2026`)

### Google Ads (Lead Form Extensions)

1. Create a Lead Form extension in Google Ads
2. Under "Webhook integration", set the URL and add the `X-Webhook-Key` header
3. Map fields similarly, setting `source` to `Google Ads`
4. Pass `project_id` and UTM parameters via hidden fields or the webhook URL query string:
   ```
   https://asia-south1-elite-build-crm.cloudfunctions.net/lead-ingestion-webhook?project_id=ABC123
   ```

### Website Contact Forms

POST JSON to the webhook with the API key header:

```bash
curl -X POST \
  https://asia-south1-elite-build-crm.cloudfunctions.net/lead-ingestion-webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Key: YOUR_KEY" \
  -d '{
    "lead_name": "Ravi Kumar",
    "phone": "+919876543210",
    "email": "ravi@example.com",
    "source": "Website",
    "budget": 7500000,
    "location": "Mysore",
    "interest": "Plotted Land",
    "note": "Looking for east-facing corner plot",
    "project_id": "FIRESTORE_PROJECT_DOC_ID",
    "utm_source": "website",
    "utm_medium": "organic",
    "utm_campaign": "homepage-contact-form"
  }'
```

### What Happens After a Lead is Submitted

1. The webhook validates and sanitizes all input
2. If `project_id` is provided, the lead is auto-tagged with the project (visible as "Property Interested In" on the Kanban card)
3. UTM data (source, medium, campaign) is stored and displayed on the lead card
4. The `match-lead` function triggers automatically:
   - Gemini 2.5 Flash classifies intent and urgency
   - Inventory is searched for matching plots by budget, location, and facing
5. The lead appears in the "New" lane on the Kanban board with:
   - Source badge (color-coded: blue for Meta, green for Google, purple for Website)
   - Project name (if tagged)
   - Campaign name (if UTM data provided)
   - AI urgency badge (High/Medium/Low)

### Supported Webhook Fields

| Field | Required | Description |
|-------|----------|-------------|
| `lead_name` / `full_name` / `name` | No (defaults to "Unknown") | Lead's full name |
| `phone` / `mobile` | No (defaults to "N/A") | Phone number |
| `email` / `email_address` | No (defaults to "N/A") | Email address |
| `source` | No (defaults to "Website") | Lead source (e.g., "Meta Ads", "Google Ads") |
| `budget` | No (defaults to 0) | Budget in INR |
| `location` | No | Preferred location |
| `interest` | No | Interest type (e.g., "Plotted Land", "Apartment") |
| `note` | No | Free-text note from the lead |
| `plan_to_buy` / `timeline` | No | Purchase timeline |
| `profession` | No | Lead's profession |
| `pref_facings` / `facing` | No | Array of preferred facings (e.g., ["East", "North"]) |
| `project_id` / `ad_project_id` / `utm_project_id` | No | Firestore project document ID for auto-tagging |
| `utm_source` | No | Campaign source (e.g., "facebook", "google") |
| `utm_medium` | No | Campaign medium (e.g., "cpc", "social", "organic") |
| `utm_campaign` | No | Campaign name |

## Local Development

```bash
# Dashboard
cd CRM/elite-build-dashboard
npm install
npm run dev    # http://localhost:3000

# Cloud Functions (test locally)
cd CRM/functions/lead_ingestion_webhook
pip install -r requirements.txt
WEBHOOK_API_KEY="test-key" functions-framework --target=ingest_universal_lead --port=8080
```

## RBAC Roles

| Role | Leads | Projects | Inventory | Admin Console | Team |
|------|-------|----------|-----------|---------------|------|
| **admin** | Full CRUD | Full CRUD | Full CRUD | Full access | Manage users |
| **sales_exec** | Read, Create, Update | Read | Read | No access | No access |
| **viewer** | Read only | Read | Read | No access | No access |
