import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { Lead } from '@/lib/types/lead';
import { buildMergedLeadUpdate } from '@/lib/utils/leadMerge';

function lead(id: string, overrides: Partial<Lead> = {}): Lead {
  return {
    id,
    status: 'New',
    created_at: Timestamp.fromMillis(1000),
    source: 'Walk-in',
    raw_data: {
      lead_name: `Lead ${id}`,
      phone: 'N/A',
      email: 'N/A',
      budget: 0,
      plan_to_buy: 'Not Specified',
      profession: 'Not Specified',
      location: 'Unknown',
      note: '',
      pref_facings: [],
      interest: 'General Query',
    },
    ...overrides,
  };
}

describe('buildMergedLeadUpdate', () => {
  it('keeps primary contact fields and fills missing fields from duplicate', () => {
    const result = buildMergedLeadUpdate(
      lead('primary', {
        raw_data: {
          lead_name: 'Primary Buyer',
          phone: '9876543210',
          email: 'N/A',
          budget: 0,
          plan_to_buy: 'Not Specified',
          profession: 'Doctor',
          location: 'Unknown',
          note: '',
          pref_facings: [],
          interest: 'Villa',
        },
      }),
      lead('dup', {
        raw_data: {
          lead_name: 'Duplicate Buyer',
          phone: '9999999999',
          email: 'buyer@example.com',
          budget: 5000000,
          plan_to_buy: 'Immediately',
          profession: 'Engineer',
          location: 'Mysore',
          note: 'Imported duplicate',
          pref_facings: ['East'],
          interest: 'Apartment',
        },
      }),
      'Admin',
      new Date('2026-04-26T00:00:00.000Z'),
    );

    expect(result.blockedReason).toBeUndefined();
    expect(result.update.raw_data.phone).toBe('9876543210');
    expect(result.update.raw_data.email).toBe('buyer@example.com');
    expect(result.update.raw_data.budget).toBe(5000000);
    expect(result.update.raw_data.location).toBe('Mysore');
    expect(result.update.duplicate_keys?.email).toBe('buyer@example.com');
    expect(result.update.merged_from).toEqual(['dup']);
  });

  it('deduplicates timeline arrays and adds a merge activity entry', () => {
    const result = buildMergedLeadUpdate(
      lead('primary', {
        activity_log: [{ id: 'a1', type: 'note', text: 'Primary note', author: 'A', created_at: '2026-04-25T00:00:00.000Z' }],
        site_visits: [{ id: 'v1', scheduled_at: '2026-04-27T00:00:00.000Z', location: 'A', notes: '', created_at: '2026-04-25T00:00:00.000Z', reminder_on_agreement: false, reminder_day_before: false, reminder_morning_of: false, status: 'scheduled' }],
      }),
      lead('dup', {
        activity_log: [{ id: 'a1', type: 'note', text: 'Duplicate same note', author: 'B', created_at: '2026-04-25T00:00:00.000Z' }],
        site_visits: [{ id: 'v2', scheduled_at: '2026-04-28T00:00:00.000Z', location: 'B', notes: '', created_at: '2026-04-25T00:00:00.000Z', reminder_on_agreement: false, reminder_day_before: false, reminder_morning_of: false, status: 'scheduled' }],
      }),
      'Admin',
      new Date('2026-04-26T00:00:00.000Z'),
    );

    expect(result.update.activity_log?.map(entry => entry.id)).toEqual(['a1', 'merge_1777161600000']);
    expect(result.update.site_visits?.map(visit => visit.id)).toEqual(['v1', 'v2']);
  });

  it('transfers a duplicate booking when the primary has no booking', () => {
    const result = buildMergedLeadUpdate(
      lead('primary'),
      lead('dup', {
        booked_unit: {
          projectId: 'p1',
          projectName: 'Project',
          unitId: 'u1',
          unitLabel: '101',
          booked_at: '2026-04-26T00:00:00.000Z',
          booked_by: 'Admin',
        },
      }),
      'Admin',
    );

    expect(result.update.booked_unit?.unitId).toBe('u1');
    expect(result.transferredBookedUnitId).toBe('u1');
  });

  it('preserves structured buyer objections from both duplicate records', () => {
    const result = buildMergedLeadUpdate(
      lead('primary', { objections: ['price', 'legal'] }),
      lead('dup', { objections: ['price', 'family_decision'] }),
      'Admin',
    );

    expect(result.update.objections).toEqual(['price', 'legal', 'family_decision']);
  });

  it('blocks merging two different booked units', () => {
    const result = buildMergedLeadUpdate(
      lead('primary', {
        booked_unit: {
          projectId: 'p1',
          projectName: 'Project',
          unitId: 'u1',
          unitLabel: '101',
          booked_at: '2026-04-26T00:00:00.000Z',
          booked_by: 'Admin',
        },
      }),
      lead('dup', {
        booked_unit: {
          projectId: 'p2',
          projectName: 'Other',
          unitId: 'u2',
          unitLabel: '202',
          booked_at: '2026-04-26T00:00:00.000Z',
          booked_by: 'Admin',
        },
      }),
      'Admin',
    );

    expect(result.blockedReason).toMatch(/different booked units/i);
  });
});
