# Production Ops Verification - 2026-04-28

_Scope:_ Backup automation, restore rehearsal, and staging role-view/privacy verification for Elite Build CRM.

## Google Cloud Projects

| Purpose | Project ID | Notes |
| --- | --- | --- |
| Earlier backup/restore source | `elite-build-crm` | Source project used for the restore rehearsal and existing backup automation. Not the current deployment target unless explicitly redirected. |
| Current deployment target / restore rehearsal | `elite-build-infra-tech-dev` | Firestore Native database created in `asia-south1`; current deployment target for now. |

Current CLI account used for this operations run: `devensuji@gmail.com`.

Deployment target clarification: as of 2026-04-28, all current deployment work should run from `devensuji@gmail.com` (`DevenSuji@gmail.com`, case-insensitive) against `elite-build-infra-tech-dev` / project number `484810469771`. The earlier `elite-build-crm` project remains the source project used for this backup/restore rehearsal unless explicitly redirected.

Local cloud context verified after the clarification:

- `gcloud` active account: `devensuji@gmail.com`.
- `gcloud` active project: `elite-build-infra-tech-dev`.
- Application Default Credentials quota project: `elite-build-infra-tech-dev`.
- Firebase project initialized for `elite-build-infra-tech-dev`.
- Firebase Web App registered as `elite-build-crm-web`.
- Default Firebase Storage bucket initialized at `elite-build-infra-tech-dev.firebasestorage.app` in `ASIA-SOUTH1`.
- Firestore rules/indexes and Storage rules deployed to `elite-build-infra-tech-dev`.

## Dev Cloud Run Deployment

| Gate | Result | Evidence |
| --- | --- | --- |
| Cloud Run APIs enabled | Passed | `run.googleapis.com`, `cloudbuild.googleapis.com`, `artifactregistry.googleapis.com`, `iamcredentials.googleapis.com` |
| Service deployed | Passed | `elite-build-crm-dev`, `asia-south1` |
| Live URL smoke check | Passed | `https://elite-build-crm-dev-484810469771.asia-south1.run.app/login` returns `200` |
| Runtime service account | Passed | `crm-cloud-run-dev@elite-build-infra-tech-dev.iam.gserviceaccount.com` |
| Runtime IAM | Passed | `roles/datastore.user`, `roles/firebaseauth.viewer` |
| Firebase Auth initialized | Passed | Identity Toolkit config created |
| Authorized domains | Passed | Firebase defaults, `localhost`, and both Cloud Run domains |
| Google sign-in provider | Passed | Google provider enabled with project OAuth Web client |
| OAuth popup smoke test | Passed | Browser click reaches Google Accounts sign-in for `elite-build-infra-tech-dev.firebaseapp.com` |
| Real Super Admin login | Passed | `devensuji@gmail.com` logged in successfully on 2026-04-29 |
| Duplicate Super Admin profile cleanup | Passed | Stale UID `8t9G7COmPDPmtIQSzoBL5AFeaum2` deactivated/demoted; lead references moved to active UID `z3nefR1HqMfu5yUYsvuYAvzwW3k2` |
| Role UAT pending users seeded | Passed | `uat.admin@elitebuild.in`, `uat.sales@elitebuild.in`, `uat.channelpartner@elitebuild.in`, `uat.marketing@elitebuild.in`, `uat.viewer@elitebuild.in` |
| Admin pending-user normalization | Passed | Fixed mixed-case pending ID migration; normalized `elitebuildinfratech@gmail.com` to `pending_elitebuildinfratech_gmail_com`; deployed `elite-build-crm-dev-00005-xp8` |
| Admin Lead Assignment config access | Passed | Firestore rules now allow Admin/Super Admin reads for `crm_config/lead_assignment`; non-admin roles remain blocked |
| Branding tab wiring | Passed | Saved branding now drives login and top nav via sanitized `/api/branding`; deployed `elite-build-crm-dev-00006-mpj` |
| Branding banner guardrails | Passed | Branding banner upload now requires minimum `1600 x 900px` landscape assets; deployed `elite-build-crm-dev-00007-hw8` |
| Admin Team onboarding | Passed | Admin can create safe pending non-Super-Admin users; Super Admin remains required for role/status/delete and Super Admin onboarding; deployed `elite-build-crm-dev-00008-q9l` |

Google sign-in setup completed on 2026-04-29. OAuth configuration used:

1. OAuth Web client in `elite-build-infra-tech-dev`.
2. JavaScript origins:
   - `https://elite-build-crm-dev-484810469771.asia-south1.run.app`
   - `https://elite-build-crm-dev-zrpcw3j22q-el.a.run.app`
   - `http://localhost:3000`
   - `http://localhost:3001`
