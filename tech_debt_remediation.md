# Tech Debt Remediation Log

This file is the mandatory ledger for the CRM tech-debt validation and remediation workstream.

The CRM is close to production-pilot readiness, so this workstream must be slower and more deliberate than feature work. No file deletion, code removal, dependency removal, or behavior-changing edit is allowed unless the evidence is recorded here first.

## Operating Rules

1. Read this file before every tech-debt remediation action.
2. Do not delete or edit code unless the exact dependency/use check is recorded below.
3. Prefer audit-only commits before remediation commits.
4. Keep each remediation change small enough to review and revert independently.
5. Stage files explicitly by path. Never use broad staging commands such as `git add .`.
6. After each small validated change:
   - record the action here,
   - run the smallest meaningful validation,
   - commit only the intended files,
   - push the branch.
7. If confidence is below 100%, mark the item as `Needs Investigation` and do not change it.
8. Runtime-generated files, build artifacts, cache files, and historical transcripts must still be checked for references before deletion.

## Current Git Baseline

- Date started: 2026-04-30
- Branch: `codex/ui-modernization-20260424`
- Remote tracking branch: `origin/codex/ui-modernization-20260424`
- Last pushed commit at start: `8095f6f Ship CRM matching intelligence and dashboard upgrades`
- Important state: the worktree already contains many uncommitted CRM development changes from prior feature/security work. Tech-debt commits must stage only their intended files.

## Current Dev Deployment Baseline

- GCP project: `elite-build-infra-tech-dev`
- Cloud Run service: `elite-build-crm-dev`
- Live revision before this workstream: `elite-build-crm-dev-00029-gun`
- Firestore/Storage rules: deployed after Security Audit Pass 2 slice
- WhatsApp configuration: intentionally parked; Meta secrets are not configured in dev

## Candidate States

- `Needs Investigation`: identified, but not safe to change.
- `Safe To Remove`: all reference checks and validation plan recorded.
- `Removed`: deleted and validation passed.
- `Safe To Refactor`: all call sites understood and validation plan recorded.
- `Refactored`: changed and validation passed.
- `Deferred`: valid debt, but not safe or not worth touching before production.

## Action Log

### 2026-04-30 19:25 IST - Ledger Created

- Action: Created `tech_debt_remediation.md`.
- Reason: Establish a mandatory audit trail before any tech-debt validation/remediation.
- Files changed:
  - `tech_debt_remediation.md`
- Risk: Documentation-only. No runtime impact.
- Validation:
  - `git diff --check -- tech_debt_remediation.md` passed.
- Commit:
  - `c01cb4f docs: add tech debt remediation ledger`
- Push:
  - Pushed to `origin/codex/ui-modernization-20260424`.

### 2026-04-30 19:31 IST - GEN-001 Python Bytecode Cleanup

- Action: Removed generated Python bytecode from source control and added ignore rules.
- Reason: `.pyc` and `__pycache__/` files are generated artifacts, not deployable source. Keeping them in git creates noisy diffs and can accidentally preserve local interpreter output.
- Evidence:
  - Tracked generated file found: `CRM/functions/lead_ingestion_webhook/__pycache__/main.cpython-313.pyc`.
  - Local generated cache file found: `CRM/functions/lead_ingestion_webhook/__pycache__/test_source_normalization.cpython-313.pyc`.
  - Source files remain:
    - `CRM/functions/lead_ingestion_webhook/main.py`
    - `CRM/functions/lead_ingestion_webhook/test_source_normalization.py`
- Files changed:
  - `.gitignore`
  - `CRM/functions/lead_ingestion_webhook/__pycache__/main.cpython-313.pyc`
  - `tech_debt_remediation.md`
- Files removed from local working tree but not committed because they were untracked/generated:
  - `CRM/functions/lead_ingestion_webhook/__pycache__/test_source_normalization.cpython-313.pyc`
- Validation:
  - `python3 -m compileall -q CRM/functions/lead_ingestion_webhook/main.py CRM/functions/lead_ingestion_webhook/test_source_normalization.py` passed.
  - `cd CRM/functions/lead_ingestion_webhook && python3 test_source_normalization.py` passed: 2 tests.
  - Regenerated `__pycache__/` files from validation were removed again.
  - Final `find CRM/functions/lead_ingestion_webhook \( -path '*/__pycache__' -o -name '*.pyc' -o -name '*.pyo' \) -print` returned no files.
  - `git diff --check -- .gitignore tech_debt_remediation.md CRM/functions/lead_ingestion_webhook/__pycache__/main.cpython-313.pyc` passed.
