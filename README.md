# Elite Build CRM

Elite Build CRM is a real-estate CRM for plotted development and project sales. It brings lead capture, lead assignment, property matching, projects/inventory, overdue tasks, WhatsApp foundations, dashboard reporting, role-based access, and backup/export operations into one system.

The current development environment is:

| Item | Value |
|------|-------|
| GCP project name | Elite Build CRM |
| GCP project ID | `elite-build-infra-tech-dev` |
| GCP project number | `484810469771` |
| Region | `asia-south1` |
| Cloud Run service | `elite-build-crm-dev` |
| Dev app URL | `https://elite-build-crm-dev-484810469771.asia-south1.run.app` |
| Production domain plan | `crm.elitebuild.in` |

WhatsApp configuration is intentionally parked until a dedicated company WhatsApp number is ready. The code foundation exists, but production Meta credentials are not expected in dev.

## Architecture

```text
Ad platforms / website forms / manual CRM entry
        |
        v
lead-ingestion-webhook and CRM lead APIs
        |
        v
Cloud Firestore
  leads | projects | inventory | users | crm_config
  audit_logs | whatsapp_conversations | whatsapp_messages
        |
        +--> match_lead Cloud Function
        |      - normalizes buyer requirements
        |      - matches leads to inventory/projects
        |      - writes match scores and activity context
        |
        +--> Next.js CRM on Cloud Run
               - Firebase Auth Google sign-in
               - Firestore rules for browser access
               - Admin SDK API routes for privileged mutations
               - role-scoped pages and dashboards
```

High-risk browser actions have been moved behind server routes where needed, including lead booking/unbooking, lifecycle merge/delete/archive actions, lead assignment resolution, WhatsApp send/link/create flows, branding, geocode/map URL resolution, and note polishing.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 App Router, React 19, Tailwind CSS v4 |
| Hosting | Cloud Run |
| Auth | Firebase Auth with Google Sign-In |
| Database | Cloud Firestore Native Mode |
| Storage | Firebase Storage |
| Backend APIs | Next.js route handlers with Firebase Admin SDK |
| Cloud Functions | Python 3.13 Gen 2 |
| AI | Gemini API / Vertex AI where configured |
| Tests | Vitest, Firebase Rules Unit Testing |
| Operations | GCloud CLI, Firebase CLI, guarded deploy scripts |

## Current App Routes

| Route | Purpose |
|-------|---------|
| `/login` | Google sign-in and CRM access resolution |
| `/` | Main Kanban leads board |
| `/dashboard` | C-suite metrics, stats, and charts |
| `/tasks` | Overdue tasks plus daily briefing work queue |
| `/projects` | Projects, inventory units, campaigns, assigned Channel Partner access |
| `/whatsapp` | WhatsApp inbox foundation, parked until Meta number setup |
| `/admin` | Admin Console for team, assignment, branding, config, schema, and governance |
| `/coming-soon` | Placeholder roles with no active module access |

Dashboard should stay focused on leadership reporting: stats and strong graphs for C-suite users. Execution work belongs in `/tasks`, leads, projects, or admin pages.

## Repository Layout

```text
CRM/
├── CRM/
│   ├── elite-build-dashboard/
│   │   ├── app/
│   │   │   ├── page.tsx                 # Leads Kanban
│   │   │   ├── dashboard/page.tsx       # Role-scoped dashboard
│   │   │   ├── tasks/page.tsx           # Overdue tasks and daily briefing
│   │   │   ├── projects/page.tsx        # Projects and inventory
│   │   │   ├── whatsapp/page.tsx        # WhatsApp foundation
│   │   │   ├── admin/page.tsx           # Admin Console
│   │   │   ├── login/page.tsx           # Sign-in
│   │   │   └── api/                     # Admin SDK and server-side APIs
│   │   ├── components/
│   │   ├── lib/
│   │   ├── scripts/
│   │   │   ├── deploy-cloud-run.mjs
│   │   │   ├── export-firestore.mjs
│   │   │   └── verify-firestore-backup.mjs
│   │   ├── firestore.rules
│   │   ├── firestore.indexes.json
│   │   └── storage.rules
│   ├── functions/
│   │   ├── lead_ingestion_webhook/
│   │   ├── match_lead/
│   │   ├── on_lead_match_update/
│   │   ├── check_site_visit_reminders/
│   │   ├── inventory_cleanup/           # Guarded manual utility, not app runtime
│   │   └── lead_cleanup/                # Guarded manual utility, not app runtime
│   └── scripts/
│       ├── add_lead.py
│       └── seed_inventory.py
├── docs/
└── tech_debt_remediation.md
```

There is no active `app/inventory/` route and no active `app/admin/projects/` route. Inventory work is handled through `/projects`.

## Core Features

- Lead Kanban with stages, assignment, data-quality signals, AI score pill, color tags, callbacks, site visits, and activity history.
- Role-scoped dashboards for leadership, sales, Channel Partners, and marketing boundaries.
- Overdue task queue scoped by role, merged with daily briefing work.
- Project and inventory management with project images, units, buyer matching, campaign metadata, and Channel Partner project assignments.
- Admin Console for team onboarding, pending-user migration, lead assignment settings, branding, schema/config, and governance.
- Inventory Intelligence and Data Quality/Governance utilities for cleaner long-term CRM data.
- Server-side audit logging for sensitive API actions.
- WhatsApp foundation with role-scoped conversation model, currently parked until a dedicated number and Meta configuration are ready.
- Backup/export scripts for Firestore JSONL and business CSV exports.

## RBAC Summary

