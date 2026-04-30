# SaaS Migration Plan — Elite Build CRM

_Created:_ 2026-04-26
_Owner:_ Deven Suji
_Goal:_ convert the single-tenant CRM into a multi-tenant SaaS using the Bridge model (`tenants/{tenantId}/...` sub-collections), with Elite Build Infra Tech becoming the first tenant on the platform.

This plan is the schema-and-rules half of the SaaS migration. Hosting, billing, custom domains, signup flow, and observability are out of scope here — they slot in after the schema cutover is complete.

---

## 0. Decisions locked in before this plan

1. **Multi-tenancy strategy:** Bridge model. Every existing top-level collection becomes a sub-collection under `tenants/{tenantId}`.
2. **Tenant identity:** subdomain + slug. URL is `acme.crm.elitebuild.com`, Firestore doc id is `acme`. Slug is human-readable and stable.
3. **User-to-tenant cardinality:** one Firebase Auth user can belong to many tenants. Tenant role and active flag live on the per-tenant membership doc, not on the user doc.
4. **Platform admin separation:** a top-level `platform_admins/{uid}` collection holds platform-level identities (Deven). Not modeled as a fake tenant.
5. **Migration shape:** big-bang cutover for the existing Elite Build data. One scheduled maintenance window, no dual-write transition. There is currently exactly one tenant, so no realistic alternative justifies the complexity of dual-write.
6. **Default tenant id for the existing data:** `elite-build`.

---

## 1. Target schema

### 1.1 Top-level collections (after migration)

```
/tenants/{tenantId}                         tenant root document
/tenants/{tenantId}/users/{userId}          per-tenant membership (role, active flag)
/tenants/{tenantId}/leads/{leadId}
/tenants/{tenantId}/projects/{projectId}
/tenants/{tenantId}/inventory/{unitId}
/tenants/{tenantId}/project_schemas/{schemaId}
/tenants/{tenantId}/marketing_teams/{teamId}
/tenants/{tenantId}/crm_config/{configId}   (kanban, whatsapp, ai, sla, nurture, lead_assignment, property_match, branding, lead_card_colors, _user_count)
/tenants/{tenantId}/reverse_match_projects/{projectId}
/tenants/{tenantId}/reverse_match_units/{unitId}
/tenants/{tenantId}/no_match_intelligence/{leadId}
/tenants/{tenantId}/demand_gap_reports/{reportId}
/tenants/{tenantId}/whatsapp_send_locks/{leadId}
/tenants/{tenantId}/whatsapp_send_failures/{docId}
/tenants/{tenantId}/processed_events/{eventId}

/platform_admins/{uid}                      Deven (platform owner)
/platform_users/{uid}                       OPTIONAL: directory of every Firebase Auth user, used for tenant switcher (see 1.4)
```

### 1.2 Tenant root document shape

```ts
// tenants/{tenantId}
{
  id: string;                          // matches doc id (e.g. 'elite-build')
  display_name: string;                // 'Elite Build Infra Tech'
  slug: string;                        // 'elite-build' (== id, kept for clarity)
  custom_domain: string | null;        // 'crm.elitebuild.com' once provisioned
  plan: 'starter' | 'growth' | 'enterprise';
  status: 'active' | 'trialing' | 'past_due' | 'suspended';
  features: {                          // per-plan feature flags
    ai_copilot: boolean;
    inbound_whatsapp: boolean;
    bulk_csv_import: boolean;
    custom_domain: boolean;
    seat_limit: number;                // hard cap on /users docs
  };
  billing: {
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    current_period_end: Timestamp | null;
  };
  region: 'asia-south1' | 'europe-west1' | 'us-central1';   // where data lives
  created_at: Timestamp;
  created_by_uid: string;
}
```

### 1.3 Per-tenant user membership shape

```ts
// tenants/{tenantId}/users/{uid}
{
  uid: string;                         // == doc id, matches Firebase Auth uid
  email: string;                       // copied for indexing/search
  name: string;
  role: 'superadmin' | 'admin' | 'sales_exec' | 'digital_marketing'
       | 'channel_partner' | 'viewer' | 'hr' | 'payroll_finance';
  active: boolean;
  joined_at: Timestamp;
  invited_by_uid: string | null;
}
```

