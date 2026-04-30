# Elite Build CRM - Dashboard

Next.js 16 frontend for the Elite Build CRM. See the [main README](../../README.md) for full documentation.

## Quick Start

```bash
npm install
npm run dev    # http://localhost:3000
```

## Environment Variables

Copy `.env.local.example` or create `.env.local`:

```
NEXT_PUBLIC_FIREBASE_API_KEY="..."
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="..."
NEXT_PUBLIC_FIREBASE_PROJECT_ID="..."
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="..."
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="..."
NEXT_PUBLIC_FIREBASE_APP_ID="..."
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="..."
ROOT_SUPERADMIN_EMAIL="devensuji@gmail.com"
```

## Build

```bash
npm run build
npm start
```

## Operations

### Firestore Backup Export

Run a local Firestore export before risky data changes, schema changes, or production maintenance:

```bash
cd /Users/devensuji/Documents/github/CRM/CRM/elite-build-dashboard
npm run backup:firestore
```

Exports are written to the gitignored `backups/` folder and include JSONL snapshots plus `leads.csv`, `inventory.csv`, and a `manifest.json`.

Verify a completed export:

```bash
npm run backup:verify -- --dir=backups/firestore-<timestamp>
```

See [BackupRecoveryRunbook.md](../../docs/BackupRecoveryRunbook.md) for scheduled GCP exports, restore rehearsal, and retention guidance.
