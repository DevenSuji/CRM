# Staging UAT And Role-View Verification Checklist

_Date:_ 2026-04-28
_Scope:_ Elite Build CRM staging validation before the first production candidate.

## Current Deployment Target

- Google account: `devensuji@gmail.com` (`DevenSuji@gmail.com`, case-insensitive).
- GCP project name: `Elite Build CRM`.
- GCP project ID: `elite-build-infra-tech-dev`.
- GCP project number: `484810469771`.

## Entry Criteria

- Latest code is deployed to staging.
- Staging Firebase project is separate from production.
- Firebase Auth Google provider is enabled for the current staging/dev URL.
- Staging has representative leads, projects, inventory, users, WhatsApp messages, audit logs, and CRM config.
- A fresh backup/export exists and passes `npm run backup:verify`.
- Known P0/P1 security audit items are fixed or explicitly accepted with owner sign-off.

## Test Accounts

| Role | Required Account | Expected Landing |
| --- | --- | --- |
| Super Admin | `superadmin` staging user | Leads |
| Admin | `uat.admin@elitebuild.in` pending staging user | Leads |
| Sales Executive | `uat.sales@elitebuild.in` pending staging user | Leads |
| Channel Partner | `uat.channelpartner@elitebuild.in` pending staging user with assigned leads/projects | Leads |
| Digital Marketing | `uat.marketing@elitebuild.in` pending staging user | Projects |
| Viewer | `uat.viewer@elitebuild.in` pending staging user | Leads |

Pending users were seeded in `elite-build-infra-tech-dev` on 2026-04-29. They will migrate from `users/pending_*` to real Firebase UID-backed CRM user documents when each matching Google account logs in.

## Seed Data Requirements

- At least 10 active leads across New, First Call, Nurturing, Property Matched, Site Visit, Booked, Closed, and Rejected.
- At least 2 archived leads.
- At least 2 Channel Partner-owned leads for the Channel Partner test account.
- At least 3 projects, with only 1 assigned to the Channel Partner test account.
- Inventory with Available, Booked, and Sold units.
- At least 1 booked lead linked to a booked inventory unit.
- At least 1 duplicate lead pair for merge testing.
- At least 1 WhatsApp inbound message and 1 outbound message.
- At least 1 audit log entry from booking, archive, or merge.

## Core Smoke Tests

| Area | Check | Result | Evidence |
| --- | --- | --- | --- |
| Login | each role can sign in and lands on the expected route | Pending | Screenshot |
| Dashboard | C-suite view shows stats and graphs only; no operational task clutter | Pending | Screenshot |
| Leads | add lead, edit lead, filter, open detail, log note/call | Pending | Screenshot |
| Booking | Admin/Super Admin can book and release through server route | Pending | Lead + unit ids |
| Closure/Rejection | structured reason and note are required | Pending | Lead id |
| Merge/Archive | duplicate merge and archive are server-routed and audited | Pending | Audit log id |
| Projects | create/edit project, assign Channel Partner, manage unit details | Pending | Project id |
| Inventory | browser cannot manually change Available to Booked/Sold | Pending | Denied write / UI screenshot |
| Tasks & Briefing | visible only to internal task roles and deep links open lead/project | Pending | Screenshot |
| WhatsApp | inbox, link/create lead, and send flow work with server token | Pending | Message id |
| Admin Console | Admin/Super Admin role boundaries work as expected | Pending | Screenshot |
| Backup | export and verifier pass after staging data load | Pending | Backup path |

## Role-View Verification Matrix

| Surface | Super Admin | Admin | Sales Exec | Channel Partner | Digital Marketing | Viewer |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard nav | Yes | Yes | Yes | Yes, own stats only | No | Yes |
| Leads nav | All leads | All leads | All leads | Own leads only | No | Read-only all leads |
| Tasks & Briefing nav | Yes | Yes | Yes | No | No | No |
| WhatsApp nav | Yes | Yes | Yes | No | No | No |
| Projects nav | All projects | All projects | All projects | Assigned projects only | Campaign tab only | All projects read-only |
| Admin Console nav | Yes | Yes, no Super Admin promotion | No | No | No | No |
| Best Buyers / reverse match | Yes | Yes | Yes | No | No | Yes |
| Inventory opportunity queues | Yes | Yes | Yes | No | No | Yes |
| User/team names | Yes | Yes | Sales-visible only | No internal employee list | No user/team list | Read-only where visible |
| Channel Partner project access control | Yes | Yes | No | No | No | No |

## Channel Partner Privacy Checks

- Channel Partner sees Dashboard, Leads, and Projects navigation only.
- Dashboard contains only their own lead/project stats.
- Leads page contains only leads with `owner_uid` equal to their UID.
- Projects page contains only projects where `channel_partner_uids` contains their UID.
- Channel Partner cannot see unassigned project names, inventory opportunities, best buyers, employee names, WhatsApp, Tasks & Briefing, or Admin Console.
- Direct URL attempts to `/tasks`, `/whatsapp`, `/admin`, unassigned project docs, marketing teams, demand-gap reports, and reverse-match snapshots fail or redirect.

## Exit Criteria

- No P0/P1 defect remains.
- No role sees data outside its intended boundary.
- Backup/export verifier passes on the staging dataset.
- Production rollback path is documented and understood by the launch owner.
- Security Audit Pass 2 can start from a stable code freeze.

## Sign-Off

| Area | Owner | Date | Result | Notes |
| --- | --- | --- | --- | --- |
| Product UAT | TBD | TBD | Pending | Manual business walkthrough still required for final sign-off. |
| Sales workflow | TBD | TBD | Pending | Manual browser walkthrough still required for final sign-off. |
| Channel Partner privacy | Codex / Deven Suji account | 2026-04-28 | Automated Passed | Restored-data CP ownership/assignment check plus rules/capability matrix passed. |
| Security | Codex / Deven Suji account | 2026-04-28 | Automated Passed | Firestore rules and permission matrix passed. |
| Backup/restore | Codex / Deven Suji account | 2026-04-28 | Passed | See `docs/ProductionOpsVerification-2026-04-28.md`. |
| Production launch | TBD | TBD | Pending | Current deployment target is `devensuji@gmail.com` / `elite-build-infra-tech-dev` until explicitly changed. |