Critical change from today: `role` and `active` are **scoped to a tenant**. The same `uid` may be `admin` at `elite-build` and `viewer` at `acme-realty`.

### 1.4 Tenant switcher: how a user finds their tenants

Two options on the read path; pick one and keep it consistent.

**Option A — directory collection (`platform_users`).** On every login, write `platform_users/{uid}.tenant_ids: ['elite-build', 'acme-realty']`. Frontend reads this single doc, populates the tenant switcher. Simple and fast, but introduces a directory you have to keep in sync.

**Option B — collection-group query.** Firestore allows querying *across* every `users` sub-collection with `db.collectionGroup('users').where('uid', '==', myUid)`. No directory to maintain, but the query has higher latency than a single-doc read and requires a collection-group index. Also requires careful rules to prevent it returning unrelated users.

**Recommendation:** Option A. The write happens once per login (negligible cost) and the read is one direct doc fetch. Defer Option B until you have so many tenants the directory stops scaling.

### 1.5 Platform admin shape

```ts
// platform_admins/{uid}
{
  uid: string;
  email: string;
  name: string;
  granted_by: string;                  // first one is bootstrapped manually
  granted_at: Timestamp;
}
```

Platform admins can read every tenant's data for support and debugging, write nothing by default, and elevate to write only via a deliberate "act as tenant" flow (out of scope for this doc).

---

## 2. Firestore rules sketch (Bridge model)

Goal: every collection is reachable only via `/tenants/{tenantId}/...`, and every read/write requires the requester to be either an active member of that tenant or a platform admin. There are zero top-level collections that hold tenant data.