| Role | Current access model |
|------|----------------------|
| `superadmin` | Full CRM access, all dashboards, all leads, all tasks, all projects, all admin/team actions. |
| `admin` | Admin operations and broad visibility, but cannot promote/delete Super Admins. Admin task views exclude Super Admin assigned work. |
| `sales_exec` | Own assigned leads plus eligible unassigned non-Channel-Partner leads. Own overdue tasks only. No Admin Console and no Marketing Team dashboard. |
| `channel_partner` | Only own/allowed leads and assigned projects. No internal team details. Overdue tasks only for own/allowed leads. |
| `digital_marketing` | Project/campaign workflow access. No Overdue Tasks access. |
| `viewer` | Limited read-only/placeholder access. No Overdue Tasks access. |
| `hr`, `payroll_finance` | Placeholder roles for future modules; currently routed to `/coming-soon`. |

Security is enforced in both places:

- UI/query scoping for usability.
- Firestore rules and Admin SDK route guards for the real boundary.

## Local Development

```bash
cd CRM/elite-build-dashboard
npm install
npm run dev
```

The dev server defaults to `http://localhost:3000`. Use another port if that port is already occupied.

Required local environment values:

```text
NEXT_PUBLIC_FIREBASE_API_KEY="..."
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="elite-build-infra-tech-dev.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="elite-build-infra-tech-dev"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="elite-build-infra-tech-dev.firebasestorage.app"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="..."
NEXT_PUBLIC_FIREBASE_APP_ID="..."
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="..."
ROOT_SUPERADMIN_EMAIL="devensuji@gmail.com"
```

Server secrets such as `GEMINI_API_KEY` and future WhatsApp secrets should come from Secret Manager in deployed environments, not from committed files.

## Validation Commands

```bash
cd CRM/elite-build-dashboard

npm run test
npm run test:coverage
npm run test:smoke
npm run test:rules
npx tsc --noEmit
npm run build
npm run lint
```

Current lint is allowed to pass with warnings while tracked in `tech_debt_remediation.md`. Do not turn warning cleanup into broad behavior changes.

## Dev Deployment

Use the guarded Cloud Run deploy script instead of raw ad-hoc `gcloud run deploy` commands:

```bash
cd CRM/elite-build-dashboard
npm run deploy:dev:dry-run
npm run deploy:dev
```

The script validates public Firebase/Maps environment values, runs local checks unless explicitly skipped, deploys a no-traffic candidate revision first, smoke-tests the candidate, and promotes traffic only after validation.

Cloud Run dev target:

| Setting | Value |
|---------|-------|
| Service | `elite-build-crm-dev` |
| Region | `asia-south1` |
| Project | `elite-build-infra-tech-dev` |
| Runtime service account | `crm-cloud-run-dev@elite-build-infra-tech-dev.iam.gserviceaccount.com` |

Optional WhatsApp secrets are detected by the deploy script when present:

- `whatsapp-access-token`
- `whatsapp-app-secret`
- `whatsapp-webhook-verify-token`

## Firestore And Storage Rules

From the app folder:

```bash
cd CRM/elite-build-dashboard
firebase deploy --only firestore:rules,firestore:indexes --project elite-build-infra-tech-dev
firebase deploy --only storage --project elite-build-infra-tech-dev
```

Always run rules tests first:

```bash
npm run test:rules
```

## Backup And Restore Readiness

Local export:

```bash
cd CRM/elite-build-dashboard
npm run backup:firestore
npm run backup:verify -- --dir=backups/firestore-<timestamp>
```

The export script writes to the gitignored `CRM/elite-build-dashboard/backups/` folder and includes core CRM collections, audit logs, WhatsApp collections, JSONL data, CSV exports for leads/inventory, and a manifest.

See `docs/BackupRecoveryRunbook.md` and `docs/StagingUATChecklist.md` before production.

## Lead Ingestion

Primary Cloud Function:

```text
lead-ingestion-webhook
```

Supported fields include:

| Field | Required | Description |
|-------|----------|-------------|
| `lead_name`, `full_name`, `name` | No | Buyer name |
| `phone`, `mobile` | No | Buyer phone |
| `email`, `email_address` | No | Buyer email |
| `source` | No | Source such as Website, Meta Ads, Google Ads |
| `budget` | No | Budget in INR |
| `location` | No | Preferred location |
| `interest` | No | Property interest |
| `note` | No | Free-text buyer note |
| `plan_to_buy`, `timeline` | No | Purchase timeline |
| `profession` | No | Buyer profession |
| `project_id`, `ad_project_id`, `utm_project_id` | No | Project tagging |
| `utm_source`, `utm_medium`, `utm_campaign` | No | Campaign attribution |

Webhook inputs are sanitized and normalized before writing to Firestore. Source hygiene and data quality checks are part of the CRM data strategy.

## Manual Utilities Warning

The cleanup utilities under `CRM/functions/inventory_cleanup/` and `CRM/functions/lead_cleanup/` are dangerous manual scripts. They are not part of the app runtime. They now default to dry-run and require:

- `--project-id`
- `--execute`
- `ELITEBUILD_ALLOW_DANGEROUS_CLEANUP="I_UNDERSTAND_THIS_DELETES_DATA"`
- exact typed confirmation of the target project

Do not run them casually.

## Production Notes

- Production will use a different Google account and a production GCP/Firebase project.
- Production domain target is `crm.elitebuild.in`.
- Before production, complete role-view UAT, backup restore rehearsal, final Security Audit Pass 2 checks, production secrets, domain mapping, and code freeze.
- Keep `tech_debt_remediation.md` updated for every tech-debt cleanup or deletion.
