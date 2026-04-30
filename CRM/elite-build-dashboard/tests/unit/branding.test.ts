import { describe, expect, it } from 'vitest';
import { DEFAULT_BRANDING, normalizeBrandColor, normalizeBranding } from '@/lib/utils/branding';

describe('branding utilities', () => {
  it('normalizes saved branding into a complete public payload', () => {
    const branding = normalizeBranding({
      companyName: '  Elitebuild Infra Tech  ',
      tagline: '  Honesty In Every Square Feet  ',
      logo: 'https://example.com/logo.png',
      banner: 'https://example.com/banner.png',
      primaryColor: '#282e80',
      phone: ' +91 9916253336 ',
      email: ' info@elitebuild.in ',
      website: ' https://elitebuild.in/ ',
    });

    expect(branding).toEqual({
      companyName: 'Elitebuild Infra Tech',
      tagline: 'Honesty In Every Square Feet',
      logo: 'https://example.com/logo.png',
      banner: 'https://example.com/banner.png',
      primaryColor: '#282E80',
      phone: '+91 9916253336',
      email: 'info@elitebuild.in',
      website: 'https://elitebuild.in/',
    });
  });

  it('falls back for invalid colors and unsafe asset URLs', () => {
    const branding = normalizeBranding({
      companyName: '',
      tagline: '',
      logo: 'javascript:alert(1)',
      banner: '/local-file.png',
      primaryColor: 'blue',
    });

    expect(branding.companyName).toBe(DEFAULT_BRANDING.companyName);
    expect(branding.tagline).toBe(DEFAULT_BRANDING.tagline);
    expect(branding.logo).toBeNull();
    expect(branding.banner).toBeNull();
    expect(branding.primaryColor).toBe(DEFAULT_BRANDING.primaryColor);
  });

  it('accepts hex colors case-insensitively', () => {
    expect(normalizeBrandColor('#abcdef')).toBe('#ABCDEF');
    expect(normalizeBrandColor('#ABCDEF')).toBe('#ABCDEF');
  });
});
