import { describe, expect, it } from 'vitest';
import {
  extractGoogleMapsCoordinates,
  extractGoogleMapsPlaceName,
  isSupportedGoogleMapsUrl,
} from '@/lib/utils/googleMapsUrl';

describe('isSupportedGoogleMapsUrl', () => {
  it.each([
    'https://maps.app.goo.gl/abc123',
    'https://goo.gl/maps/abc123',
    'https://maps.google.com/?q=12.34,56.78',
    'https://maps.google.co.in/maps?q=Mysuru',
    'https://www.google.com/maps/place/Mysuru',
    'https://google.co.in/maps/place/Mysuru',
  ])('allows real Google Maps URL %s', (url) => {
    expect(isSupportedGoogleMapsUrl(url)).toBe(true);
  });

  it.each([
    'http://maps.google.com/?q=12.34,56.78',
    'https://maps.google.evil.com/?q=12.34,56.78',
    'https://www.google.evil.com/maps/place/Mysuru',
    'https://google.com.evil.test/maps/place/Mysuru',
    'https://example.com/maps/place/Mysuru',
    'not-a-url',
  ])('rejects unsupported or spoofed URL %s', (url) => {
    expect(isSupportedGoogleMapsUrl(url)).toBe(false);
  });
});

describe('Google Maps URL extraction helpers', () => {
  it('extracts coordinates from common Google Maps URL forms', () => {
    expect(extractGoogleMapsCoordinates('https://www.google.com/maps/@12.3456,76.6543,15z')).toEqual({
      lat: 12.3456,
      lng: 76.6543,
    });
    expect(extractGoogleMapsCoordinates('https://www.google.com/maps/place/x/!3d12.3456!4d76.6543')).toEqual({
      lat: 12.3456,
      lng: 76.6543,
    });
    expect(extractGoogleMapsCoordinates('https://maps.google.com/?q=12.3456,76.6543')).toEqual({
      lat: 12.3456,
      lng: 76.6543,
    });
  });

  it('extracts a place name fallback without treating coordinates as text', () => {
    expect(extractGoogleMapsPlaceName('https://www.google.com/maps/place/Vijayanagar+4th+Stage/')).toBe('Vijayanagar 4th Stage');
    expect(extractGoogleMapsPlaceName('https://maps.google.com/?q=Gokulam')).toBe('Gokulam');
    expect(extractGoogleMapsPlaceName('https://maps.google.com/?q=12.3456,76.6543')).toBeNull();
  });
});
