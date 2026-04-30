import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function clientIp(req: NextRequest) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip') || 'unknown';
}

export function enforceRateLimit(
  req: NextRequest,
  key: string,
  options: { limit: number; windowMs: number; actorUid?: string },
): NextResponse | null {
  const now = Date.now();
  const actor = options.actorUid || clientIp(req);
  const bucketKey = `${key}:${actor}`;
  const existing = buckets.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + options.windowMs });
    return null;
  }

  if (existing.count >= options.limit) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return NextResponse.json(
      { error: 'Too many requests. Try again shortly.' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      },
    );
  }

  existing.count += 1;
  return null;
}
