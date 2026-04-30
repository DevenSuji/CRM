import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { Lead } from '@/lib/types/lead';
import {
  buildDuplicateKeys,
  findDuplicateLeads,
  nameSimilarity,
  normalizeEmailForDuplicate,
  normalizePhoneForDuplicate,
} from '@/lib/utils/leadDuplicates';

function lead(id: string, raw: Partial<Lead['raw_data']>): Lead {
  return {
    id,
    status: 'New',
    created_at: Timestamp.fromMillis(1000),
    source: 'Walk-in',
    raw_data: {
      lead_name: raw.lead_name || 'Lead',
      phone: raw.phone || 'N/A',
      email: raw.email || 'N/A',
      budget: 0,
      plan_to_buy: 'Not Specified',
      profession: 'Not Specified',
      location: 'Unknown',
      note: '',
      pref_facings: [],
      interest: 'General Query',
      ...raw,
    },
  };
}

describe('lead duplicate normalization', () => {
  it('normalizes Indian phone variants to the same last 10 digits', () => {
    expect(normalizePhoneForDuplicate('+91 98765 43210')).toBe('9876543210');
    expect(normalizePhoneForDuplicate('09876543210')).toBe('9876543210');
  });

  it('ignores placeholder emails', () => {
    expect(normalizeEmailForDuplicate('N/A')).toBeNull();
    expect(normalizeEmailForDuplicate(' Buyer@Example.COM ')).toBe('buyer@example.com');
  });

  it('builds duplicate keys from phone, whatsapp, email, and name', () => {
    expect(buildDuplicateKeys({
      lead_name: ' Alice Buyer ',
      phone: '+91 98765 43210',
      whatsapp: '9876543210',
      email: 'ALICE@example.com',
    })).toEqual({
      phones: ['9876543210'],
      email: 'alice@example.com',
      name: 'alice buyer',
    });
  });
});

describe('findDuplicateLeads', () => {
  it('finds exact phone duplicates', () => {
    const duplicates = findDuplicateLeads(
      { lead_name: 'Alice', phone: '9876543210' },
      [lead('a', { lead_name: 'Alice Old', phone: '+91 98765 43210' })],
    );

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].strength).toBe('exact');
    expect(duplicates[0].reasons).toContain('phone match');
  });

  it('finds exact email duplicates when phone is missing', () => {
    const duplicates = findDuplicateLeads(
      { lead_name: 'Alice', phone: '', email: 'alice@example.com' },
      [lead('a', { lead_name: 'Alice Old', phone: 'N/A', email: 'ALICE@example.com' })],
    );

    expect(duplicates[0].strength).toBe('exact');
    expect(duplicates[0].reasons).toContain('email match');
  });

  it('flags likely duplicates by similar name and same phone ending', () => {
    const duplicates = findDuplicateLeads(
      { lead_name: 'Alicia Buyer', phone: '1111113210' },
      [lead('a', { lead_name: 'Alice Buyer', phone: '9999993210' })],
    );

    expect(duplicates[0].strength).toBe('likely');
    expect(duplicates[0].reasons).toContain('similar name and phone ending');
  });

  it('can exclude the lead being edited', () => {
    const duplicates = findDuplicateLeads(
      { lead_name: 'Alice', phone: '9876543210' },
      [lead('a', { lead_name: 'Alice', phone: '9876543210' })],
      { excludeLeadId: 'a' },
    );

    expect(duplicates).toEqual([]);
  });

  it('keeps unrelated similar names separate when phone does not overlap', () => {
    expect(nameSimilarity('Alice Buyer', 'Alice Buyer')).toBe(1);
    expect(findDuplicateLeads(
      { lead_name: 'Alice Buyer', phone: '1111111111' },
      [lead('a', { lead_name: 'Alice Buyer', phone: '2222222222' })],
    )).toEqual([]);
  });
});