3. Redirect URI:
   - `https://elite-build-infra-tech-dev.firebaseapp.com/__/auth/handler`
4. Firebase Authentication Google provider enabled with that OAuth client.
5. CSP updated to allow Firebase Auth's Google script from `https://apis.google.com`.

## Backup Automation

| Gate | Result | Evidence |
| --- | --- | --- |
| GCS backup bucket exists | Passed | `gs://elite-build-crm-firestore-backups` |
| Bucket region | Passed | `ASIA-SOUTH1` |
| Uniform bucket-level access | Passed | `uniform_bucket_level_access: true` |
| Public access prevention | Passed | `public_access_prevention: enforced` |
| Versioning | Passed | `versioning_enabled: true` |
| Retention | Passed | `retentionPeriod: 2592000` seconds / 30 days |
| Scheduled export job | Passed | `crm-firestore-daily-export` in `asia-south1` |
| Schedule | Passed | `0 2 * * *`, `Asia/Kolkata` |
| Scheduler service account | Passed | `firestore-backup-exporter@elite-build-crm.iam.gserviceaccount.com` |
| Scheduler smoke run | Passed | Created `gs://elite-build-crm-firestore-backups/scheduled/scheduled.overall_export_metadata` |

Bucket IAM access is scoped to the source project platform inheritance plus export/import service identities:

- `projectOwner:elite-build-crm`
- `projectEditor:elite-build-crm`
- `projectViewer:elite-build-crm`
- `firestore-backup-exporter@elite-build-crm.iam.gserviceaccount.com`
- `service-473160465987@gcp-sa-firestore.iam.gserviceaccount.com`
- `service-484810469771@gcp-sa-firestore.iam.gserviceaccount.com`

## Restore Rehearsal

| Step | Result | Evidence |
| --- | --- | --- |
| Source export created | Passed | `gs://elite-build-crm-firestore-backups/rehearsal/20260428T091029Z` |
| Staging billing enabled | Passed | `elite-build-infra-tech-dev`, billing account `0158CC-2C738D-8A86F2` |
| Staging Firestore database exists | Passed | `(default)`, `asia-south1`, `FIRESTORE_NATIVE` |
| Staging bucket read permission | Passed | Staging Firestore service agent added as bucket reader/object viewer |
| Import into staging | Passed | Imported source export into `elite-build-infra-tech-dev` |
| Current Firestore rules/indexes deployed to staging | Passed | `firebase deploy --only firestore:rules,firestore:indexes --project elite-build-infra-tech-dev` |
| Restored staging export verifier | Passed | `backup verified`, 16 collections, 80 documents |

Restored staging counts:

| Collection | Count |
| --- | ---: |
| `leads` | 23 |
| `projects` | 7 |
| `inventory` | 11 |
| `project_schemas` | 7 |
| `crm_config` | 8 |
| `users` | 2 |
| `marketing_teams` | 1 |
| `whatsapp_messages` | 0 |
| `whatsapp_send_locks` | 0 |
| `whatsapp_send_failures` | 0 |
| `processed_events` | 0 |
| `audit_logs` | 0 |
| `reverse_match_projects` | 7 |
| `reverse_match_units` | 10 |
| `no_match_intelligence` | 3 |
| `demand_gap_reports` | 1 |

The audit and WhatsApp operational collections currently restore/query cleanly with 0 documents. That is acceptable for this rehearsal because the source dataset currently has no documents in those collections.

## Role-View And Privacy Verification

Restored production data contains two active CRM user documents:

| Email | Role |
| --- | --- |
| `devensuji@gmail.com` | `superadmin` |
| `elitebuildinfratech@gmail.com` | `channel_partner` |

Restored Channel Partner privacy data check:

| Check | Result |
| --- | --- |
| Channel Partner UID | `TpzbsdPy0wf9G5uROruXGnCTasH2` |
| Own leads visible by ownership model | 1 lead |
| Assigned projects visible by assignment model | `Blossom Palms` |
| Unassigned project access expected | Denied by deployed Firestore rules and UI query constraints |
| Internal tasks/WhatsApp/admin access expected | Denied by route/capability matrix |

Automated all-role verification:

| Verification | Result |
| --- | --- |
| UI capability matrix for Super Admin, Admin, Sales Exec, Channel Partner, Digital Marketing, Viewer | Passed, 65 tests |
| Firestore high-risk role/privacy rules for Leads, Projects, Inventory, reverse/no-match intelligence, users, and CRM config | Passed, 254 tests |

