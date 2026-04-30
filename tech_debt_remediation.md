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
  - Pending commit/push of ledger-only change.
- Commit:
  - Pending.
- Push:
  - Pending.

## Findings Register

No remediation findings have been accepted yet.

