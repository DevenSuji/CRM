# 🛠️ Infrastructure & Migration Runbook
**Environment:** Development (Sandbox)
**Project ID:** `elitebuild-crm`
**Target State:** Infrastructure as Code (Terraform)
**Last Updated:** March 30, 2026

---

## 1. Project Initialization & Auth
*Establishes the developer identity and local environment keys.*

```bash
# Authenticate the local machine
gcloud auth login

# Set the active project context
gcloud config set project elitebuild-crm

# Set Application Default Credentials (ADC) for local Python scripts
gcloud auth application-default login
2. Billing & API "Hard Gates"
These services must be enabled BEFORE resources can be declared in Terraform.

Manual Intervention: RBI Compliance (India). Manual prepayment of ₹1,000 was required to activate the billing account 013D3D-939E1A-CDE223.

API Enablement Commands:

Bash
gcloud services enable \
    firestore.googleapis.com \
    aiplatform.googleapis.com \
    cloudfunctions.googleapis.com \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    eventarc.googleapis.com \
    logging.googleapis.com
3. IAM & Service Agent Permissions
Manual bindings required for Gen 2 Firestore Event-Triggered functions.

Bash
# Get Project Number
PROJECT_NUMBER=$(gcloud projects describe elitebuild-crm --format="value(projectNumber)")

# Grant Eventarc Service Agent roles to allow Firestore events to trigger functions
gcloud projects add-iam-policy-binding elitebuild-crm \
    --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-eventarc.iam.gserviceaccount.com" \
    --role="roles/eventarc.serviceAgent"

gcloud projects add-iam-policy-binding elitebuild-crm \
    --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-eventarc.iam.gserviceaccount.com" \
    --role="roles/pubsub.publisher"
4. Resource Provisioning (The "Hardware")
Physical assets deployed in the Mumbai (asia-south1) region.

Firestore Database:

Bash
# Created in Native Mode
gcloud firestore databases create --location=asia-south1 --type=firestore-native
Storage Buckets:

Bash
# Public Assets (Brochures/Maps)
gsutil mb -l asia-south1 gs://elitebuild-assets
# Private Recordings (Sales Calls)
gsutil mb -l asia-south1 gs://elitebuild-recordings
5. Serverless Deployment (Phases 1-3)
Meta Webhook (HTTP Ingestion):

Bash
gcloud functions deploy meta-webhook \
    --gen2 \
    --runtime=python311 \
    --region=asia-south1 \
    --source=./functions/meta_webhook \
    --entry-point=meta_webhook \
    --trigger-http \
    --allow-unauthenticated
Lead Matcher (Firestore Event Trigger):
Note: Memory allocation set to 512Mi to prevent Container Healthcheck timeouts.

Bash
gcloud functions deploy match-lead \
    --gen2 \
    --runtime=python311 \
    --region=asia-south1 \
    --memory=512Mi \
    --source=./functions/match_lead \
    --entry-point=match_lead_to_inventory \
    --trigger-location=asia-south1 \
    --trigger-event-filters="type=google.cloud.firestore.document.v1.created" \
    --trigger-event-filters="database=(default)" \
    --trigger-event-filters-path-pattern="document=leads/{leadId}"
6. Database Indexes (Composite)
Required for the Budget-First/Location matching logic.

Collection: inventory

Fields: location (Ascending), status (Ascending), price (Descending).

Status: Created March 30, 2026.

📝 Terraform Translation Notes
Provider: Use google provider version ~> 5.0.

Resource google_firestore_index: Must be explicitly defined in .tf to avoid manual console intervention in production.

Resource google_cloud_run_v2_service: Gen 2 Functions are managed as Cloud Run services.

IAM: Define roles/datastore.user for the Cloud Function service account.