- Commit:
  - `5f629a6 chore: remove generated Python bytecode cache`
- Push:
  - Pushed to `origin/codex/ui-modernization-20260424`.

### 2026-04-30 19:40 IST - GEN-002 Local Generated Artifact Cleanup

- Action: Removed local untracked generated files from the working tree.
- Reason: `.DS_Store` files and Firebase emulator debug logs are machine-generated local artifacts. They should not be committed and add noise to future audits.
- Evidence:
  - `find . ... -name '.DS_Store' ... -name 'firestore-debug.log'` found:
    - `./.DS_Store`
    - `./CRM/.DS_Store`
    - `./CRM/elite-build-dashboard/.DS_Store`
    - `./CRM/elite-build-dashboard/public/.DS_Store`
    - `./docs/.DS_Store`
    - `./CRM/elite-build-dashboard/firestore-debug.log`
  - `git ls-files | rg ...` found no tracked `.DS_Store` or debug log files.
  - Root `.gitignore` already ignores `.DS_Store`; app `.gitignore` ignores Firebase emulator logs.
- Files changed in git:
  - `tech_debt_remediation.md`
- Files removed locally only:
  - the generated artifact files listed above.
- Risk: very low. No source/runtime code edited.
- Validation:
  - Final `find . ... -name '.DS_Store' ... -name 'firestore-debug.log'` returned no files.
  - `git diff --check -- tech_debt_remediation.md` passed.
- Commit:
  - `f766fc1 docs: record local artifact cleanup`
- Push:
  - Pushed to `origin/codex/ui-modernization-20260424`.

### 2026-04-30 19:43 IST - CODE-002 Lead Detail Popover Unused Imports

- Action: Remove unused `lucide-react` imports from `LeadDetailPopover`.
- Reason: Lint reports dead imports. Removing unused imports is behavior-neutral because the symbols are never referenced in JSX or code.
- Evidence:
  - `git status --short -- CRM/elite-build-dashboard/components/LeadDetailPopover.tsx` returned no pre-existing dirty state.
  - `npx eslint components/LeadDetailPopover.tsx` reported:
    - `Briefcase` unused
    - `Calendar` unused
    - `MessageSquare` unused
  - `rg -n "Briefcase|Calendar|MessageSquare|LeadDetailPopover" ...` showed those three symbols only in the import line.
  - `LeadDetailPopover` itself is still used by `components/KanbanCard.tsx`.
- Files changed:
  - `CRM/elite-build-dashboard/components/LeadDetailPopover.tsx`
  - `tech_debt_remediation.md`
- Risk: very low. Import-only cleanup in a previously clean file.
- Validation:
  - `npx eslint components/LeadDetailPopover.tsx` passed with no warnings.
  - `npx tsc --noEmit` passed.
  - `git diff --check -- tech_debt_remediation.md CRM/elite-build-dashboard/components/LeadDetailPopover.tsx` passed.
- Commit:
  - `5a2a807 chore: remove unused lead popover imports`
- Push:
  - Pushed to `origin/codex/ui-modernization-20260424`.

### 2026-04-30 19:48 IST - CODE-003 Callback Alarm Overlay Dead Symbols

- Action: Remove unused `User` icon import and unused `audioRef` variable from `CallbackAlarmOverlay`.
- Reason: The component now uses Web Audio via `alarmCtxRef` and `alarmIntervalRef`; the older `audioRef` variable is not connected to any JSX or playback logic.
- Evidence:
  - `git status --short -- CRM/elite-build-dashboard/components/CallbackAlarmOverlay.tsx` returned no pre-existing dirty state.
  - `npx eslint components/CallbackAlarmOverlay.tsx` reported:
    - `User` unused
    - `audioRef` assigned but never used
  - `rg -n "\\bUser\\b|audioRef|useRef|CallbackAlarmOverlay" ...` showed:
    - `User` appears only in the `lucide-react` import in this file.
    - `audioRef` appears only in its declaration.
    - `CallbackAlarmOverlay` remains used by `app/page.tsx`.
- Files changed:
  - `CRM/elite-build-dashboard/components/CallbackAlarmOverlay.tsx`
  - `tech_debt_remediation.md`
- Risk: very low. No UI markup, callback logic, Firestore writes, or alarm playback logic changed.
- Validation:
  - `npx eslint components/CallbackAlarmOverlay.tsx` passed with no warnings.
  - `npx tsc --noEmit` passed.
  - `git diff --check -- tech_debt_remediation.md CRM/elite-build-dashboard/components/CallbackAlarmOverlay.tsx` passed.
