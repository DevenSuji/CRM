# Backup and Recovery Runbook

_Scope:_ Elite Build CRM Firestore data and business CSV exports.
_Primary project:_ `elite-build-crm`
_App path:_ `/Users/devensuji/Documents/github/CRM/CRM/elite-build-dashboard`

## Goals

1. Keep recoverable Firestore snapshots.
2. Keep human-readable lead and inventory CSV exports for emergency business continuity.
3. Avoid storing backups in git.
4. Make recovery rehearsable, not tribal knowledge.

## Local Manual Export

Run from the app folder:

```bash
cd /Users/devensuji/Documents/github/CRM/CRM/elite-build-dashboard
npm run backup:firestore
```

The script writes to:

```text
/Users/devensuji/Documents/github/CRM/CRM/elite-build-dashboard/backups/firestore-<timestamp>/
```

Output includes:

- `manifest.json` with collection counts.
- `<collection>.jsonl` files for machine-readable recovery.
- `leads.csv` for business review.
- `inventory.csv` for business review.

The `backups/` folder is gitignored.

Verify the export before treating it as usable:

```bash
npm run backup:verify -- --dir=/Users/devensuji/Documents/github/CRM/CRM/elite-build-dashboard/backups/firestore-<timestamp>
```

The verifier checks:

- `manifest.json` exists and is readable.
- every required collection export exists.
- JSONL document counts match the manifest.
- `leads.csv` and `inventory.csv` are present for emergency business continuity.

## Authentication

The export script uses Firebase Admin credentials in this order:

1. `FIREBASE_SERVICE_ACCOUNT_JSON`
2. `GOOGLE_APPLICATION_CREDENTIALS`
3. Google ADC from `gcloud auth application-default login`
4. Runtime-attached service account when run in GCP

Local setup:

```bash
gcloud auth application-default login
gcloud config set project elite-build-crm
```

## Collections Exported

Current default export list:

- `leads`
- `projects`
- `inventory`
- `project_schemas`
- `crm_config`
- `users`
- `marketing_teams`
- `whatsapp_messages`
- `whatsapp_send_locks`
- `whatsapp_send_failures`
- `processed_events`
- `audit_logs`
- `reverse_match_projects`
- `reverse_match_units`
- `no_match_intelligence`
- `demand_gap_reports`

To export a smaller set:

```bash
npm run backup:firestore -- --collections=leads,inventory,projects
```

To choose an output folder:

```bash
npm run backup:firestore -- --out=/secure/path/crm-backups
```

## Scheduled GCP Firestore Export

Recommended production setup:

1. Create a locked GCS bucket:

```bash
gcloud storage buckets create gs://elite-build-crm-firestore-backups \
  --project=elite-build-crm \
  --location=asia-south1 \
  --uniform-bucket-level-access
```

2. Enable object retention/versioning according to business policy:

```bash
gcloud storage buckets update gs://elite-build-crm-firestore-backups --versioning
```

3. Schedule daily export using Cloud Scheduler + Cloud Run/Cloud Function, or run manually:

```bash
gcloud firestore export gs://elite-build-crm-firestore-backups/$(date +%Y-%m-%d) \
  --project=elite-build-crm
```

4. Restrict bucket access to superadmin / platform operators only.

## Backup Readiness Gate

Before production deployment, mark each item with owner/date/evidence:

| Gate | Required Evidence | Status |
| --- | --- | --- |
| Local export works | `npm run backup:firestore` output path and successful `backup:verify` result | Passed on 2026-04-28 |
| Production bucket exists | GCS bucket name, region, retention/versioning setting | Passed on 2026-04-28 |
| Scheduled export exists | Cloud Scheduler/Run/Function job name or approved manual interim owner | Passed on 2026-04-28 |
| Restore rehearsal completed | staging project id, backup prefix, restore date, verifier notes | Passed on 2026-04-28 |
| Access reviewed | list of users/service accounts with bucket read/write permissions | Passed on 2026-04-28 |
| Incident owner named | primary and backup owner for restore decisions | Pending business sign-off |

## Recovery Procedure

Use a staging project first. Never restore directly into production without rehearsal.

1. Identify the backup timestamp and incident start time.
2. Freeze writes if production data corruption is ongoing.
3. Restore into staging:

```bash
gcloud firestore import gs://elite-build-crm-firestore-backups/<backup-prefix> \
  --project=<staging-project-id>
```

4. Validate:

- lead count
- inventory count
- booked unit consistency
- users and roles
- `crm_config`
- audit logs
- WhatsApp message/dedup/failure collections
- latest activity logs

5. Decide recovery strategy:

- Full restore into production for catastrophic loss.
- Selective repair using JSONL export for accidental deletes/edits.
- Manual business continuity using CSVs while repair is in progress.

6. After restore:

- Run unit/rules tests.
- Smoke test login, Leads, Projects, Admin Console.
- Verify matching functions and reverse-match snapshots.
- Record incident details in the audit log / incident notes.

## Rotation and Retention

Recommended MVP policy:

- Daily Firestore export: keep 30 days.
- Weekly export: keep 12 weeks.
- Monthly export: keep 12 months.
- Local manual exports: delete once verified in secure storage.

## Remaining Work

1. Add automated scheduled Firestore export in GCP.
2. Add encrypted offsite backup bucket policy.
3. Complete restore rehearsal with dates and sign-off.
4. Add admin UI export for leads/inventory CSV if business users need self-service exports.
5. Add audit log entries for manual export actions once exports are available through the app.

## Restore Rehearsal Sign-Off

| Date | Backup Prefix | Staging Project | Lead Count | Inventory Count | Role Smoke Result | Owner | Notes |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| 2026-04-28 | `gs://elite-build-crm-firestore-backups/rehearsal/20260428T091029Z` | `elite-build-infra-tech-dev` | 23 | 11 | Automated matrix/rules passed | Codex / Deven Suji account | See `docs/ProductionOpsVerification-2026-04-28.md` |
