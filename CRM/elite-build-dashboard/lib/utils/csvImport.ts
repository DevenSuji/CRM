import { Timestamp } from 'firebase/firestore';
import type { LeadRawData } from '@/lib/types/lead';
import { buildDuplicateKeys, type LeadDuplicateKeys } from '@/lib/utils/leadDuplicates';
import { normalizeLeadSource } from '@/lib/utils/leadSourceHygiene';

export interface CSVRow {
  lead_name?: string; name?: string; full_name?: string;
  phone?: string; mobile?: string;
  email?: string; email_address?: string;
  budget?: string;
  plan_to_buy?: string; timeline?: string;
  profession?: string;
  location?: string;
  note?: string; notes?: string;
  interest?: string;
  source?: string;
  [key: string]: string | undefined;
}

/** Parse a single CSV line. Handles quoted fields and escaped quotes (`""`).
 *  Known limitation: newlines inside quoted fields are NOT supported — the
 *  outer parser splits on `\r?\n` before this runs, so a quoted field with
 *  an embedded newline becomes two broken rows. Flagged in the test suite
 *  as a known gap (see tests/unit/csvImport.test.ts). */
function parseRow(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/** Parse CSV text into rows keyed by normalized header. Header normalization:
 *  lowercased, whitespace collapsed to underscore. Strips UTF-8 BOM. Returns
 *  empty array if fewer than 2 lines (need a header + at least one row). */
export function parseCSV(text: string): CSVRow[] {
  // Strip BOM if present (Excel on Windows loves these).
  const cleaned = text.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    if (values.every(v => !v)) continue; // skip empty rows
    const row: CSVRow = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    rows.push(row);
  }
  return rows;
}

export function getLeadName(row: CSVRow): string {
  return row.lead_name || row.name || row.full_name || 'Unknown';
}

export function getPhone(row: CSVRow): string {
  return row.phone || row.mobile || 'N/A';
}

export function getEmail(row: CSVRow): string {
  return row.email || row.email_address || 'N/A';
}

/** A row is invalid (rejected at import time) only when BOTH name and phone
 *  are missing. Name OR phone alone is enough to create a lead — the email
 *  and other fields get sensible defaults downstream. */
export function isValidRow(row: CSVRow): boolean {
  return !(getLeadName(row) === 'Unknown' && getPhone(row) === 'N/A');
}

export interface NormalizeOptions {
  /** The importer's role — decides the default `source` label. */
  role?: string;
  /** The importer's uid — stamped as `owner_uid` so CPs can read their imports. */
  uid?: string | null;
}

export interface NormalizedLead {
  status: 'New';
  created_at: Timestamp;
  source: string;
  source_normalized: string;
  owner_uid: string | null;
  duplicate_keys: LeadDuplicateKeys;
  raw_data: LeadRawData;
}

/** Convert a parsed CSV row into a lead document. Pure — no Firestore writes.
 *  Call sites should filter with `isValidRow` before calling this. */
export function normalizeLead(row: CSVRow, opts: NormalizeOptions = {}): NormalizedLead {
  const budgetNum = Number(row.budget);
  const rawData: LeadRawData = {
    lead_name: getLeadName(row),
    phone: getPhone(row),
    email: getEmail(row),
    budget: Number.isFinite(budgetNum) ? budgetNum : 0,
    plan_to_buy: row.plan_to_buy || row.timeline || 'Not Specified',
    profession: row.profession || 'Not Specified',
    location: row.location || 'Unknown',
    note: row.note || row.notes || 'Imported from CSV',
    pref_facings: [],
    interest: row.interest || 'General Query',
  };

  const source = row.source || (opts.role === 'channel_partner' ? 'Channel Partner CSV' : 'CSV Import');

  return {
    status: 'New',
    created_at: Timestamp.now(),
    source,
    source_normalized: normalizeLeadSource(source),
    owner_uid: opts.uid || null,
    duplicate_keys: buildDuplicateKeys(rawData),
    raw_data: rawData,
  };
}