- Commit:
  - `39fd94f chore: remove unused callback alarm symbols`
- Push:
  - Pushed to `origin/codex/ui-modernization-20260424`.

### 2026-04-30 19:52 IST - CODE-004 Remove Unused ESLint Disable In `useFirestoreDoc`

- Action: Remove one unused `react-hooks/set-state-in-effect` disable comment from `useFirestoreDoc`.
- Reason: ESLint reports the second disable directive as unused. Keeping unused lint suppressions makes future warnings harder to trust.
- Evidence:
  - `git status --short -- CRM/elite-build-dashboard/lib/hooks/useFirestoreDoc.ts` returned no pre-existing dirty state.
  - `npx eslint lib/hooks/useFirestoreDoc.ts` reported one unused disable directive at line 27.
  - The hook is still actively used by dashboard, leads, tasks, and projects pages/components, so only the unused directive is safe to remove.
- Files changed:
  - `CRM/elite-build-dashboard/lib/hooks/useFirestoreDoc.ts`
  - `tech_debt_remediation.md`
- Risk: very low. Comment-only cleanup; no runtime code changed.
- Validation:
  - `npx eslint lib/hooks/useFirestoreDoc.ts` passed with no warnings.
  - `npx tsc --noEmit` passed.
  - `git diff --check -- tech_debt_remediation.md CRM/elite-build-dashboard/lib/hooks/useFirestoreDoc.ts` passed.
- Commit:
  - `ad20819 chore: remove unused firestore doc lint suppression`
- Push:
  - Pushed to `origin/codex/ui-modernization-20260424`.

### 2026-04-30 19:56 IST - Lint Snapshot After Safe Cleanups

- Action: Ran full lint after the safe generated-artifact/import/comment cleanups.
- Result:
  - `npm run lint` passed with warnings only.
  - Warning count is now 51.
  - Earlier Security Pass 2 validation had 57 warnings, so the tiny cleanups removed 6 lint warnings without behavior changes.
- Current decision:
  - Do not continue blindly through the remaining warnings.
  - Many remaining warnings are inside files that already have large uncommitted feature/security changes; staging those files would risk bundling unrelated work into tech-debt commits.
  - Image warnings require UI/runtime review because replacing `<img>` with Next `<Image>` can affect sizing, remote image policy, and branded asset behavior.
  - `any` type warnings require type-shape review, not mechanical edits.
- Files changed:
  - `tech_debt_remediation.md`
- Validation:
  - `npm run lint` passed with 51 warnings.
  - generated-artifact scan returned no `.DS_Store`, `__pycache__`, `.pyc`, `.pyo`, or Firebase debug log files.
- Commit:
  - `70ff070 docs: record lint debt snapshot`
- Push:
  - Pushed to `origin/codex/ui-modernization-20260424`.

### 2026-04-30 20:00 IST - Current Dev Baseline Checkpoint

- Action: Prepare a single reviewed baseline checkpoint for the current CRM dev state before deeper tech-debt remediation.
- Reason: The worktree contains the accumulated feature, security, UAT, backup/export, WhatsApp foundation, dashboard, RBAC, and documentation work that has been built and tested during the current development cycle. Deeper cleanup should start from a pushed baseline instead of leaving this broad known state uncommitted.
- Scope:
  - Next.js app pages, API routes, shared components, contexts, CRM utilities, Firestore/Storage rules, tests, scripts, and docs currently present in the working tree.
  - Firebase/PWA/deployment support files already created for the dev environment.
  - Python Cloud Function source updates and the source-normalization test.
- Explicit exclusions:
  - Generated `.next/` build output is ignored and not staged.
  - Generated `CRM/elite-build-dashboard/firestore-debug.log` from rules testing was removed locally before staging.
  - No production deployment, domain change, GCP resource change, or WhatsApp Meta configuration is being performed by this checkpoint.
- Validation completed before staging:
  - `npm run test` passed: 25 test files, 453 tests.
  - `npm run test:rules` passed: 10 test files, 340 tests.
  - `npx tsc --noEmit` passed.
  - `npm run build` passed.
  - `npm run lint` passed with 51 warnings and 0 errors. The warnings are tracked under `LINT-001`, `IMG-001`, and `TYPE-001`.
