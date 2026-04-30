import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { requireActiveCrmUser } from '@/lib/api/requireActiveCrmUser';
import { ApiValidationError, readJsonObject, requiredString } from '@/lib/api/validation';
import {
  extractGoogleMapsCoordinates,
  extractGoogleMapsPlaceName,
  isSupportedGoogleMapsUrl,
} from '@/lib/utils/googleMapsUrl';

/**
 * Resolves a Google Maps short URL (maps.app.goo.gl/...) to an address.
 *
 * 1. Follows redirects to get the full URL with lat/lng
 * 2. Extracts coordinates from the expanded URL
 * 3. Uses Google Geocoding API to reverse-geocode to an address
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireActiveCrmUser(req);
    if (!auth.ok) return auth.response;
    const limited = enforceRateLimit(req, 'resolve-map-url', { actorUid: auth.uid, limit: 30, windowMs: 60_000 });
    if (limited) return limited;

    const payload = await readJsonObject(req);
    const url = requiredString(payload, 'url', { max: 1000 });
    if (!isSupportedGoogleMapsUrl(url)) {
      return NextResponse.json({ error: 'Only Google Maps URLs are supported.' }, { status: 400 });
    }

    // Step 1: Follow redirects to get the full Google Maps URL
    const expanded = await expandUrl(url);

    // Step 2: Extract coordinates from the expanded URL
    const coords = extractGoogleMapsCoordinates(expanded);
    if (!coords) {
      // Try extracting place name from the URL as fallback
      const placeName = extractGoogleMapsPlaceName(expanded);
      if (placeName) {
        return NextResponse.json({ address: await geocodeTextFallback(placeName) });
      }
      return NextResponse.json({ address: url });
    }

    // Step 3: Reverse geocode
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      // Return coords as fallback
      return NextResponse.json({ address: `${coords.lat}, ${coords.lng}` });
    }

    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.lat},${coords.lng}&key=${apiKey}`
    );
    const geoData = await geoRes.json();

    if (geoData.status === 'OK' && geoData.results?.length > 0) {
      return NextResponse.json({ address: geoData.results[0].formatted_address });
    }

    // Fallback to coordinates
    return NextResponse.json({ address: `${coords.lat}, ${coords.lng}` });
  } catch (err) {
    if (err instanceof ApiValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('resolve-map-url error:', err);
    return NextResponse.json({ error: 'Failed to resolve URL' }, { status: 500 });
  }
}

async function geocodeTextFallback(text: string): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return text;

  try {
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(text)}&key=${apiKey}&region=in`
    );
    const geoData = await geoRes.json();
    if (geoData.status === 'OK' && geoData.results?.length > 0) {
      return geoData.results[0].formatted_address;
    }
  } catch {
    // Keep the extracted text as a safe fallback.
  }
  return text;
}

async function expandUrl(url: string): Promise<string> {
  let current = url;
  for (let i = 0; i < 5; i += 1) {
    try {
      const res = await fetch(current, { redirect: 'manual' });
      const location = res.headers.get('location');
      if (!location) return res.url || current;
      const next = new URL(location, current).toString();
      if (!isSupportedGoogleMapsUrl(next)) return current;
      current = next;
    } catch {
      return current;
    }
  }
  return current;
}