```javascript
rules_version = "2";
service cloud.firestore {
  match /databases/{database}/documents {

    // ============================================================
    // HELPERS — all tenant-scoped
    // ============================================================

    function isAuth() {
      return request.auth != null;
    }

    // Platform admin (Deven). Read-only across all tenants by default.
    function isPlatformAdmin() {
      return isAuth() &&
        exists(/databases/$(database)/documents/platform_admins/$(request.auth.uid));
    }

    // Look up the requester's membership doc in the requested tenant.
    function membership(tenantId) {
      return get(/databases/$(database)/documents/tenants/$(tenantId)/users/$(request.auth.uid)).data;
    }

    function isMember(tenantId) {
      return isAuth() &&
        exists(/databases/$(database)/documents/tenants/$(tenantId)/users/$(request.auth.uid)) &&
        membership(tenantId).active == true;
    }

    function hasRole(tenantId, role) {
      return isMember(tenantId) && membership(tenantId).role == role;
    }

    function isSuperAdmin(tenantId) { return hasRole(tenantId, 'superadmin'); }
    function isAdmin(tenantId)      { return hasRole(tenantId, 'admin'); }
    function isSalesExec(tenantId)  { return hasRole(tenantId, 'sales_exec'); }
    function isChannelPartner(tenantId) { return hasRole(tenantId, 'channel_partner'); }
    function isDigitalMarketing(tenantId) { return hasRole(tenantId, 'digital_marketing'); }
    function isViewer(tenantId)     { return hasRole(tenantId, 'viewer'); }

    function canAdminister(tenantId) {
      return isSuperAdmin(tenantId) || isAdmin(tenantId);
    }
    function canManageLeads(tenantId) {
      return isSuperAdmin(tenantId) || isAdmin(tenantId) || isSalesExec(tenantId);
    }

    function tenantStatusActive(tenantId) {
      return get(/databases/$(database)/documents/tenants/$(tenantId)).data.status in ['active', 'trialing'];
    }

    function onlyCampaignsChanged() {
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly(['campaigns', 'updated_at']);
    }

    function unchangedRoleAndActive() {
      return request.resource.data.role == resource.data.role
          && request.resource.data.active == resource.data.active;
    }

    // ============================================================
    // PLATFORM ADMINS — bootstrapped manually, never client-writable
    // ============================================================
    match /platform_admins/{uid} {
      allow read: if isPlatformAdmin();
      allow write: if false;
    }

    // ============================================================
    // PLATFORM USERS DIRECTORY — own-doc only (used by tenant switcher)
    // ============================================================
    match /platform_users/{uid} {
      allow read, write: if isAuth() && request.auth.uid == uid;
      allow read: if isPlatformAdmin();
    }

    // ============================================================
    // TENANT ROOT
    // - Members of the tenant can read it.
    // - Platform admin can read all tenants.
    // - Superadmin of the tenant can update display_name / branding.
    // - Plan, status, billing, region are platform-controlled
    //   (server only — written from server-side billing webhooks).
    // ============================================================
    match /tenants/{tenantId} {
      allow read: if isMember(tenantId) || isPlatformAdmin();

      // Tenants are created via a server-side signup function only.
      allow create: if false;

      // Superadmins of the tenant can update a small whitelist of fields.
      allow update: if isSuperAdmin(tenantId)
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['display_name', 'updated_at']);

      // Plan / status / billing / region updates only from server (Admin SDK bypasses rules).
      allow delete: if false;

      // ============================================================
      // PER-TENANT USERS (membership docs)
      // ============================================================
      match /users/{userId} {
        // Any active member can read the team list of their own tenant.
        allow read: if isMember(tenantId) || isPlatformAdmin();

        // First-login self-create is allowed if the tenant exists and the
        // signup endpoint already provisioned a placeholder doc — i.e.
        // documents prefixed `pending_*` mirror today's pattern. Otherwise
        // membership creation is admin-only.
        allow create: if isAuth() && request.auth.uid == userId
          && userId.matches('pending_.*');

        // Superadmin / admin of the tenant can invite new members.
        allow create: if canAdminister(tenantId);

        // A user can update their own membership doc, but cannot change role
        // or active state. (Tightens today's gap where users can self-promote.)
        allow update: if isAuth() && request.auth.uid == userId
          && unchangedRoleAndActive();

        // Only superadmin can change role/active for others or remove members.
        allow update, delete: if isSuperAdmin(tenantId);

        // Pending-doc cleanup
        allow delete: if isAuth() && userId.matches('pending_.*');
      }

      // ============================================================
      // LEADS
      // ============================================================
      match /leads/{leadId} {
        allow read: if canManageLeads(tenantId) || isViewer(tenantId)
          || (isChannelPartner(tenantId) && resource.data.owner_uid == request.auth.uid);

        allow create: if canManageLeads(tenantId);
        allow create: if isChannelPartner(tenantId)
          && request.resource.data.owner_uid == request.auth.uid;

        allow update: if canManageLeads(tenantId);
        allow update: if isChannelPartner(tenantId)
          && resource.data.owner_uid == request.auth.uid
          && request.resource.data.owner_uid == request.auth.uid;

        allow delete: if canAdminister(tenantId);
      }

      // ============================================================
      // PROJECTS
      // ============================================================
      match /projects/{projectId} {
        allow read: if isMember(tenantId);
        allow create, delete: if canAdminister(tenantId);
        allow update: if canAdminister(tenantId);
        allow update: if isDigitalMarketing(tenantId) && onlyCampaignsChanged();
      }

      // ============================================================
      // INVENTORY
      // ============================================================
      match /inventory/{unitId} {
        allow read: if isMember(tenantId);
        allow create, update, delete: if canAdminister(tenantId);
      }

      // ============================================================
      // PROJECT SCHEMAS
      // ============================================================
      match /project_schemas/{schemaId} {
        allow read: if isMember(tenantId);
        allow create, update, delete: if canAdminister(tenantId);
      }

      // ============================================================
      // CRM CONFIG
      // ============================================================
      match /crm_config/{configId} {
        allow read: if isMember(tenantId) && !(configId in ['ai', 'whatsapp']);
        allow read: if canAdminister(tenantId) && configId in ['ai', 'whatsapp'];
        allow write: if canAdminister(tenantId);
        // property_match threshold is the one config any active member can adjust.
        allow write: if isMember(tenantId) && configId == 'property_match';
        // _user_count first-tenant bootstrap is created server-side, not by client.
      }

      // ============================================================
      // MARKETING TEAMS
      // ============================================================
      match /marketing_teams/{teamId} {
        allow read: if isMember(tenantId);
        allow create, update, delete: if canAdminister(tenantId);
      }

      // ============================================================
      // SERVER-OWNED COLLECTIONS — read-only to client
      // ============================================================
      match /reverse_match_projects/{projectId} {
        allow read: if isMember(tenantId);
      }
      match /reverse_match_units/{unitId} {
        allow read: if isMember(tenantId);
      }
      match /no_match_intelligence/{leadId} {
        allow read: if isMember(tenantId);
      }
      match /demand_gap_reports/{reportId} {
        allow read: if isMember(tenantId);
      }

      // Lock / dedup / failure log collections — server-only, no client access.
      match /whatsapp_send_locks/{leadId}      { allow read, write: if false; }
      match /whatsapp_send_failures/{docId}    {
        allow read: if canAdminister(tenantId);
        allow write: if false;
      }
      match /processed_events/{eventId}        { allow read, write: if false; }
    }

    // Default deny — anything outside /tenants/{tenantId} or /platform_*.
  }
}
```

