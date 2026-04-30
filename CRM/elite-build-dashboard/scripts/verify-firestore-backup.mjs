#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const REQUIRED_COLLECTIONS = [
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

const REQUIRED_CSVS = [
  'leads.csv',
  'inventory.csv',
];

function argValue(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function usage() {
  return [
    'Usage:',
    '  npm run backup:verify -- --dir=/path/to/backups/firestore-<timestamp>',
    '',
    'Checks manifest.json, JSONL collection files, document counts, and business CSV files.',
  ].join('\n');
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function countJsonlDocs(raw) {
  if (!raw.trim()) return 0;
  return raw.trimEnd().split('\n').filter(Boolean).length;
}

function collectProblems(manifest) {
  const problems = [];
  const warnings = [];
  const collections = manifest.collections || {};

  if (!manifest.exportedAt) {
    warnings.push('manifest.exportedAt is missing.');
  }
  if (!manifest.projectId) {
    warnings.push('manifest.projectId is missing; confirm the export used the intended Firebase project.');
  }

  for (const collectionName of REQUIRED_COLLECTIONS) {
    if (!Object.prototype.hasOwnProperty.call(collections, collectionName)) {
      problems.push(`manifest is missing collection "${collectionName}".`);
    }
  }

  return { problems, warnings, collections };
}

async function verifyBackupDirectory(backupDir) {
  const resolvedDir = path.resolve(backupDir);
  const manifestPath = path.join(resolvedDir, 'manifest.json');
  const problems = [];
  const warnings = [];

  if (!(await pathExists(resolvedDir))) {
    problems.push(`backup directory does not exist: ${resolvedDir}`);
    return { resolvedDir, problems, warnings, collectionCount: 0, documentCount: 0 };
  }

  if (!(await pathExists(manifestPath))) {
    problems.push(`manifest.json is missing in ${resolvedDir}`);
    return { resolvedDir, problems, warnings, collectionCount: 0, documentCount: 0 };
  }

  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    problems.push(`manifest.json is not valid JSON: ${error.message}`);
    return { resolvedDir, problems, warnings, collectionCount: 0, documentCount: 0 };
  }

  const collected = collectProblems(manifest);
  problems.push(...collected.problems);
  warnings.push(...collected.warnings);

  let documentCount = 0;
  for (const [collectionName, expectedCount] of Object.entries(collected.collections)) {
    const jsonlPath = path.join(resolvedDir, `${collectionName}.jsonl`);
    if (!(await pathExists(jsonlPath))) {
      problems.push(`${collectionName}.jsonl is missing.`);
      continue;
    }

    const actualCount = countJsonlDocs(await fs.readFile(jsonlPath, 'utf8'));
    documentCount += actualCount;
    if (actualCount !== expectedCount) {
      problems.push(`${collectionName}.jsonl has ${actualCount} docs, but manifest says ${expectedCount}.`);
    }
  }

  for (const csvName of REQUIRED_CSVS) {
    const csvPath = path.join(resolvedDir, csvName);
    if (!(await pathExists(csvPath))) {
      problems.push(`${csvName} is missing.`);
      continue;
    }
    const raw = await fs.readFile(csvPath, 'utf8');
    if (!raw.trim() || raw.trim().split('\n').length < 1) {
      problems.push(`${csvName} is empty or unreadable.`);
    }
  }

  return {
    resolvedDir,
    problems,
    warnings,
    collectionCount: Object.keys(collected.collections).length,
    documentCount,
    exportedAt: manifest.exportedAt,
    projectId: manifest.projectId,
  };
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage());
    return;
  }

  const backupDir = argValue('dir');
  if (!backupDir) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const result = await verifyBackupDirectory(backupDir);
  for (const warning of result.warnings) {
    console.warn(`warning: ${warning}`);
  }
  for (const problem of result.problems) {
    console.error(`error: ${problem}`);
  }

  if (result.problems.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(`backup verified: ${result.resolvedDir}`);
  console.log(`project: ${result.projectId || 'unknown'}`);
  console.log(`exportedAt: ${result.exportedAt || 'unknown'}`);
  console.log(`collections: ${result.collectionCount}`);
  console.log(`documents: ${result.documentCount}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
