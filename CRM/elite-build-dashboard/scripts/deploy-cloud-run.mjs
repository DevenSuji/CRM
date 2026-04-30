#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = {
  dev: {
    project: 'elite-build-infra-tech-dev',
    service: 'elite-build-crm-dev',
    region: 'asia-south1',
    serviceAccount: 'crm-cloud-run-dev@elite-build-infra-tech-dev.iam.gserviceaccount.com',
    firebaseProjectId: 'elite-build-infra-tech-dev',
    secretRefs: ['GEMINI_API_KEY=gemini-api-key:latest'],
    optionalSecretRefs: [
      'WHATSAPP_ACCESS_TOKEN=whatsapp-access-token:latest',
      'WHATSAPP_APP_SECRET=whatsapp-app-secret:latest',
      'WHATSAPP_WEBHOOK_VERIFY_TOKEN=whatsapp-webhook-verify-token:latest',
    ],
    tag: 'candidate',
  },
};

const REQUIRED_PUBLIC_ENV = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
];

function argValue(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function usage() {
  return [
    'Usage:',
    '  npm run deploy:dev',
    '  npm run deploy:dev:dry-run',
    '',
    'Options:',
    '  --target=dev              Deployment target. Default: dev.',
    '  --env-file=.env.local     Source env file for NEXT_PUBLIC_* values.',
    '  --no-promote              Leave the validated candidate at 0% traffic.',
    '  --skip-local-checks       Skip npm build/lint before deployment.',
    '  --dry-run                 Validate env and print the planned target without deploying.',
    '',
    'The script always deploys Cloud Run with --no-traffic first, validates the',
    'candidate revision/env/smoke checks, then moves traffic only after validation.',
  ].join('\n');
}

function redactValue(key, value) {
  if (key.includes('API_KEY')) return `${value.slice(0, 8)}...`;
  return value;
}

function run(command, args, { capture = false, dryRun = false } = {}) {
  const printable = [command, ...args].join(' ');
  if (dryRun) {
    console.log(`[dry-run] ${printable}`);
    return '';
  }

  const result = spawnSync(command, args, {
    cwd: APP_ROOT,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const details = capture ? `\n${result.stderr || result.stdout}` : '';
    throw new Error(`Command failed: ${printable}${details}`);
  }
  return capture ? result.stdout.trim() : '';
}

function commandSucceeds(command, args) {
  const result = spawnSync(command, args, {
    cwd: APP_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return !result.error && result.status === 0;
}

function stripInlineComment(value) {
  let quote = null;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if ((char === '"' || char === "'") && value[i - 1] !== '\\') {
      quote = quote === char ? null : quote || char;
    }
    if (char === '#' && !quote && /\s/.test(value[i - 1] || '')) {
      return value.slice(0, i).trim();
    }
  }
  return value.trim();
}

function sanitizeEnvValue(key, rawValue) {
  let value = stripInlineComment(rawValue);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  value = value.trim();

  if (!value) {
    throw new Error(`${key} is empty.`);
  }
  if (value.startsWith('"') || value.endsWith('"') || value.startsWith("'") || value.endsWith("'")) {
    throw new Error(`${key} still contains a leading/trailing quote after sanitization.`);
  }
  if (/[\r\n]/.test(value)) {
    throw new Error(`${key} contains a newline, which is not valid for this deploy env file.`);
  }
  return value;
}

async function loadPublicEnv(envFile) {
  const envPath = path.resolve(APP_ROOT, envFile);
  const raw = await fs.readFile(envPath, 'utf8');
  const values = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    if (!key.startsWith('NEXT_PUBLIC_')) continue;
    values[key] = sanitizeEnvValue(key, trimmed.slice(separator + 1));
  }

  const missing = REQUIRED_PUBLIC_ENV.filter(key => !values[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required public env values: ${missing.join(', ')}`);
  }
  return values;
}

function validatePublicEnv(values, config) {
  const problems = [];
  if (values.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== config.firebaseProjectId) {
    problems.push(`NEXT_PUBLIC_FIREBASE_PROJECT_ID must be ${config.firebaseProjectId}.`);
  }
  if (!values.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN.includes(config.firebaseProjectId)) {
    problems.push('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN does not match the Firebase project.');
  }
  if (!values.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET.includes(config.firebaseProjectId)) {
    problems.push('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET does not match the Firebase project.');
  }
  if (!values.NEXT_PUBLIC_FIREBASE_API_KEY.startsWith('AIza')) {
    problems.push('NEXT_PUBLIC_FIREBASE_API_KEY does not look like a Google browser key.');
  }
  if (!values.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.startsWith('AIza')) {
    problems.push('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY does not look like a Google browser key.');
  }
  if (!/^1:\d+:web:[a-f0-9]+$/i.test(values.NEXT_PUBLIC_FIREBASE_APP_ID)) {
    problems.push('NEXT_PUBLIC_FIREBASE_APP_ID does not match the expected Firebase web app id shape.');
  }

  for (const key of REQUIRED_PUBLIC_ENV) {
    const value = values[key];
    if (value.startsWith('"') || value.endsWith('"') || value.startsWith("'") || value.endsWith("'")) {
      problems.push(`${key} contains embedded deployment-breaking quote characters.`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Public env validation failed:\n- ${problems.join('\n- ')}`);
  }
}

async function writeEnvYaml(values, target) {
  const outputPath = path.join(os.tmpdir(), `elite-build-crm-${target}-public-env-${Date.now()}.yaml`);
  const body = REQUIRED_PUBLIC_ENV
    .map(key => `${key}: ${JSON.stringify(values[key])}`)
    .join('\n');
  await fs.writeFile(outputPath, `${body}\n`, 'utf8');
  return outputPath;
}

function describeService(config) {
  return JSON.parse(run('gcloud', [
    'run',
    'services',
    'describe',
    config.service,
    '--region',
    config.region,
    '--project',
    config.project,
    '--format=json',
  ], { capture: true }));
}

function describeRevision(config, revision) {
  return JSON.parse(run('gcloud', [
    'run',
    'revisions',
    'describe',
    revision,
    '--region',
    config.region,
    '--project',
    config.project,
    '--format=json',
  ], { capture: true }));
}

function envByName(revision) {
  const env = revision.spec?.containers?.[0]?.env || [];
  return new Map(env.map(item => [item.name, item]));
}

function verifyRevisionEnvWithSecrets(revision, publicEnv, config, secretRefs) {
  const env = envByName(revision);
  const problems = [];

  for (const key of REQUIRED_PUBLIC_ENV) {
    const deployed = env.get(key)?.value;
    if (deployed !== publicEnv[key]) {
      problems.push(`${key} does not match sanitized env value.`);
    }
    if (deployed && (deployed.startsWith('"') || deployed.endsWith('"') || deployed.startsWith("'") || deployed.endsWith("'"))) {
      problems.push(`${key} was deployed with literal quote characters.`);
    }
  }

  for (const secretRef of secretRefs) {
    const [name, rawSecret] = secretRef.split('=');
    const [secretName, secretVersion = 'latest'] = rawSecret.split(':');
    const deployed = env.get(name)?.valueFrom?.secretKeyRef;
    if (deployed?.name !== secretName || deployed?.key !== secretVersion) {
      problems.push(`${name} must be bound to Secret Manager ${secretName}:${secretVersion}.`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Revision env verification failed:\n- ${problems.join('\n- ')}`);
  }
}

function resolveSecretRefs(config) {
  const secretRefs = [...config.secretRefs];
  for (const optionalRef of config.optionalSecretRefs || []) {
    const [envName, rawSecret] = optionalRef.split('=');
    const [secretName] = rawSecret.split(':');
    const exists = commandSucceeds('gcloud', [
      'secrets',
      'describe',
      secretName,
      '--project',
      config.project,
      '--format=value(name)',
    ]);
    if (exists) {
      secretRefs.push(optionalRef);
      console.log(`optional secret detected: ${envName} -> ${secretName}:latest`);
    } else {
      console.log(`optional secret missing: ${envName} -> ${secretName}:latest`);
    }
  }
  return secretRefs;
}

async function smokeCheck(baseUrl, label) {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const login = await fetch(`${cleanBase}/login`, { redirect: 'manual' });
  if (login.status !== 200 && login.status !== 304) {
    throw new Error(`${label} /login smoke check failed with HTTP ${login.status}.`);
  }

  const branding = await fetch(`${cleanBase}/api/branding`, { cache: 'no-store' });
  if (branding.status !== 200) {
    throw new Error(`${label} /api/branding smoke check failed with HTTP ${branding.status}.`);
  }
  const payload = await branding.json();
  if (!payload?.branding || payload.error) {
    throw new Error(`${label} /api/branding returned an invalid payload.`);
  }
}

function rollbackCommand(config, previousTraffic) {
  const revisions = previousTraffic
    .filter(item => item.revisionName && Number.isFinite(item.percent))
    .map(item => `${item.revisionName}=${item.percent}`)
    .join(',');
  if (!revisions) return null;
  return [
    'gcloud run services update-traffic',
    config.service,
    '--region',
    config.region,
    '--project',
    config.project,
    '--to-revisions',
    revisions,
    '--quiet',
  ].join(' ');
}

function printEnvSummary(values) {
  console.log('public env validated:');
  for (const key of REQUIRED_PUBLIC_ENV) {
    console.log(`  ${key}=${redactValue(key, values[key])}`);
  }
}

async function main() {
  if (hasFlag('help') || hasFlag('h')) {
    console.log(usage());
    return;
  }

  const target = argValue('target', 'dev');
  const baseConfig = TARGETS[target];
  if (!baseConfig) {
    throw new Error(`Unknown target "${target}". Known targets: ${Object.keys(TARGETS).join(', ')}`);
  }

  const config = {
    ...baseConfig,
    project: argValue('project', baseConfig.project),
    service: argValue('service', baseConfig.service),
    region: argValue('region', baseConfig.region),
    serviceAccount: argValue('service-account', baseConfig.serviceAccount),
    tag: argValue('tag', baseConfig.tag),
  };
  const envFile = argValue('env-file', '.env.local');
  const dryRun = hasFlag('dry-run');
  const noPromote = hasFlag('no-promote');
  const skipLocalChecks = hasFlag('skip-local-checks') || dryRun;

  const publicEnv = await loadPublicEnv(envFile);
  validatePublicEnv(publicEnv, config);
  printEnvSummary(publicEnv);
  const secretRefs = resolveSecretRefs(config);

  const envYaml = await writeEnvYaml(publicEnv, target);
  console.log(`sanitized env file: ${envYaml}`);

  if (dryRun) {
    console.log(`target: ${config.project}/${config.region}/${config.service}`);
    console.log('dry run complete; no Cloud Run revision was created.');
    return;
  }

  if (!skipLocalChecks) {
    run('npm', ['run', 'build']);
    run('npm', ['run', 'lint']);
  }

  const previousService = describeService(config);
  const rollback = rollbackCommand(config, previousService.status?.traffic || []);
  if (rollback) {
    console.log(`rollback command if needed:\n  ${rollback}`);
  }

  run('gcloud', [
    'run',
    'deploy',
    config.service,
    '--source',
    APP_ROOT,
    '--region',
    config.region,
    '--project',
    config.project,
    '--service-account',
    config.serviceAccount,
    '--allow-unauthenticated',
    '--build-env-vars-file',
    envYaml,
    '--env-vars-file',
    envYaml,
    '--set-secrets',
    secretRefs.join(','),
    '--tag',
    config.tag,
    '--no-traffic',
    '--quiet',
  ]);

  const candidateService = describeService(config);
  const revision = candidateService.status?.latestReadyRevisionName;
  if (!revision) {
    throw new Error('Cloud Run did not report a latest ready revision.');
  }
  const taggedTraffic = candidateService.status?.traffic?.find(item => item.revisionName === revision && item.tag === config.tag)
    || candidateService.status?.traffic?.find(item => item.tag === config.tag);
  const candidateUrl = taggedTraffic?.url;
  if (!candidateUrl) {
    throw new Error(`No tagged candidate URL found for tag "${config.tag}".`);
  }

  const revisionDetails = describeRevision(config, revision);
  verifyRevisionEnvWithSecrets(revisionDetails, publicEnv, config, secretRefs);
  console.log(`candidate revision env verified: ${revision}`);

  await smokeCheck(candidateUrl, `candidate ${revision}`);
  console.log(`candidate smoke checks passed: ${candidateUrl}`);

  if (noPromote) {
    console.log(`candidate left at 0% traffic: ${revision}`);
    return;
  }

  run('gcloud', [
    'run',
    'services',
    'update-traffic',
    config.service,
    '--region',
    config.region,
    '--project',
    config.project,
    '--to-revisions',
    `${revision}=100`,
    '--quiet',
  ]);

  const promotedService = describeService(config);
  const promotedTraffic = promotedService.status?.traffic?.find(item => item.revisionName === revision);
  if (promotedTraffic?.percent !== 100) {
    throw new Error(`Revision ${revision} is not serving 100% traffic after promotion.`);
  }

  await smokeCheck(promotedService.status.url, `service ${revision}`);
  console.log(`deployed and promoted: ${revision}`);
  console.log(`service URL: ${promotedService.status.url}`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
