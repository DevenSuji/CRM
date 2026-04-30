import 'server-only';

export type JsonRecord = Record<string, unknown>;

export class ApiValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ApiValidationError';
    this.status = status;
  }
}

export async function readJsonObject(req: Request, maxBytes = 16_384): Promise<JsonRecord> {
  const raw = await req.text();
  if (raw.length > maxBytes) {
    throw new ApiValidationError(`Payload too large (max ${maxBytes} bytes).`, 413);
  }
  if (!raw.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiValidationError('Invalid JSON payload.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiValidationError('JSON object payload required.');
  }
  return parsed as JsonRecord;
}

export function requiredString(payload: JsonRecord, key: string, options: { max?: number; min?: number; label?: string } = {}) {
  const value = payload[key];
  const label = options.label || key;
  if (typeof value !== 'string') {
    throw new ApiValidationError(`${label} is required.`);
  }
  const trimmed = value.trim();
  const min = options.min ?? 1;
  if (trimmed.length < min) {
    throw new ApiValidationError(`${label} is required.`);
  }
  if (options.max && trimmed.length > options.max) {
    throw new ApiValidationError(`${label} too long (max ${options.max} chars).`);
  }
  return trimmed;
}

export function optionalString(payload: JsonRecord, key: string, options: { max?: number } = {}) {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new ApiValidationError(`${key} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (options.max && trimmed.length > options.max) {
    throw new ApiValidationError(`${key} too long (max ${options.max} chars).`);
  }
  return trimmed;
}

export function optionalStringArray(payload: JsonRecord, key: string, options: { maxItems?: number; maxItemLength?: number } = {}) {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new ApiValidationError(`${key} must be an array.`);
  }
  const maxItems = options.maxItems ?? 20;
  const maxItemLength = options.maxItemLength ?? 500;
  if (value.length > maxItems) {
    throw new ApiValidationError(`${key} too large (max ${maxItems} items).`);
  }
  return value.map((item, index) => {
    if (typeof item !== 'string') {
      throw new ApiValidationError(`${key}[${index}] must be a string.`);
    }
    const trimmed = item.trim();
    if (trimmed.length > maxItemLength) {
      throw new ApiValidationError(`${key}[${index}] too long (max ${maxItemLength} chars).`);
    }
    return trimmed;
  }).filter(Boolean);
}

export function requiredEnum<T extends string>(payload: JsonRecord, key: string, allowed: readonly T[]): T {
  const value = requiredString(payload, key);
  if (!allowed.includes(value as T)) {
    throw new ApiValidationError(`${key} must be one of: ${allowed.join(', ')}.`);
  }
  return value as T;
}
