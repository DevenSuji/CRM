import { firebaseAuthHeaders } from '@/lib/utils/authHeaders';

/**
 * Geocode an address string to lat/lng using the local API route.
 * Returns null on failure — caller should handle gracefully.
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address || address === 'Unknown') return null;
  try {
    const authHeaders = await firebaseAuthHeaders();
    const res = await fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ address }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.lat && data.lng) return { lat: data.lat, lng: data.lng };
    return null;
  } catch {
    return null;
  }
}
