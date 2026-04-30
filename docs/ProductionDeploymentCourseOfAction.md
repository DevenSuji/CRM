# Production Deployment Course Of Action

_Date:_ 2026-04-28
_Scope:_ Elite Build CRM production readiness, deployment, and post-deployment controls.

## Current Deployment Target

As of 2026-04-28, all deployment work should target:

- Google account: `devensuji@gmail.com` (`DevenSuji@gmail.com`, case-insensitive).
- GCP project name: `Elite Build CRM`.
- GCP project ID: `elite-build-infra-tech-dev`.
- GCP project number: `484810469771`.

Do not deploy to `elite-build-crm` unless the deployment target is explicitly changed again.

Local deployment safeguards now in place:

- `gcloud` active account/project: `devensuji@gmail.com` / `elite-build-infra-tech-dev`.
- Application Default Credentials quota project: `elite-build-infra-tech-dev`.
- Firebase CLI default project: `elite-build-infra-tech-dev`.
- Local CRM Firebase web config points to `elite-build-infra-tech-dev`.
- Dev Cloud Run service: `elite-build-crm-dev` in `asia-south1`.
- Dev URL: `https://elite-build-crm-dev-484810469771.asia-south1.run.app`.
- Mandatory Cloud Run deploy path: `npm run deploy:dev`.
- The deploy script sanitizes `NEXT_PUBLIC_*` values from `.env.local`, deploys a tagged no-traffic candidate revision, verifies revision env values and Secret Manager bindings, smoke-checks `/login` and `/api/branding`, then moves traffic only after all checks pass.
- Firebase Auth Google provider: enabled.
- OAuth popup smoke test: passed; browser reaches Google Accounts sign-in.
- Real Super Admin login: passed with `devensuji@gmail.com`.
- Duplicate restored Super Admin profile: cleaned up and audited.
- Current handoff before UAT: create/confirm the remaining role test users, then run role-view UAT.

## Current Readiness

The CRM is close to a serious staging/pilot deployment, but it should not be treated as production-complete until the remaining hardening, audit, backup, and UAT gates are closed.

Current estimate:

- Internal staging / pilot: 3-5 working days.
- Production candidate: 1.5-2.5 weeks.
- Production with two security audits completed: 3-4 weeks, assuming no major audit findings.

## Guiding Rule

Do not trade production safety for speed. Move quickly, but keep the deployment path boring: tested changes, clear rollback, least-privilege access, audit logs, backup rehearsal, and no hidden data exposure.

## Workstream 1 - Finish Security Audit Pass 1

1. Finish remaining project and inventory write-boundary review.
2. Confirm every high-risk lead mutation is server-authoritative or tightly rules-guarded.
3. Confirm Channel Partner boundaries across Dashboard, Leads, Projects, Tasks, WhatsApp, inventory, and internal intelligence collections.
4. Add production security headers.
5. Re-run unit, rules, lint, and build after each hardening slice.

Exit criteria:

- No browser role can directly mutate high-risk business fields.
- Channel Partners see only their own/assigned data.
- Admin SDK routes validate active CRM user, role, payload shape, and rate limits.
- Firestore rules tests cover the critical deny paths.

## Workstream 2 - Production Environment Controls

1. Confirm all runtime secrets are server-side only:
   - `GEMINI_API_KEY`
   - `WHATSAPP_ACCESS_TOKEN`
   - Google Maps key
   - service-account credentials
   - `ROOT_SUPERADMIN_EMAIL` set to the production owner Google account
2. Rotate any key that was ever stored in Firestore or committed locally.
3. Remove legacy secret fields from production Firestore documents.
4. Confirm Firebase project, deployment environment variables, and Admin SDK credentials are separated from local dev.
5. Add Cloud Armor or equivalent edge-level rate limiting for public/API surfaces where practical.

Exit criteria:

- No production secret is readable by browser code or Firestore clients.
- Production and local credentials are clearly separated.
- Runtime route failures do not reveal secrets or provider payloads.

## Workstream 3 - Backup, Recovery, And Data Retention

