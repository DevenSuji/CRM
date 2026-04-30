const GOOGLE_TLD = '(?:com|[a-z]{2}|co\\.[a-z]{2})';
const GOOGLE_MAPS_HOST_RE = new RegExp(`^(?:maps\\.)?google\\.${GOOGLE_TLD}$`, 'i');
const GOOGLE_WEB_HOST_RE = new RegExp(`^(?:www\\.)?google\\.${GOOGLE_TLD}$`, 'i');

export function isSupportedGoogleMapsUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();

  if (host === 'maps.app.goo.gl') return true;
  if (host === 'goo.gl') return path === '/maps' || path.startsWith('/maps/');
  if (GOOGLE_MAPS_HOST_RE.test(host)) return true;
  if (GOOGLE_WEB_HOST_RE.test(host)) return path === '/maps' || path.startsWith('/maps/');
  return false;
}

export function extractGoogleMapsCoordinates(value: string): { lat: number; lng: number } | null {
  const atMatch = value.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
  }

  const dMatch = value.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (dMatch) {
    return { lat: parseFloat(dMatch[1]), lng: parseFloat(dMatch[2]) };
  }

  const qMatch = value.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) {
    return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
  }

  return null;
}

export function extractGoogleMapsPlaceName(value: string): string | null {
  const placeMatch = value.match(/\/place\/([^/@]+)/);
  if (placeMatch) {
    return decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
  }

  try {
    const parsed = new URL(value);
    const query = parsed.searchParams.get('query') || parsed.searchParams.get('q');
    if (query && !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(query.trim())) {
      return query.trim();
    }
  } catch {
    // Ignore malformed expanded URLs.
  }
  return null;
}