**What changes versus today:**

1. Every `match` block is one level deeper, scoped under `tenants/{tenantId}`.
2. `crmUser()` is replaced by `membership(tenantId)` — role lookup is per-tenant.
3. Self-update on the membership doc is now field-guarded (`unchangedRoleAndActive`), closing today's self-promotion gap.
4. Tenant root, plan, status, billing, region are server-only writes.
5. Locks / dedup / processed_events are walled off from clients entirely.

---

## 3. Index strategy

The collection-group index for `leads(owner_uid ASC, created_at DESC)` already exists. After migration we keep it as a **collection-group** scope so queries that span tenants (platform admin support views) still work. For per-tenant queries, Firestore auto-indexes on the document path.

`firestore.indexes.json` to be updated:

```json
{
  "indexes": [
    {
      "collectionGroup": "leads",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "owner_uid", "order": "ASCENDING" },
        { "fieldPath": "created_at", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "leads",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "owner_uid", "order": "ASCENDING" },
        { "fieldPath": "created_at", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "users",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "uid", "order": "ASCENDING" }
      ]
    }
  ]
}
```

Before deploying any new composite query, add it to source first (the rule we wrote in `IssuesToAddress.md` after the CP indexes regression).

---

## 4. Migration: collection-by-collection rewrite

Each collection is migrated identically. The shape of the work for any collection `X`:

1. Read every doc from `X/{docId}`.
2. Write the same doc to `tenants/elite-build/X/{docId}`.
3. Verify by counting docs at source and target.
4. Delete the source collection only after the cutover and one week of stability.

The doc IDs and field shapes are preserved. **No fields are renamed during the move.** Renames happen in a separate migration after this one stabilizes.

### 4.1 Order of migration

Order matters because Cloud Functions trigger off Firestore writes. Migrate read-mostly reference data first, then transactional data, then server-managed snapshots last.

| # | Collection | Tenant-scoped path | Notes |
|---|---|---|---|
| 1 | `crm_config/*` | `tenants/elite-build/crm_config/*` | All config docs (kanban, whatsapp, ai, sla, nurture, etc.) |
| 2 | `marketing_teams/*` | `tenants/elite-build/marketing_teams/*` | Static-ish reference data |
| 3 | `project_schemas/*` | `tenants/elite-build/project_schemas/*` | Schema definitions |
| 4 | `projects/*` | `tenants/elite-build/projects/*` | Triggers `rematch_leads_on_project_change` — disable trigger first |
| 5 | `inventory/*` | `tenants/elite-build/inventory/*` | Triggers `rematch_leads_on_inventory_change` — disable trigger first |
| 6 | `users/*` | `tenants/elite-build/users/*` | Membership docs. Strip platform-only fields, add `joined_at` |
| 7 | `leads/*` | `tenants/elite-build/leads/*` | Triggers `match_lead_to_inventory` and `on_lead_match_update` — disable both first |
| 8 | `reverse_match_projects/*` | `tenants/elite-build/reverse_match_projects/*` | Server-owned. Optional — can be regenerated post-cutover |
| 9 | `reverse_match_units/*` | `tenants/elite-build/reverse_match_units/*` | Same |
| 10 | `no_match_intelligence/*` | `tenants/elite-build/no_match_intelligence/*` | Same |
| 11 | `demand_gap_reports/current` | `tenants/elite-build/demand_gap_reports/current` | Same |
| 12 | `whatsapp_send_locks/*` | _skip_ | Ephemeral — let them expire and rewrite under tenant path |
| 13 | `whatsapp_send_failures/*` | `tenants/elite-build/whatsapp_send_failures/*` | Optional history preservation |
| 14 | `processed_events/*` | _skip or copy_ | Dedup keys; copying is safer than skipping (prevents Pub/Sub redelivery from re-firing) |

