import { NextRequest, NextResponse } from 'next/server';

/**
 * Geocodes an address string to lat/lng coordinates using Google Geocoding API.
 * Used for proximity-based property matching.
 */
export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();
    if (!address || typeof address !== 'string') {
      return NextResponse.json({ error: 'Missing address' }, { status: 400 });
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 500 });
    }

    const encoded = encodeURIComponent(address);
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${apiKey}&region=in`
    );
    const geoData = await geoRes.json();

    if (geoData.status === 'OK' && geoData.results?.length > 0) {
      const { lat, lng } = geoData.results[0].geometry.location;
      return NextResponse.json({
        lat,
        lng,
        formatted_address: geoData.results[0].formatted_address,
      });
    }

    return NextResponse.json({ error: `Geocoding failed: ${geoData.status}` }, { status: 400 });
  } catch (err) {
    console.error('Geocode error:', err);
    return NextResponse.json({ error: 'Failed to geocode address' }, { status: 500 });
  }
}