- Files changed:
  - Baseline source/test/rules/scripts/docs files listed by the final staged diff.
  - `tech_debt_remediation.md`
- Risk:
  - Medium due to the breadth of already-developed CRM changes, but the checkpoint is intentionally a baseline commit rather than a behavioral cleanup.
- Next validation before commit:
  - `git diff --cached --check`
  - Review staged status and staged stat output.
- Commit:
  - `09ade22 chore: checkpoint current CRM dev baseline`
- Push:
  - Pushed to `origin/codex/ui-modernization-20260424`.

### 2026-04-30 20:09 IST - Audit-Only Tech Debt Discovery Pass 1

- Action: Ran a reference and artifact discovery pass without editing runtime code.
- Reason: Establish the next safe remediation candidates after the current dev baseline.
- Evidence collected:
  - `git status --short` returned clean before the audit.
  - Generated artifact scan returned no `.DS_Store`, `firestore-debug.log`, `__pycache__`, `.pyc`, or `.pyo` files outside ignored dependency/build folders.
  - Empty directory scan found local-only empty folders:
    - `CRM/elite-build-dashboard/app/admin/projects`
    - `CRM/elite-build-dashboard/app/inventory`
    - `CRM/elite-build-dashboard/lib/constants`
    - `terraform`
    - ignored backup-git internals under `docs/elite-build-dashboard_inner_git_backup_2026-04-21/`
  - Next route scan found the committed page/API route entrypoints; `/coming-soon`, `/tasks`, `/whatsapp`, `/projects`, `/dashboard`, and `/admin` are all wired through permissions, sidebar, redirects, direct links, or API calls.
  - Dependency import scan confirmed active runtime usage for Firebase, Firebase Admin, DnD Kit, Lucide, Next, React, React DOM, Recharts, Tailwind PostCSS, Tailwind CSS, Firebase rules testing, and Vitest.
  - Dependency import scan found `playwright` and `@vitest/coverage-v8` in `package.json`/lockfile but not currently wired into scripts or config.
  - Import-graph scan found `components/ui/EmptyState.tsx` with no runtime or test imports.
  - Script scan found manual cleanup utilities under `CRM/functions/inventory_cleanup/` and `CRM/functions/lead_cleanup/` that are not Cloud Function deploy entrypoints in `firebase.json` and are documented as manual scripts.
- Files changed:
  - `tech_debt_remediation.md`
- Runtime impact:
  - None. Documentation-only audit checkpoint.
- Validation:
  - `git diff --check -- tech_debt_remediation.md` passed.
- Commit:
  - `79cb60d docs: record tech debt discovery pass`
- Push:
  - Pushed to `origin/codex/ui-modernization-20260424`.

### 2026-04-30 20:15 IST - CODE-005 Remove Unreferenced `EmptyState`

- Action: Removed `CRM/elite-build-dashboard/components/ui/EmptyState.tsx`.
- Reason: The component was confirmed as unreferenced by runtime code and tests during the audit-only discovery pass.
- Evidence:
  - `git status --short` returned clean before the change.
  - `rg -n "EmptyState|components/ui/EmptyState|@/components/ui/EmptyState" CRM/elite-build-dashboard --glob '!node_modules/**' --glob '!.next/**'` found only the component's own declaration before removal.
  - The same search returned no matches after removal.
- Files changed:
  - `CRM/elite-build-dashboard/components/ui/EmptyState.tsx`
  - `tech_debt_remediation.md`
- Runtime impact:
  - None expected. The removed file had no call sites and no side effects.
- Validation:
  - `npx tsc --noEmit` passed.
  - `npm run build` passed.
  - `git diff --check -- CRM/elite-build-dashboard/components/ui/EmptyState.tsx tech_debt_remediation.md` passed.
- Commit:
  - `781764c chore: remove unused EmptyState component`
- Push:
  - Pushed to `origin/codex/ui-modernization-20260424`.

### 2026-04-30 20:22 IST - SCRIPT-001 Harden Dangerous Cleanup Scripts

- Action: Added explicit safety guards to the manual cleanup scripts under `CRM/functions/`.
- Reason: These scripts can delete lead/inventory data and previously hardcoded an old project ID. They should be impossible to run destructively by accident.
- Evidence:
  - `git status --short` returned clean before the change.
  - `CRM/functions/inventory_cleanup/cleanup_inventory.py` previously initialized `firestore.Client(project="elitebuild-crm")` at import time and deleted every `inventory` document when run.
  - `CRM/functions/lead_cleanup/cleanup_lead.py` previously initialized `firestore.Client(project="elitebuild-crm")` at import time, deleted every `leads` document, and updated every `inventory` document when run.
  - `CRM/elite-build-dashboard/firebase.json` still has no Cloud Functions deploy configuration for these directories, so this is a manual-script safety change, not an app runtime deployment change.
