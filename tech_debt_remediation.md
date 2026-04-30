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