Manual browser screenshot UAT was not performed for all six roles because the restored production dataset currently contains only Super Admin and Channel Partner user records. The six-role access model was verified through the automated permission matrix and Firestore rules suite instead. If screenshot-level UAT is required, create staging-only Auth users for all six roles and run `docs/StagingUATChecklist.md`.

## Deployment Env Follow-Up

On 2026-04-29, the Cloud Run dev service was redeployed after confirming the browser-side Google Places autocomplete key was missing from the deployed environment. Revision `elite-build-crm-dev-00009-bdc` now includes `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in both build-time and runtime env, which is required for manual lead location suggestions.

The remaining Google Places failure was then traced to API key browser referrer restrictions. The allowed referrers were updated to include the active Cloud Run CRM URL, the alternate Cloud Run URL, local development ports, future `crm.elitebuild.in`, and regex-style path patterns required by the API key service. A deployed-origin browser check confirmed Google Places returns live suggestions for `Vijaya` and `Gokulam` without API errors.

On 2026-04-29, Channel Partner lead assignee display was corrected. Active Channel Partners are now included in assignee option rendering, Channel Partner manual lead creation self-assigns to the partner, and Firestore rules allow only safe self-assignment repair for older own leads. Cloud Run revision `elite-build-crm-dev-00010-45c` is serving 100% of traffic.

Channel Partner scoped property matching was then enabled in Cloud Run revision `elite-build-crm-dev-00011-tbz`. Channel Partner sessions now subscribe only to available inventory under assigned projects and run the existing auto-matcher against that scoped dataset. Firestore rules tests confirm Channel Partners can query available inventory within assigned projects but cannot query global available inventory.

Gemini AI Polish configuration was restored on 2026-04-29. The API route now keeps the Gemini key out of Firestore and reads only the server-side `GEMINI_API_KEY` env var. Secret Manager was enabled in `elite-build-infra-tech-dev`, the `gemini-api-key` secret was created, and Cloud Run revision `elite-build-crm-dev-00012-2r7` now maps `GEMINI_API_KEY` to `gemini-api-key:latest` for the runtime service account. The legacy `api_key` field was removed from Firestore `crm_config/ai`; that document now stores only non-secret settings such as `enabled` and `model`. Configuration verification passed: Cloud Run has the secret reference, the revision serves 100% of traffic, `/login` returns `200`, and Firestore no longer stores the Gemini key. Final browser smoke test should be performed by clicking AI Polish while signed in as Super Admin, Admin, or Sales Exec.

Sales Executive dashboard scope was tightened on 2026-04-29. Cloud Run revision `elite-build-crm-dev-00013-9cr` serves a Sales Exec dashboard scoped to that user's assigned leads only, with no Marketing Team tab, All Team selector, ROI card, team leaderboard, or inventory/team intelligence panel. Firestore rules were also updated so `marketing_teams` reads are Admin/Super Admin only; this prevents Sales Execs from reading marketing spend/source configuration even if they bypass the UI. Targeted verification passed: 106 unit tests, 138 Firestore rules tests, Firestore rules deploy to `elite-build-infra-tech-dev`, `/login` live check `200`, and Cloud Run secret/env binding verification.

Security Audit Pass 2 continued on 2026-04-29. Cloud Run revision `elite-build-crm-dev-00014-xsv` hardens the remaining high-risk API surfaces reviewed in this pass: Google Maps URL resolution now rejects spoofed Google-like hosts before server-side fetch; WhatsApp lead creation is limited to inbound unlinked messages; WhatsApp linking blocks relinking to a different lead and archived-lead links; WhatsApp outbound sends require either a matching linked lead or an existing conversation and block archived-lead sends. Lead-detail WhatsApp sends now include `leadId` so the server can validate the recipient phone against the lead. Targeted verification passed: 124 unit tests, 162 Firestore rules tests, `npm run build`, `npm run lint` with existing warnings only, `/login` live check `200`, unauthenticated API check `401`, and Cloud Run secret/env binding verification.

## Result

Backup automation, restore rehearsal, restored-data verification, and automated role/privacy verification are complete for this pass.

Remaining before final production deployment:

1. Keep deployment tooling pinned to `devensuji@gmail.com` and `elite-build-infra-tech-dev` unless the target is explicitly changed.
2. Log in with the five UAT role accounts so pending profiles migrate to real Firebase UIDs.
3. Assign the Channel Partner UAT UID to one test project and create/assign test leads for privacy checks.
4. Run screenshot-level staging UAT with six staging Auth users if business sign-off requires screenshots.
5. Start Security Audit Pass 2 / code freeze.