- Changes made:
  - Removed the hardcoded Firestore project ID from both scripts.
  - Required `--project-id` on every run so the target project must be explicit.
  - Made both scripts dry-run by default.
  - Required `--execute` before any destructive write.
  - Required `ELITEBUILD_ALLOW_DANGEROUS_CLEANUP="I_UNDERSTAND_THIS_DELETES_DATA"` before any destructive write.
  - Required exact typed confirmation of the target project before any destructive write.
  - Deferred Firestore client creation until after argument parsing and destructive confirmation.
- Files changed:
  - `CRM/functions/inventory_cleanup/cleanup_inventory.py`
  - `CRM/functions/lead_cleanup/cleanup_lead.py`
  - `tech_debt_remediation.md`
- Runtime impact:
  - No CRM app runtime impact expected. These are manual utilities and were not executed.
- Validation:
  - In-memory Python syntax compile passed for both scripts.
  - `rg -n "elitebuild-crm|firestore\\.Client\\(project=\\\"" CRM/functions/inventory_cleanup/cleanup_inventory.py CRM/functions/lead_cleanup/cleanup_lead.py` found no hardcoded project target.
  - `find CRM/functions -path '*/__pycache__' -o -name '*.pyc' -o -name '*.pyo'` returned no generated Python cache files.
  - `git diff --check -- CRM/functions/inventory_cleanup/cleanup_inventory.py CRM/functions/lead_cleanup/cleanup_lead.py` passed.
  - These cleanup scripts were intentionally not executed.
- Commit:
  - `206cf0a chore: harden manual cleanup scripts`
- Push:
  - Pushed to `origin/codex/ui-modernization-20260424`.

### 2026-04-30 20:35 IST - DOC-003 Refresh Root README

- Action: Rewrote the root `README.md` to match the current CRM development baseline.
- Reason: The previous README still described old app routes, an older three-role RBAC model, older deployment commands, and stale project IDs.
- Evidence:
  - `README.md` previously described `app/inventory/` and `app/admin/projects/` as active app paths.
  - `README.md` previously described only `admin`, `sales_exec`, and `viewer` roles.
  - Current route scan from the discovery pass confirmed `/tasks`, `/whatsapp`, `/projects`, `/dashboard`, `/admin`, `/login`, and `/coming-soon` as current app routes.
  - `CRM/elite-build-dashboard/package.json` exposes the guarded operational scripts `backup:firestore`, `backup:verify`, `deploy:dev`, and `deploy:dev:dry-run`.
  - `CRM/elite-build-dashboard/scripts/deploy-cloud-run.mjs` targets dev project `elite-build-infra-tech-dev`, service `elite-build-crm-dev`, and region `asia-south1`.
- Changes made:
  - Updated current dev project, Cloud Run service, region, and dev app URL.
  - Replaced stale route/project structure with the current Next.js app route layout.
  - Added current RBAC summary for Super Admin, Admin, Sales Exec, Channel Partner, Digital Marketing, Viewer, HR, and Payroll/Finance.
  - Added dashboard clutter guardrail: dashboard is for C-suite stats and graphs, execution work belongs elsewhere.
  - Documented validation commands, guarded dev deployment, rules deployment, backup/export readiness, WhatsApp parked status, and guarded manual cleanup utilities.
- Files changed:
  - `README.md`
  - `tech_debt_remediation.md`
- Runtime impact:
  - None. Documentation-only change.
- Validation:
  - `git diff --check -- README.md` passed before this ledger entry.
  - `git diff --check -- README.md tech_debt_remediation.md` passed.
- Commit:
  - Pending.
- Push:
  - Pending.

## Findings Register

### GEN-001 - Python Bytecode Cache In Source Tree