**Skipped today:** `whatsapp_send_locks` is a 60-second TTL collection — by the time the cutover finishes, every lock has expired. Easier to let them die.

### 4.2 Backfill script outline

One Python script, idempotent, runnable from Deven's laptop with a service account. Targets `elite-build-crm`.

```python
# scripts/migrate_to_saas.py
"""
One-shot backfill: copies every top-level collection into
tenants/elite-build/<collection>/.

Idempotent: target writes use set() with merge, so a second run is safe
unless source data has been deleted in between.

Pre-cutover dry run:
    python migrate_to_saas.py --dry-run

Cutover:
    1. Disable Eventarc triggers for match-lead and on-lead-match-update.
    2. Pause webhook ingestion (Cloud Function --no-allow-unauthenticated).
    3. Run this script with --commit.
    4. Verify counts match.
    5. Deploy new code that reads/writes via /tenants/elite-build/...
    6. Re-enable triggers (now bound to new path).
    7. Re-enable webhook (rewritten to write under tenant path).

Rollback: code is reverted, source collections are still intact, new
sub-collection writes are abandoned. Source remains the source of truth
until the post-cutover cleanup window passes.
"""

import argparse
import sys
from google.cloud import firestore

TENANT_ID = "elite-build"
PROJECT_ID = "elite-build-crm"

# Order matches §4.1.
COLLECTIONS_TO_COPY = [
    "crm_config",
    "marketing_teams",
    "project_schemas",
    "projects",
    "inventory",
    "users",
    "leads",
    "reverse_match_projects",
    "reverse_match_units",
    "no_match_intelligence",
    "demand_gap_reports",
    "whatsapp_send_failures",
    "processed_events",
]

# Fields to strip when migrating users -> tenants/{id}/users
USER_FIELDS_TO_DROP = set()  # role/active stay; only drop fields that don't apply

# Fields to add when migrating users
def enrich_user_doc(doc_dict, doc_id):
    return {
        **doc_dict,
        "uid": doc_id,
        "joined_at": doc_dict.get("created_at") or firestore.SERVER_TIMESTAMP,
        "invited_by_uid": None,
    }


def copy_collection(db, name, dry_run, batch_size=400):
    src = db.collection(name)
    dst_root = db.collection("tenants").document(TENANT_ID).collection(name)

    src_count = 0
    dst_writes = 0
    batch = db.batch()
    pending = 0

    for snap in src.stream():
        src_count += 1
        data = snap.to_dict() or {}

        if name == "users":
            data = enrich_user_doc(data, snap.id)

        target_ref = dst_root.document(snap.id)
        if dry_run:
            print(f"[DRY] {name}/{snap.id} -> tenants/{TENANT_ID}/{name}/{snap.id}")
            continue

        batch.set(target_ref, data, merge=True)
        pending += 1
        dst_writes += 1
        if pending >= batch_size:
            batch.commit()
            batch = db.batch()
            pending = 0

    if pending and not dry_run:
        batch.commit()

    return {"name": name, "src_count": src_count, "dst_writes": dst_writes}


def ensure_tenant_root(db, dry_run):
    ref = db.collection("tenants").document(TENANT_ID)
    if ref.get().exists:
        print(f"tenants/{TENANT_ID} already exists, skipping create")
        return
    payload = {
        "id": TENANT_ID,
        "display_name": "Elite Build Infra Tech",
        "slug": TENANT_ID,
        "custom_domain": None,
        "plan": "enterprise",          # Elite Build is on the highest tier (themselves)
        "status": "active",
        "features": {
            "ai_copilot": True,
            "inbound_whatsapp": True,
            "bulk_csv_import": True,
            "custom_domain": True,
            "seat_limit": 50,
        },
        "billing": {
            "stripe_customer_id": None,
            "stripe_subscription_id": None,
            "current_period_end": None,
        },
        "region": "asia-south1",
        "created_at": firestore.SERVER_TIMESTAMP,
        "created_by_uid": "<deven-uid>",
    }
    if dry_run:
        print(f"[DRY] would create tenants/{TENANT_ID}")
        return
    ref.set(payload)
    print(f"created tenants/{TENANT_ID}")


def verify(db):
    """Counts docs at source vs. target. Run after copy."""
    print("\n--- VERIFY ---")
    for name in COLLECTIONS_TO_COPY:
        src = sum(1 for _ in db.collection(name).stream())
        dst = sum(1 for _ in db.collection("tenants").document(TENANT_ID).collection(name).stream())
        marker = "OK" if src == dst else "MISMATCH"
        print(f"  {marker:9}  {name:32}  src={src:>5}  dst={dst:>5}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--commit", action="store_true")
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()

    if not (args.dry_run or args.commit or args.verify_only):
        parser.error("must pass one of --dry-run / --commit / --verify-only")

    db = firestore.Client(project=PROJECT_ID)

    if args.verify_only:
        verify(db)
        return

    ensure_tenant_root(db, dry_run=args.dry_run)

    results = []
    for name in COLLECTIONS_TO_COPY:
        try:
            r = copy_collection(db, name, dry_run=args.dry_run)
            results.append(r)
            print(f"  {name:32}  src={r['src_count']:>5}  copied={r['dst_writes']:>5}")
        except Exception as e:
            print(f"  ERROR copying {name}: {e}", file=sys.stderr)
            sys.exit(1)

    if not args.dry_run:
        verify(db)


if __name__ == "__main__":
    main()
```

