import { describe, it, expect } from 'vitest';
import {
  parseCSV,
  normalizeLead,
  isValidRow,
  getLeadName,
  getPhone,
  getEmail,
  type CSVRow,
} from '@/lib/utils/csvImport';

describe('parseCSV — happy path', () => {
  it('parses a minimal well-formed CSV', () => {
    const csv = 'lead_name,phone,email\nAlice,555-1234,alice@example.com';
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].lead_name).toBe('Alice');
    expect(rows[0].phone).toBe('555-1234');
    expect(rows[0].email).toBe('alice@example.com');
  });

  it('parses multiple rows', () => {
    const csv = 'lead_name,phone\nAlice,111\nBob,222\nCarol,333';
    const rows = parseCSV(csv);
    expect(rows.map(r => r.lead_name)).toEqual(['Alice', 'Bob', 'Carol']);
  });
});

describe('parseCSV — header normalization', () => {
  it('lowercases headers', () => {
    const rows = parseCSV('LEAD_NAME,PHONE\nAlice,111');
    expect(rows[0].lead_name).toBe('Alice');
    expect(rows[0].phone).toBe('111');
  });

  it('collapses whitespace in headers to underscores', () => {
    const rows = parseCSV('Lead Name,Plan To Buy\nAlice,3 months');
    expect(rows[0].lead_name).toBe('Alice');
    expect(rows[0].plan_to_buy).toBe('3 months');
  });
});

describe('parseCSV — line endings', () => {
  it('handles CRLF', () => {
    const rows = parseCSV('lead_name,phone\r\nAlice,111\r\nBob,222');
    expect(rows).toHaveLength(2);
    expect(rows[1].lead_name).toBe('Bob');
  });

  it('handles mixed LF/CRLF', () => {
    const rows = parseCSV('lead_name,phone\nAlice,111\r\nBob,222\nCarol,333');
    expect(rows).toHaveLength(3);
  });

  it('tolerates trailing newline', () => {
    const rows = parseCSV('lead_name,phone\nAlice,111\n');
    expect(rows).toHaveLength(1);
  });
});

describe('parseCSV — quoting', () => {
  it('preserves commas inside quoted fields', () => {
    const csv = 'lead_name,note\nAlice,"wants 2,3 BHK"';
    const rows = parseCSV(csv);
    expect(rows[0].note).toBe('wants 2,3 BHK');
  });

  it('unescapes doubled quotes inside quoted fields', () => {
    const csv = 'lead_name,note\nAlice,"she said ""yes"""';
    const rows = parseCSV(csv);
    expect(rows[0].note).toBe('she said "yes"');
  });

  it('handles empty quoted field', () => {
    const csv = 'lead_name,note,phone\nAlice,"",111';
    const rows = parseCSV(csv);
    expect(rows[0].note).toBe('');
    expect(rows[0].phone).toBe('111');
  });
});

describe('parseCSV — skipped content', () => {
  it('skips blank rows', () => {
    const csv = 'lead_name,phone\nAlice,111\n\nBob,222\n';
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
  });

  it('skips rows where every field is empty', () => {
    const csv = 'lead_name,phone\nAlice,111\n,\nBob,222';
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
  });

  it('returns [] for header-only input', () => {
    const rows = parseCSV('lead_name,phone');
    expect(rows).toEqual([]);
  });

  it('returns [] for empty input', () => {
    expect(parseCSV('')).toEqual([]);
  });

  it('returns [] for whitespace-only input', () => {
    expect(parseCSV('   \n\n  ')).toEqual([]);
  });
});

describe('parseCSV — BOM handling', () => {
  it('strips UTF-8 BOM before parsing header', () => {
    // Excel on Windows prepends \uFEFF. Before this fix, the first header
    // would be "\uFEFFlead_name" and no row would pick up the phone column.
    const csv = '\uFEFFlead_name,phone\nAlice,111';
    const rows = parseCSV(csv);
    expect(rows[0].lead_name).toBe('Alice');
    expect(rows[0].phone).toBe('111');
  });
});

describe('parseCSV — known gap: newlines inside quoted fields', () => {
  // The parser splits on \r?\n BEFORE calling parseRow, so a field with an
  // embedded newline splits into two broken rows. This test PINS the bug so
  // anyone fixing the parser sees their fix reflected here instead of
  // accidentally regressing other behavior. Tracked as Phase 4 follow-up.
  it('mangles quoted fields containing newlines (known gap)', () => {
    const csv = 'lead_name,note\nAlice,"line1\nline2"';
    const rows = parseCSV(csv);
    // Current behavior: the embedded newline splits into two rows. Row 1 has
    // an unterminated quote in `note`, row 2 is treated as a new data row
    // with just `line2"` as its first column.
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // Specifically: row 0's note should contain 'line1' but NOT 'line2'.
    expect(rows[0].note).toContain('line1');
    expect(rows[0].note).not.toContain('line2');
  });
});

