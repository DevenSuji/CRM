import { NextRequest, NextResponse } from 'next/server';

/**
 * Resolves a Google Maps short URL (maps.app.goo.gl/...) to an address.
 *
 * 1. Follows redirects to get the full URL with lat/lng
 * 2. Extracts coordinates from the expanded URL
 * 3. Uses Google Geocoding API to reverse-geocode to an address
 */
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    }

    // Step 1: Follow redirects to get the full Google Maps URL
    const expanded = await expandUrl(url);

    // Step 2: Extract coordinates from the expanded URL
    const coords = extractCoordinates(expanded);
    if (!coords) {
      // Try extracting place name from the URL as fallback
      const placeName = extractPlaceName(expanded);
      if (placeName) {
        return NextResponse.json({ address: placeName });
      }
      return NextResponse.json({ error: 'Could not extract location from URL' }, { status: 400 });
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
    console.error('resolve-map-url error:', err);
    return NextResponse.json({ error: 'Failed to resolve URL' }, { status: 500 });
  }
}

async function expandUrl(url: string): Promise<string> {
  try {
    // Follow redirects manually to capture the final URL
    const res = await fetch(url, { redirect: 'follow' });
    return res.url;
  } catch {
    return url;
  }
}

function extractCoordinates(url: string): { lat: number; lng: number } | null {
  // Pattern: @lat,lng,zoom or !3d{lat}!4d{lng}
  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
  }

  const dMatch = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (dMatch) {
    return { lat: parseFloat(dMatch[1]), lng: parseFloat(dMatch[2]) };
  }

  // query param: q=lat,lng
  const qMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) {
    return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
  }

  return null;
}

function extractPlaceName(url: string): string | null {
  // Pattern: /place/Place+Name/
  const placeMatch = url.match(/\/place\/([^/@]+)/);
  if (placeMatch) {
    return decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
  }
  return null;
}