**Why this shape:** every `set(..., merge=True)` is idempotent on doc id, so re-runs are safe. Verification counts are a sanity gate — they should match exactly. The script does not delete source data; that happens in §6 only after the cutover has been stable for a week.

### 4.3 Source-cleanup script (after one week of stability)

```python
# scripts/decommission_legacy_collections.py
# Deletes the old top-level collections after the new path has been
# the source of truth for at least 7 days. Refuses to run if any source
# doc is newer than the cutover timestamp (proves nothing is still writing).

CUTOVER_AT = "2026-05-XX..."  # set during cutover
```

Run only after `firebase firestore:export` has snapshotted the legacy paths to a GCS backup.

---

## 5. Code rewrite plan

The schema migration is the easy half. The code rewrite is the harder half because every Firestore reference moves one level deeper.

### 5.1 Frontend (Next.js)

1. **Add `TenantContext`.** Resolves tenant id from `window.location.host` (`acme.crm.elitebuild.com` → `acme`). Wraps `AuthContext`. Exposes `tenant`, `tenantId`, `membership`, `loadingTenant`.
2. **Add a `tenantPath(...)` helper.** Returns `tenants/${tenantId}/${...rest}`. Every Firestore call in the app routes through it.
3. **Refactor `useFirestoreCollection` / `useFirestoreDoc`.** Take a tenant id implicitly from context, prepend `tenants/{tenantId}/` automatically. This is the single biggest leverage point — once the hook is fixed, ~80% of call sites are correct without touching them.
4. **Refactor `app/page.tsx`, `app/admin/page.tsx`, `app/projects/page.tsx`, `app/dashboard/page.tsx`, `app/tasks/page.tsx`.** All `collection(db, 'leads')` and `doc(db, 'crm_config', ...)` calls become tenant-scoped via the helper.
5. **Refactor API routes.** `/api/whatsapp/send`, `/api/lead-assignment/next`, `/api/polish-note`, `/api/geocode`, `/api/resolve-map-url`. Each route extracts the tenant id from the request (subdomain on the `Host` header, or a body param), verifies the caller's membership in that tenant via the Admin SDK, then operates on `tenants/{tenantId}/...`.
6. **Add tenant switcher UI.** Top of sidebar, reads from `platform_users/{uid}.tenant_ids`. Switching navigates to the new subdomain.
7. **Move WhatsApp / AI secrets to per-tenant Secret Manager entries.** Naming convention `whatsapp-token-{tenantId}`. The API route looks up the tenant's secret on every request (cached per-instance for warm starts).

### 5.2 Cloud Functions (Python)

Every function gains a `tenant_id` extraction step at the top of the handler.