describe('getLeadName / getPhone / getEmail — fallback chain', () => {
  it('getLeadName prefers lead_name over name over full_name', () => {
    expect(getLeadName({ lead_name: 'A', name: 'B', full_name: 'C' })).toBe('A');
    expect(getLeadName({ name: 'B', full_name: 'C' })).toBe('B');
    expect(getLeadName({ full_name: 'C' })).toBe('C');
    expect(getLeadName({})).toBe('Unknown');
  });

  it('getPhone prefers phone over mobile', () => {
    expect(getPhone({ phone: '1', mobile: '2' })).toBe('1');
    expect(getPhone({ mobile: '2' })).toBe('2');
    expect(getPhone({})).toBe('N/A');
  });

  it('getEmail prefers email over email_address', () => {
    expect(getEmail({ email: 'a@b', email_address: 'c@d' })).toBe('a@b');
    expect(getEmail({ email_address: 'c@d' })).toBe('c@d');
    expect(getEmail({})).toBe('N/A');
  });

  it('treats empty string as missing (falsy fallback)', () => {
    // JS || operator: empty string is falsy, so fallback fires. This is
    // what we want — a header present with no value shouldn't pin "" as
    // the lead's name.
    expect(getLeadName({ lead_name: '', name: 'Fallback' })).toBe('Fallback');
    expect(getPhone({ phone: '', mobile: '999' })).toBe('999');
  });
});

describe('isValidRow', () => {
  it('rejects row with neither name nor phone', () => {
    expect(isValidRow({})).toBe(false);
    expect(isValidRow({ email: 'only@email.com' })).toBe(false);
  });

  it('accepts row with only a name', () => {
    expect(isValidRow({ lead_name: 'Alice' })).toBe(true);
  });

  it('accepts row with only a phone', () => {
    expect(isValidRow({ phone: '555' })).toBe(true);
  });

  it('accepts row with both', () => {
    expect(isValidRow({ lead_name: 'Alice', phone: '555' })).toBe(true);
  });
});

describe('normalizeLead — source defaults', () => {
  it('defaults source to "CSV Import" for regular roles', () => {
    const lead = normalizeLead({ lead_name: 'A' }, { role: 'sales_exec' });
    expect(lead.source).toBe('CSV Import');
  });

  it('defaults source to "Channel Partner CSV" for channel_partner', () => {
    const lead = normalizeLead({ lead_name: 'A' }, { role: 'channel_partner' });
    expect(lead.source).toBe('Channel Partner CSV');
  });

  it('uses explicit source when present in row', () => {
    const lead = normalizeLead(
      { lead_name: 'A', source: 'FB Lead' },
      { role: 'channel_partner' },
    );
    expect(lead.source).toBe('FB Lead');
    expect(lead.source_normalized).toBe('Meta Ads');
  });

  it('defaults to "CSV Import" when no role given', () => {
    const lead = normalizeLead({ lead_name: 'A' });
    expect(lead.source).toBe('CSV Import');
  });
});

describe('normalizeLead — owner_uid stamping', () => {
  it('stamps owner_uid when provided', () => {
    const lead = normalizeLead({ lead_name: 'A' }, { uid: 'user-123' });
    expect(lead.owner_uid).toBe('user-123');
  });

  it('stamps null when uid is missing', () => {
    // Rules rely on owner_uid being non-null for CP queries, but the parser
    // doesn't enforce that — the calling context does. Pin null-passthrough.
    const lead = normalizeLead({ lead_name: 'A' });
    expect(lead.owner_uid).toBeNull();
  });

  it('stamps null when uid is explicitly null', () => {
    const lead = normalizeLead({ lead_name: 'A' }, { uid: null });
    expect(lead.owner_uid).toBeNull();
  });
});

describe('normalizeLead — duplicate keys', () => {
  it('stores normalized duplicate keys for imported leads', () => {
    const lead = normalizeLead({
      lead_name: 'Alice Buyer',
      phone: '+91 98765 43210',
      email: 'ALICE@example.com',
    });

    expect(lead.duplicate_keys).toEqual({
      phones: ['9876543210'],
      email: 'alice@example.com',
      name: 'alice buyer',
    });
  });
});