- Status: `Safe To Remove`
- Type: generated artifact cleanup
- Evidence collected:
  - `git ls-files | rg '(__pycache__|\\.pyc$|\\.pyo$|\\.DS_Store$|node_modules|\\.next/|dist/|build/|coverage/)'` found one tracked generated file:
    - `CRM/functions/lead_ingestion_webhook/__pycache__/main.cpython-313.pyc`
  - `find . ... -name '__pycache__' -o -name '*.pyc'` found generated local cache files:
    - `CRM/functions/lead_ingestion_webhook/__pycache__/main.cpython-313.pyc`
    - `CRM/functions/lead_ingestion_webhook/__pycache__/test_source_normalization.cpython-313.pyc`
  - Python source files exist beside the cache files:
    - `CRM/functions/lead_ingestion_webhook/main.py`
    - `CRM/functions/lead_ingestion_webhook/test_source_normalization.py`
  - Python `.pyc` files are generated interpreter bytecode and are not required by source deployments.
  - Root `.gitignore` ignores `.DS_Store` and app build artifacts, but does not yet ignore `__pycache__/` or `*.pyc`.
- Planned remediation:
  - Remove tracked `.pyc` from git.
  - Remove local untracked `.pyc` cache file.
  - Add Python bytecode ignore rules to root `.gitignore`.
- Risk: very low. No source/runtime code is being edited.
- Validation plan:
  - Confirm no `.pyc` files remain under the repo working tree.
  - Run the Python unit test for `lead_ingestion_webhook` if local Python dependencies allow it.
  - Run `git diff --check` for touched files.

### GEN-002 - Local `.DS_Store` And Firebase Debug Logs

- Status: `Safe To Remove`
- Type: generated artifact cleanup
- Evidence collected:
  - `find . ... -name '.DS_Store' ... -name 'firestore-debug.log'` found local generated artifacts.
  - `git ls-files | rg ...` found no tracked matches.
  - `.gitignore` coverage already exists for `.DS_Store` and Firebase emulator logs.
- Planned remediation:
  - Remove only the local untracked generated artifacts.
  - Commit only this ledger update.
- Risk: very low. No source/runtime code edited.

### AUD-001 - Empty Local Directories

- Status: `Needs Investigation`
- Type: local filesystem cleanup
- Evidence collected:
  - `find . -path './.git' -prune -o -type d -empty -print | sort` found:
    - `CRM/elite-build-dashboard/app/admin/projects`
    - `CRM/elite-build-dashboard/app/inventory`
    - `CRM/elite-build-dashboard/lib/constants`
    - `terraform`
    - ignored backup-git internals under `docs/elite-build-dashboard_inner_git_backup_2026-04-21/`
  - Empty directories are not represented in git unless they contain tracked placeholder files, so these currently do not affect committed source.
- Current decision:
  - Do not remove yet during source-remediation commits because there is no git delta to review/push.
  - Revisit if we create Terraform under `terraform/` or decide to clean local-only folders.
- Risk:
  - Low for local cleanup, but no production benefit right now.

### DOC-001 - Historical Transcript / Long-Form Notes

- Status: `Needs Investigation`
- Type: documentation/archive cleanup
- Evidence collected:
  - Candidate files found by audit query:
    - `history/CRM.txt`
    - `docs/StepsSoFar.txt`
  - These look like historical transcripts or long-form process notes, but they may contain project decisions, setup history, or recovery breadcrumbs.
- Current decision:
  - Do not delete before confirming with project history needs.
  - If retained, consider moving them under a clearly named `docs/archive/` path instead of deleting.
- Risk:
  - Medium. Deleting project history can remove deployment/setup context even if it has no runtime impact.

### CODE-001 - Legacy Browser Auth Resolver

- Status: `Needs Investigation`
- Type: possible legacy code
- Evidence collected:
  - Runtime `AuthContext` uses `/api/auth/resolve-crm-user`.
  - `lib/auth/resolveCrmUser.ts` is still imported by `tests/rules/resolveCrmUser.test.ts`.
  - The file encodes legacy browser-side auth resolution behavior that now overlaps with the server route.
- Current decision:
  - Do not remove now. It still has test coverage attached, and deleting it safely requires either migrating those tests to the server route or explicitly retiring the legacy behavior.
- Risk:
  - Medium-high. Auth bootstrap and pending-user migration are sensitive paths.

### CODE-002 - Unused Imports In `LeadDetailPopover`

- Status: `Safe To Refactor`
- Type: import cleanup
- Evidence collected:
  - `components/LeadDetailPopover.tsx` had no pre-existing dirty state.
  - ESLint reports `Briefcase`, `Calendar`, and `MessageSquare` as unused.
  - Text search confirms those symbols are not referenced outside the import statement.
  - The component remains referenced by `components/KanbanCard.tsx`.
- Planned remediation:
  - Remove only the unused imports.
- Risk:
  - Very low. No JSX or behavior changes.