| Function | New trigger path | Tenant id source |
|---|---|---|
| `match_lead_to_inventory` | `tenants/{tenantId}/leads/{leadId}` | from `cloud_event['subject']` |
| `rematch_leads_on_inventory_change` | `tenants/{tenantId}/inventory/{unitId}` | from subject |
| `rematch_leads_on_project_change` | `tenants/{tenantId}/projects/{projectId}` | from subject |
| `rematch_leads_on_threshold_change` | `tenants/{tenantId}/crm_config/property_match` | from subject |
| `on_lead_match_update` | `tenants/{tenantId}/leads/{leadId}` | from subject |
| `lead_ingestion_webhook` | unchanged HTTP | from subdomain or `?tenant=` param |
| `check_site_visit_reminders` | unchanged HTTP (Cloud Scheduler) | iterate over every tenant; per-tenant fan-out |

**Trigger path with wildcard:** Eventarc Firestore triggers support `tenants/{tenantId}/leads/{leadId}` as a path with two wildcards — both `tenantId` and `leadId` are captured and exposed in `cloud_event['subject']` like `documents/tenants/elite-build/leads/abc123`. Parse with:

```python
def parse_tenant_and_doc(cloud_event):
    parts = cloud_event["subject"].split("/")
    # subject like: 'documents/tenants/elite-build/leads/abc123'
    return parts[2], parts[-1]   # tenant_id, doc_id
```

**Lead ingestion webhook becomes per-tenant.** Choices:

- Option A — `https://crm.elitebuild.com/ingest?tenant=elite-build`, key in header `X-Webhook-Key: <per-tenant-key>`. Function looks up `tenants/{tenant}/secrets/webhook_api_key` (or `webhook-api-key-{tenant}` in Secret Manager) and constant-time compares.
- Option B — key prefix carries the tenant id: `elt_<tenantId>_<random>`. Function decodes prefix, looks up secret. Cleaner for customers, slightly harder to rotate.

Pick A first; B as a polish.

**Site visit reminders become tenant-aware.** The current function streams `db.collection('leads')`. New shape: list every active tenant from `tenants/`, for each run the existing per-lead loop scoped to that tenant's leads. Already cheap because reminders only fire on the matching time windows.

### 5.3 Storage

Per-tenant bucket prefixes: `gs://elitebuild-tenants-assets/{tenantId}/projects/...`, `gs://elitebuild-tenants-recordings/{tenantId}/...`. Storage rules check `request.auth != null` plus a Firestore lookup on the tenant membership — Storage rules can call `firestore.exists(...)` since 2024.

```javascript
service firebase.storage {
  match /b/{bucket}/o {
    match /tenants/{tenantId}/projects/{allPaths=**} {
      allow read: if true; // public marketing imagery
      allow write: if request.auth != null
        && firestore.exists(
          /databases/(default)/documents/tenants/$(tenantId)/users/$(request.auth.uid)
        );
    }
    // ...same shape for branding, recordings
  }
}
```

---

## 6. Cutover runbook

This is the playbook for the maintenance window. Schedule for a Sunday morning IST when no sales activity is happening.

```bash
# T-7 days
firebase firestore:export gs://elitebuild-pre-saas-backup-$(date +%Y%m%d) \
  --project elite-build-crm

# T-1 day
gcloud functions deploy match-lead --entry-point ... --no-traffic   # stage new version
# repeat for each function — staged but not promoted

# T-0 — cutover begins
# 1. Pause inbound traffic
gcloud functions update lead-ingestion-webhook \
  --no-allow-unauthenticated --project elite-build-crm

# 2. Disable Firestore triggers (each is a separate function)
for fn in match-lead rematch-leads-on-inventory-change \
          rematch-leads-on-project-change rematch-leads-on-threshold-change \
          on-lead-match-update; do
  gcloud functions delete $fn --project elite-build-crm --quiet || true
done
# (delete + redeploy under new path is cleaner than --update-trigger which
#  Eventarc doesn't support changing in place)

# 3. Run the backfill
cd CRM/scripts
python migrate_to_saas.py --commit

# 4. Verify
python migrate_to_saas.py --verify-only
# all rows must show OK

# 5. Deploy new code
cd ../elite-build-dashboard
firebase deploy --only firestore:rules,firestore:indexes
# build & deploy the Next.js app to Cloud Run with the tenant-aware code

# 6. Redeploy Cloud Functions on the new tenant path
gcloud functions deploy match-lead \
  --gen2 --runtime python313 --region asia-south1 \
  --source CRM/functions/match_lead --entry-point match_lead_to_inventory \
  --trigger-event-filters="type=google.cloud.firestore.document.v1.updated" \
  --trigger-event-filters="database=(default)" \
  --trigger-event-filters-path-pattern="document=tenants/{tenantId}/leads/{leadId}" \
  --project elite-build-crm
# repeat for every other function

# 7. Re-enable webhook
gcloud functions update lead-ingestion-webhook \
  --allow-unauthenticated --project elite-build-crm

# 8. Smoke tests (manual or scripted)
#    - Hit the webhook with a fake lead, check it lands at tenants/elite-build/leads
#    - Edit a unit's price in the dashboard, watch match-lead re-fire
#    - Toggle property_match threshold, watch the threshold trigger fire
#    - Send a WhatsApp from the lead detail modal, verify Graph response
```