1. Create locked production Firestore backup bucket.
2. Schedule daily Firestore exports.
3. Perform one restore rehearsal into staging.
4. Verify lead, inventory, project, users, config, WhatsApp, audit, and intelligence collections after restore.
5. Keep soft-archived leads for audit/recovery/future analysis.

Exit criteria:

- Backup exists outside the app.
- Restore has been rehearsed.
- Recovery steps are documented with owner/sign-off.

## Workstream 4 - Staging UAT

1. Create or refresh staging with representative data.
2. Smoke test:
   - login and role routing
   - Dashboard
   - Leads
   - lead add/import/edit
   - booking/unbooking/closure
   - merge/archive
   - project assignment for Channel Partners
   - Projects page
   - WhatsApp send/link/create flows
   - Tasks & Briefing
3. Test role views:
   - Super Admin
   - Admin
   - Sales Exec
   - Channel Partner
   - Digital Marketing
   - Viewer
4. Record all defects and fix blockers only before production candidate.

Exit criteria:

- No P0/P1 bug remains.
- C-suite dashboard stays uncluttered.
- Channel Partner privacy is verified with screenshots/manual checks.

## Workstream 5 - Security Audit Pass 2

Run after code freeze.

1. Re-check Firestore rules.
2. Re-check API auth and payload validation.
3. Re-check secrets and environment variables.
4. Re-check storage rules.
5. Re-check CSP/security headers.
6. Re-check backup and recovery.
7. Re-check audit logs for critical actions.

Exit criteria:

- All high/critical findings are fixed.
- Medium findings are fixed or explicitly accepted with a mitigation note.
- Production deployment checklist is signed off.

## Workstream 6 - Deployment And Rollback

1. Freeze code.
2. Tag the release candidate.
3. Run:
   - `npm test`
   - `npm run test:rules`
   - `npm run build`
   - `npm run lint`
4. Run `npm run deploy:dev:dry-run` to verify deployment target and sanitized public env values.
5. Deploy through the guarded script only:
   - dev: `npm run deploy:dev`
   - production: create the equivalent production target first, then use the same no-traffic candidate flow.
6. Confirm the script reports:
   - candidate revision env verified
   - `GEMINI_API_KEY` Secret Manager binding verified
   - candidate `/login` passed
   - candidate `/api/branding` passed
   - final service `/login` and `/api/branding` passed after promotion
7. Take a fresh backup/export before production deploy.
8. Watch logs and critical user flows.
9. Keep rollback instructions ready:
   - revert to previous hosting build
   - restore Firestore selectively if data corruption occurs
   - pause public ingestion/webhooks if needed

Exit criteria:

- Production deploy is reversible.
- Logs are watched during the launch window.
- First production business workflow is manually verified.
- No Cloud Run revision receives traffic before env/secret/smoke checks pass.

## Immediate Next Actions

1. Finish the remaining Security Audit Pass 1 review items.
2. Add and verify the separate Google account that will be used for final production deployment.
3. Run screenshot-level staging UAT using six staging Auth users if business sign-off requires screenshots.
4. Start Security Audit Pass 2 after code freeze.
5. Freeze the first production candidate only after the security, backup, and UAT gates are clean.

## Progress Log

- 2026-04-28: Added production security headers and disabled the public Next.js powered-by header.
- 2026-04-28: Hardened inventory write boundaries so browser clients can maintain available-unit details, while booking/sold lifecycle state remains controlled by server-side lead routes.
- 2026-04-28: Hardened project write boundaries so browser writes must match the known project data shape, valid project statuses/types, and typed Channel Partner access lists.
- 2026-04-28: Added backup verification tooling, expanded export coverage for audit/WhatsApp operational collections, and created the staging UAT plus role-view verification checklist.
- 2026-04-28: Completed production backup automation, triggered scheduled export, restored a production export into staging, deployed current Firestore rules/indexes to staging, and recorded role/privacy verification evidence in `docs/ProductionOpsVerification-2026-04-28.md`.