### CODE-003 - Dead Symbols In `CallbackAlarmOverlay`

- Status: `Safe To Refactor`
- Type: unused import/variable cleanup
- Evidence collected:
  - `components/CallbackAlarmOverlay.tsx` had no pre-existing dirty state.
  - ESLint reports `User` and `audioRef` as unused.
  - Text search confirms both are not referenced by runtime logic.
  - The component remains referenced by `app/page.tsx`.
- Planned remediation:
  - Remove `User` from the icon import.
  - Remove only the unused `audioRef` declaration.
- Risk:
  - Very low. The active alarm behavior uses `alarmCtxRef` and `alarmIntervalRef`, which are untouched.

### CODE-004 - Unused ESLint Disable In `useFirestoreDoc`

- Status: `Safe To Refactor`
- Type: lint-suppression cleanup
- Evidence collected:
  - `lib/hooks/useFirestoreDoc.ts` had no pre-existing dirty state.
  - ESLint reports one unused `react-hooks/set-state-in-effect` suppression.
  - The hook itself remains in active use across several runtime components.
- Planned remediation:
  - Remove only the unused suppression comment.
- Risk:
  - Very low. Comment-only change.

### LINT-001 - Remaining Lint Warning Categories

- Status: `Deferred`
- Type: lint debt triage
- Evidence collected:
  - Full lint currently reports 51 warnings and 0 errors.
  - Remaining categories:
    - unused imports in already-dirty large files: `app/admin/page.tsx`, `app/page.tsx`, `components/ui/MultiImageUpload.tsx`
    - `<img>` optimization warnings across branding/image-heavy UI
    - `no-explicit-any` warnings in dashboard/projects/upload/location types
    - one `set-state-in-effect` warning in `lib/context/ThemeContext.tsx`
- Current decision:
  - Defer broad lint cleanup until the large feature/security changes are committed or reviewed.
  - Do not alter image rendering or type models mechanically before production UAT.
- Risk:
  - Medium if done mechanically. These files are user-facing or already carry unrelated uncommitted changes.

### IMG-001 - Next `<img>` Warnings

- Status: `Needs Investigation`
- Type: UI/performance debt
- Evidence collected:
  - Lint reports multiple `@next/next/no-img-element` warnings.
  - Affected areas include login branding, project/gallery images, uploads, image lightbox, sidebar branding, and search result thumbnails.
- Current decision:
  - Do not convert now. These changes can affect visual layout, allowed remote domains, object-fit behavior, and branding asset rendering.
  - Handle as a separate UI/performance pass with screenshot checks.
- Risk:
  - Medium. Image rendering changes are visible and can regress layout.

### TYPE-001 - `any` Type Warnings

- Status: `Needs Investigation`
- Type: typing debt
- Evidence collected:
  - Lint reports `no-explicit-any` in dashboard metrics, project dynamic schemas, image upload, location autocomplete, property matching, and inventory/project field maps.
- Current decision:
  - Do not replace `any` mechanically. Several are modeling dynamic CRM/project schema fields.
  - Handle in focused type-model slices with tests.
- Risk:
  - Medium. Incorrect narrowing can break dynamic field flows.

### CODE-005 - Unreferenced `EmptyState` UI Component

- Status: `Removed`
- Type: unused component cleanup
- Evidence collected:
  - Import-graph scan of non-test app/component/lib TypeScript files listed `components/ui/EmptyState.tsx` as not imported by runtime code.
  - The same scan showed `testReferenced: false`.
  - `rg -n "EmptyState|components/ui/EmptyState|@/components/ui/EmptyState" CRM/elite-build-dashboard --glob '!node_modules/**' --glob '!.next/**'` found only the component's own declaration.
  - The file is a standalone presentational component and does not register routes, providers, side effects, Firestore listeners, or storage/API calls.
- Planned remediation:
  - Delete only `CRM/elite-build-dashboard/components/ui/EmptyState.tsx`.
- Remediation:
  - Removed in the CODE-005 action log entry above.
- Validation plan:
  - `npx tsc --noEmit`
  - `npm run build`
  - `git diff --check -- CRM/elite-build-dashboard/components/ui/EmptyState.tsx tech_debt_remediation.md`
- Risk:
  - Low. TypeScript/build validation should catch any missed import immediately.

### DEP-001 - Playwright Installed But Not Wired