### 6.1 Rollback

If cutover fails before step 5, no code has changed in production — backfill data is duplicate but harmless, source is intact. Re-enable triggers on the old path (re-deploy old code), unpause webhook, declare done-with-rollback.

If cutover fails after step 5, two cases:
- New code was deployed but reads/writes don't work → revert Cloud Run to previous revision (`gcloud run services update-traffic ... --to-revisions=PREVIOUS=100`), redeploy old triggers, leave new sub-collection writes orphaned (cleaned up by §4.3 later).
- New code works but a function is misbehaving → leave dashboard up, redeploy that single function back to old path, debug, retry.

### 6.2 Decommission window

Wait one week of clean operation on the new schema. Then run `decommission_legacy_collections.py` to delete the old top-level docs. The pre-cutover GCS export remains as the long-term backup.

---

## 7. Tests to add before cutover

1. **Rules tests for tenant isolation.** Member of tenant A cannot read tenant B's leads, even if they share an email or were once a member of B and got removed. Add as `tests/rules/tenantIsolation.rules.test.ts`. This is the single most important test — it is the entire promise of multi-tenancy.
2. **Rules tests for self-promotion guard.** `users/{uid}` self-update with `role: 'superadmin'` must be denied.
3. **Rules tests for role inheritance across tenants.** Same uid is `admin` in tenant A and `viewer` in tenant B; query patterns must reflect the per-tenant role.
4. **Unit test for `tenantPath()`.** No leading/trailing slashes, no template injection if a tenant id ever contains odd characters (sanitize on signup).
5. **Integration test for the backfill script.** Run against the Firestore emulator with a fixture, assert that doc counts match and shapes are unchanged.

---

## 8. Out of scope for this document

These come after the schema cutover lands:

- Hosting on Cloud Run with a wildcard cert (`*.crm.elitebuild.com`)
- Stripe billing integration and the `tenants/{id}.billing` write path
- Tenant signup flow and the server-side tenant-creation function
- Custom domain provisioning (`crm.acmebuilders.com`)
- Per-tenant feature flags being enforced at the UI level
- Per-tenant rate limits on WhatsApp send and webhook ingestion
- Identity Platform upgrade for tenant-aware Firebase Auth (today's plan keeps the simpler "single Auth project, membership in Firestore" model)

These belong in a follow-up `Saas_Hosting_Plan.md` once the schema work is complete.

---

## 9. Estimated effort

Rough sizing, single-engineer:

| Phase | Days |
|---|---:|
| Rules rewrite + rules tests | 3 |
| Backfill script + verify against staging copy | 2 |
| Frontend `TenantContext` + hook refactor | 4 |
| Frontend page rewrites (page.tsx, admin, projects, dashboard, tasks) | 5 |
| API route rewrites + per-tenant secret lookup | 2 |
| Cloud Functions trigger path rewrite | 3 |
| Webhook per-tenant key + signing | 2 |
| Storage bucket prefix migration | 1 |
| Dry-run cutover on staging clone | 2 |
| Production cutover + smoke + 1 week soak | 1 + 7 |
| **Total** | **~25 working days** |

---

_End of plan._
