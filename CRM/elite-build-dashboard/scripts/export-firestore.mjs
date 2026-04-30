#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const DEFAULT_COLLECTIONS = [
  'leads',
  'projects',
  'inventory',
  'project_schemas',
  'crm_config',
  'users',
  'marketing_teams',
  'whatsapp_messages',
  'whatsapp_send_locks',
  'whatsapp_send_failures',
  'processed_events',
  'audit_logs',
  'reverse_match_projects',
  'reverse_match_units',
  'no_match_intelligence',
  'demand_gap_reports',
];

function argValue(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function getAdminApp() {
  const existing = getApps().find(app => app.name === 'exporter');
  if (existing) return existing;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || argValue('project');
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawServiceAccount) {
    return initializeApp({ credential: cert(JSON.parse(rawServiceAccount)), projectId }, 'exporter');
  }
  return initializeApp({ credential: applicationDefault(), projectId }, 'exporter');
}

function serialize(value) {
  if (!value || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
}

function csvEscape(value) {
  if (value === undefined || value === null) return '';
  const raw = String(value);
  return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

async function writeCsv(filePath, rows, headers) {
  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(header => csvEscape(row[header])).join(',')),
  ];
  await fs.writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function leadCsvRow(doc) {
  const raw = doc.raw_data || {};
  return {
    id: doc.id,
    name: raw.lead_name,
    phone: raw.phone,
    whatsapp: raw.whatsapp_number || raw.whatsapp,
    email: raw.email,
    status: doc.status,
    source: doc.source,
    assigned_to: doc.assigned_to,
    budget: raw.budget,
    interest: raw.interests?.join('; ') || raw.interest,
    location: raw.location,
    plan_to_buy: raw.plan_to_buy,
    objections: doc.objections?.join('; '),
    interested_projects: doc.interested_properties?.map(item => item.projectName).join('; '),
    created_at: doc.created_at,
    last_activity_at: (doc.activity_log || []).map(item => item.created_at).sort().at(-1),
  };
}

function inventoryCsvRow(doc) {
  return {
    id: doc.id,
    projectId: doc.projectId,
    projectName: doc.projectName,
    location: doc.location,
    propertyType: doc.propertyType,
    builder: doc.builder,
    status: doc.status,
    price: doc.price,
    booked_by_lead_id: doc.booked_by_lead_id,
    unit_number: doc.fields?.unit_number,
    plot_number: doc.fields?.plot_number,
    bhk: doc.fields?.bhk,
    area: doc.fields?.area || doc.fields?.plot_area || doc.fields?.super_builtup_area,
    created_at: doc.created_at,
  };
}

async function exportCollection(db, collectionName, outputDir) {
  const snapshot = await db.collection(collectionName).get();
  const docs = snapshot.docs.map(doc => ({ id: doc.id, ...serialize(doc.data()) }));
  const jsonl = docs.map(doc => JSON.stringify(doc)).join('\n');
  await fs.writeFile(path.join(outputDir, `${collectionName}.jsonl`), jsonl ? `${jsonl}\n` : '', 'utf8');
  return docs;
}

async function main() {
  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const outputRoot = path.resolve(argValue('out', path.join(process.cwd(), 'backups')));
  const outputDir = path.join(outputRoot, `firestore-${timestamp}`);
  const collections = (argValue('collections') || DEFAULT_COLLECTIONS.join(','))
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

  await fs.mkdir(outputDir, { recursive: true });
  const app = getAdminApp();
  const db = getFirestore(app);

  const manifest = {
    exportedAt: new Date().toISOString(),
    projectId: app.options.projectId || null,
    outputDir,
    collections: {},
  };
  const exported = new Map();

  for (const collectionName of collections) {
    const docs = await exportCollection(db, collectionName, outputDir);
    exported.set(collectionName, docs);
    manifest.collections[collectionName] = docs.length;
    console.log(`exported ${collectionName}: ${docs.length}`);
  }

  if (exported.has('leads')) {
    await writeCsv(
      path.join(outputDir, 'leads.csv'),
      exported.get('leads').map(leadCsvRow),
      ['id', 'name', 'phone', 'whatsapp', 'email', 'status', 'source', 'assigned_to', 'budget', 'interest', 'location', 'plan_to_buy', 'objections', 'interested_projects', 'created_at', 'last_activity_at'],
    );
  }
  if (exported.has('inventory')) {
    await writeCsv(
      path.join(outputDir, 'inventory.csv'),
      exported.get('inventory').map(inventoryCsvRow),
      ['id', 'projectId', 'projectName', 'location', 'propertyType', 'builder', 'status', 'price', 'booked_by_lead_id', 'unit_number', 'plot_number', 'bhk', 'area', 'created_at'],
    );
  }

  await fs.writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`backup written to ${outputDir}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
