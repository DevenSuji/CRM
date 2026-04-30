import { describe, expect, it } from 'vitest';
import { getLeadSourceNormalizationPatch, leadSourceLabel, normalizeLeadSource, sourceMatches } from '@/lib/utils/leadSourceHygiene';

describe('normalizeLeadSource', () => {
  it('normalizes common paid social aliases to Meta Ads', () => {
    expect(normalizeLeadSource('Meta')).toBe('Meta Ads');
    expect(normalizeLeadSource('FB Lead')).toBe('Meta Ads');
    expect(normalizeLeadSource('Instagram Ads')).toBe('Meta Ads');
  });

  it('normalizes common Google, website, CP, and walk-in aliases', () => {
    expect(normalizeLeadSource('Google Adwords')).toBe('Google Ads');
    expect(normalizeLeadSource('Landing Page')).toBe('Website');
    expect(normalizeLeadSource('CP Referral')).toBe('Channel Partner');
    expect(normalizeLeadSource('site-walk-in')).toBe('Walk-in');
  });

  it('preserves unknown source labels after trimming whitespace', () => {
    expect(normalizeLeadSource('  Magicbricks  ')).toBe('Magicbricks');
    expect(normalizeLeadSource('')).toBe('Unknown');
  });
});

describe('leadSourceLabel', () => {
  it('prefers the durable normalized source field when present', () => {
    expect(leadSourceLabel({ source: 'FB Lead', source_normalized: 'Meta Ads' })).toBe('Meta Ads');
  });

  it('falls back to normalizing the original source', () => {
    expect(leadSourceLabel({ source: 'Facebook', source_normalized: undefined })).toBe('Meta Ads');
  });
});

describe('sourceMatches', () => {
  it('matches source aliases against canonical team source names', () => {
    expect(sourceMatches('FB Lead', ['Meta Ads'])).toBe(true);
    expect(sourceMatches('Google Adwords', ['Google Ads'])).toBe(true);
    expect(sourceMatches('Magicbricks', ['Meta Ads'])).toBe(false);
  });
});

describe('getLeadSourceNormalizationPatch', () => {
  it('returns the safe source_normalized update when a lead needs cleanup', () => {
    expect(getLeadSourceNormalizationPatch({ source: 'FB Lead', source_normalized: undefined })).toEqual({
      source: 'FB Lead',
      source_normalized: 'Meta Ads',
    });
    expect(getLeadSourceNormalizationPatch({ source: 'Facebook', source_normalized: 'Google Ads' })).toEqual({
      source: 'Facebook',
      source_normalized: 'Meta Ads',
    });
  });

  it('skips already-clean and unknown source values', () => {
    expect(getLeadSourceNormalizationPatch({ source: 'Meta Ads', source_normalized: 'Meta Ads' })).toBeNull();
    expect(getLeadSourceNormalizationPatch({ source: '', source_normalized: undefined })).toBeNull();
  });
});