describe('normalizeLead — budget coercion', () => {
  it('parses numeric budget', () => {
    expect(normalizeLead({ lead_name: 'A', budget: '5000000' }).raw_data.budget).toBe(5000000);
  });

  it('parses decimal budget', () => {
    expect(normalizeLead({ lead_name: 'A', budget: '1.5' }).raw_data.budget).toBe(1.5);
  });

  it('coerces blank budget to 0', () => {
    expect(normalizeLead({ lead_name: 'A', budget: '' }).raw_data.budget).toBe(0);
  });

  it('coerces missing budget to 0', () => {
    expect(normalizeLead({ lead_name: 'A' }).raw_data.budget).toBe(0);
  });

  it('coerces non-numeric budget to 0', () => {
    // `Number("abc")` → NaN; we guard with Number.isFinite so NaN doesn't leak
    // into Firestore (which would reject it or behave oddly in aggregations).
    expect(normalizeLead({ lead_name: 'A', budget: 'abc' }).raw_data.budget).toBe(0);
  });

  it('preserves negative budget (caller is responsible for validation)', () => {
    // Negative budget is silly but the parser doesn't reject it — keeps the
    // transform a pure carrier. UI/rules should gate if needed.
    expect(normalizeLead({ lead_name: 'A', budget: '-100' }).raw_data.budget).toBe(-100);
  });
});

describe('normalizeLead — field fallback chains', () => {
  it('plan_to_buy falls back to timeline', () => {
    expect(normalizeLead({ lead_name: 'A', timeline: '6m' }).raw_data.plan_to_buy).toBe('6m');
  });

  it('plan_to_buy prefers plan_to_buy over timeline', () => {
    expect(normalizeLead({ lead_name: 'A', plan_to_buy: '3m', timeline: '6m' }).raw_data.plan_to_buy).toBe('3m');
  });

  it('note falls back to notes', () => {
    expect(normalizeLead({ lead_name: 'A', notes: 'hello' }).raw_data.note).toBe('hello');
  });

  it('note prefers note over notes', () => {
    expect(normalizeLead({ lead_name: 'A', note: 'short', notes: 'long' }).raw_data.note).toBe('short');
  });

  it('defaults populate when no data provided', () => {
    const lead = normalizeLead({ lead_name: 'A' });
    expect(lead.raw_data.plan_to_buy).toBe('Not Specified');
    expect(lead.raw_data.profession).toBe('Not Specified');
    expect(lead.raw_data.location).toBe('Unknown');
    expect(lead.raw_data.note).toBe('Imported from CSV');
    expect(lead.raw_data.interest).toBe('General Query');
    expect(lead.raw_data.email).toBe('N/A');
    expect(lead.raw_data.phone).toBe('N/A');
    expect(lead.raw_data.pref_facings).toEqual([]);
  });
});

describe('normalizeLead — status + timestamp', () => {
  it('always sets status to New', () => {
    const lead = normalizeLead({ lead_name: 'A' });
    expect(lead.status).toBe('New');
  });

  it('sets created_at to a Firestore Timestamp', () => {
    const lead = normalizeLead({ lead_name: 'A' });
    // Duck-type: Timestamp has toDate() + seconds fields.
    expect(lead.created_at).toBeDefined();
    expect(typeof lead.created_at.toDate).toBe('function');
  });
});

describe('end-to-end: parseCSV + normalizeLead', () => {
  it('parses a realistic channel-partner CSV and produces valid leads', () => {
    const csv = [
      'Lead Name,Phone,Email,Budget,Timeline,Location,Note',
      'Alice Johnson,9988776655,alice@example.com,5000000,3 months,Bangalore,"2,3 BHK preferred"',
      'Bob Kumar,9988776654,bob@example.com,,6 months,Mysore,',
      ',,,,,,', // empty row, should be skipped
    ].join('\n');

    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);

    const valid = rows.filter(isValidRow);
    expect(valid).toHaveLength(2);

    const leads = valid.map((r: CSVRow) => normalizeLead(r, { role: 'channel_partner', uid: 'cp-1' }));
    expect(leads).toHaveLength(2);
    expect(leads[0].raw_data.lead_name).toBe('Alice Johnson');
    expect(leads[0].raw_data.note).toBe('2,3 BHK preferred');
    expect(leads[0].source).toBe('Channel Partner CSV');
    expect(leads[0].owner_uid).toBe('cp-1');
    expect(leads[0].raw_data.budget).toBe(5000000);
    expect(leads[1].raw_data.budget).toBe(0);
  });

  it('drops rows missing both name and phone during import', () => {
    const csv = [
      'lead_name,phone,email',
      'Alice,111,alice@x.com',
      ',,only-email@x.com', // invalid
      'Bob,,',
    ].join('\n');

    const rows = parseCSV(csv);
    const valid = rows.filter(isValidRow);
    expect(valid.map(r => r.lead_name || r.phone)).toEqual(['Alice', 'Bob']);
  });
});