- Status: `Needs Investigation`
- Type: dependency/tooling debt
- Evidence collected:
  - `package.json` lists `playwright` in `devDependencies`.
  - `rg -n "playwright" CRM/elite-build-dashboard --glob '!node_modules/**' --glob '!.next/**'` found only `package.json` and `package-lock.json`.
  - No `playwright.config.*` file exists under `CRM/elite-build-dashboard`.
- Current decision:
  - Do not remove now. We have been using browser/UAT-style checks manually, and Playwright may still be intended for production-readiness smoke tests.
  - Either add a real smoke-test script/config in a later QA pass or remove the dependency if we choose not to automate browser checks.
- Risk:
  - Medium. Removing it could slow the planned role-view/browser UAT automation.

### DEP-002 - Vitest Coverage Package Installed But Not Wired

- Status: `Needs Investigation`
- Type: dependency/tooling debt
- Evidence collected:
  - `package.json` lists `@vitest/coverage-v8` in `devDependencies`.
  - `rg -n "@vitest/coverage-v8|coverage-v8" CRM/elite-build-dashboard --glob '!node_modules/**' --glob '!.next/**'` found only `package.json` and `package-lock.json`.
  - Current scripts are `test`, `test:watch`, `test:rules`, and `test:all`; no coverage script is present.
- Current decision:
  - Do not remove now. It may be useful for the upcoming production-quality gate, but it is not currently active.
  - Decide whether to add a coverage script or remove the dependency in a separate tooling pass.
- Risk:
  - Low-medium. This is build-tooling only, but dependency churn before deployment should be deliberate.

### SCRIPT-001 - Dangerous Cleanup Scripts Under `functions/`

- Status: `Refactored`
- Type: script organization/safety debt
- Evidence collected:
  - `CRM/functions/inventory_cleanup/cleanup_inventory.py` deletes every document in the `inventory` collection.
  - `CRM/functions/lead_cleanup/cleanup_lead.py` deletes every document in the `leads` collection and updates inventory defaults.
  - Both scripts hardcode `firestore.Client(project="elitebuild-crm")`, which does not match the current dev GCP project ID `elite-build-infra-tech-dev`.
  - `CRM/elite-build-dashboard/firebase.json` has no Cloud Functions deploy configuration, so these are not deployed through the app's Firebase config.
  - `docs/AuditReport.md` already flags them as one-off scripts that should move out of `functions/`.
  - `docs/CRM_Mind_Map_A0.html` references them as manual cleanup scripts.
- Current decision:
  - Do not delete or move yet. They are dangerous but documented, and deletion could remove historical recovery/cleanup context.
  - Safety guardrails have been added so destructive execution requires explicit project targeting, `--execute`, an environment confirmation phrase, and exact typed confirmation.
  - Candidate follow-up: quarantine under a clearly named `CRM/scripts/dangerous_manual_cleanup/` folder or remove after user approval.
- Risk:
  - Lower than before because accidental destructive execution now fails closed, but still high if intentionally executed against the wrong project.

### DOC-003 - Root README Is Stale Against Current App Shape

- Status: `Refactored`
- Type: documentation debt
- Evidence collected:
  - `README.md` still describes `app/inventory/` and `app/admin/projects/`, but current inventory/project workflows live primarily under `/projects`, and those directories are empty locally.
  - `README.md` describes older role/security summaries and does not reflect the newer roles and role-view boundaries added during Security Audit Pass 2.
  - Current route scan shows `/tasks` and `/whatsapp` exist, but the README structure section does not describe them.
- Current decision:
  - README has been refreshed to reflect the current dev baseline and operational guardrails.
  - Revisit after final production deployment because production project IDs, domain mapping, and root account will intentionally differ from dev.
- Risk:
  - Low runtime risk, medium operational risk because stale setup docs can mislead deployment/UAT.

### LOCAL-001 - Ignored Inner Git Backup Folder

- Status: `Needs Investigation`
- Type: local-only archive cleanup
- Evidence collected:
  - `docs/elite-build-dashboard_inner_git_backup_2026-04-21/` is ignored by `.gitignore`.
  - `git ls-files docs/elite-build-dashboard_inner_git_backup_2026-04-21` returned no tracked files.
  - `du -sh docs/elite-build-dashboard_inner_git_backup_2026-04-21` reports about `256K`.
  - The directory appears to be a backup of a previous inner `.git` folder.
- Current decision:
  - Do not remove automatically. It is local-only and not part of production source.
  - It can be deleted later if we no longer need submodule/inner-git recovery breadcrumbs.
- Risk:
  - Very low production risk, but possible historical recovery value.
