# Channel Partner Workflow — 2026-04-21

## What a Channel Partner can do
- **Landing:** `/` (Leads board) — sees only their own leads
- **Dashboard:** `/dashboard` — dedicated `ChannelPartnerDashboard`, "My Pipeline" only. No Internal Team or Marketing Team tabs.
- **Create Lead:** yes (single-lead form). `owner_uid` stamped to self on create; source tagged `Channel Partner`.
- **Edit Lead:** yes, only on leads they own.
- **Bulk CSV upload:** **removed.** Capability `bulk_upload_leads` is no longer in the CP matrix. Import CSV button is hidden.
- **Projects / Inventory / Admin / Team:** no access.

## Security model (server-side)
Firestore rules (`firestore.rules`):
- `leads`: CP can read/create/update only where `owner_uid == request.auth.uid`. No delete.
- `users`: CP cannot read the collection at all (admin/superadmin only).
- `projects`, `inventory`, `crm_config`, `marketing_teams`: read-only for any active user (CP included) — but UI gates hide these from CP nav anyway.

## Capability matrix (`lib/utils/permissions.ts`)
```
channel_partner: ['view_dashboard', 'view_own_leads_only', 'create_lead', 'edit_lead']
```

## Key bug fixed today
**Symptom:** CP login threw `Missing or insufficient permissions` followed by
`FIRESTORE INTERNAL ASSERTION FAILED (ID: ca9)` — the SDK state got corrupted.

**Root cause:** The Leads page and Dashboard were subscribing to the **full `leads` collection** with only `orderBy('created_at', 'desc')`. Rules allow CPs to read only leads they own, so the collection-level listener was denied → cascaded into the ca9 assertion.

**Fix:** Query must match the rule. CPs now subscribe with
`where('owner_uid', '==', uid)` at query level — never a full-collection listener.

### New hook: `useFirestoreCollectionKeyed`
`lib/hooks/useFirestoreCollection.ts` now exports a keyed variant:
- Re-subscribes when `subscriptionKey` changes (constraints aren't frozen at mount)
- `subscriptionKey = null` disables the listener (used while waiting for `crmUser` to resolve so we don't fire a rules-denied query before auth lands)

Used in:
- `app/page.tsx` — leads subscription, keyed `own:{uid}` for CP, `all` otherwise
- `app/dashboard/page.tsx` — `ChannelPartnerView` keyed `own:{uid}`

## Dashboard split
- `app/dashboard/page.tsx` branches on role:
  - `channel_partner` → `ChannelPartnerView` — subscribes only to own leads. **Does not** subscribe to `/users` or `/marketing_teams` (rules block `/users` read for CPs).
  - Everyone else → `TeamView` with Internal Team + Marketing Team tabs.
- `components/dashboard/ChannelPartnerDashboard.tsx` (new) — Speed to Lead, Lead→SV%, SV→Booking%, Pipeline Value, Revenue Closed, Closing Cycle, Lead Leakage, Total Leads, pipeline trend + conversions charts, own lead funnel.

## Files touched
- `lib/utils/permissions.ts` — removed `bulk_upload_leads` from CP
- `lib/hooks/useFirestoreCollection.ts` — added `useFirestoreCollectionKeyed`
- `app/page.tsx` — query-level owner_uid filter for CP; CSV button now gated on `bulk_upload_leads` capability (not `isAdmin`)
- `app/dashboard/page.tsx` — role-branched dashboard, CP view with own-leads query
- `components/dashboard/ChannelPartnerDashboard.tsx` — new
- `firestore.rules` — already enforces owner_uid scoping (deployed earlier)

## Gotcha for future work
After a Firestore permission denial hits a realtime listener, the SDK can enter a corrupt state that survives React hot-reloads. **Hard-reload the tab** (close and reopen) to clear it. Fix the query to match rules *before* the listener fires.
