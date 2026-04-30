import type { Lead, LeadRawData } from '@/lib/types/lead';

export type DuplicateStrength = 'exact' | 'likely';

export interface LeadDuplicateKeys {
  phones: string[];
  email: string | null;
  name: string;
}

export interface DuplicateCandidate {
  lead: Lead;
  strength: DuplicateStrength;
  reasons: string[];
}

type DuplicateInput = Partial<LeadRawData> & {
  whatsapp?: string;
  whatsapp_number?: string;
};

const EMPTY_VALUES = new Set(['', 'n/a', 'na', 'none', 'null', '-']);

export function normalizePhoneForDuplicate(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 6) return null;
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function normalizeEmailForDuplicate(value?: string | null): string | null {
  const normalized = (value || '').trim().toLowerCase();
  if (EMPTY_VALUES.has(normalized)) return null;
  return normalized.includes('@') ? normalized : null;
}

export function normalizeNameForDuplicate(value?: string | null): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

export function buildDuplicateKeys(raw: DuplicateInput): LeadDuplicateKeys {
  const phoneCandidates = [
    raw.phone,
    raw.whatsapp,
    raw.whatsapp_number,
  ]
    .map(normalizePhoneForDuplicate)
    .filter((value): value is string => Boolean(value));

  return {
    phones: [...new Set(phoneCandidates)],
    email: normalizeEmailForDuplicate(raw.email),
    name: normalizeNameForDuplicate(raw.lead_name),
  };
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        substitution,
      );
    }
    for (let j = 0; j <= b.length; j++) previous[j] = current[j];
  }

  return previous[b.length];
}

export function nameSimilarity(a: string, b: string): number {
  const left = normalizeNameForDuplicate(a);
  const right = normalizeNameForDuplicate(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const longest = Math.max(left.length, right.length);
  return longest === 0 ? 0 : 1 - (levenshtein(left, right) / longest);
}

function leadMillis(lead: Lead): number {
  const createdAt = lead.created_at;
  if (createdAt && typeof createdAt.toMillis === 'function') return createdAt.toMillis();
  return 0;
}

export function findDuplicateLeads(
  input: DuplicateInput,
  existingLeads: Lead[],
  options: { excludeLeadId?: string } = {},
): DuplicateCandidate[] {
  const inputKeys = buildDuplicateKeys(input);
  if (inputKeys.phones.length === 0 && !inputKeys.email && !inputKeys.name) return [];

  return existingLeads
    .filter(lead => lead.id !== options.excludeLeadId)
    .map((lead): DuplicateCandidate | null => {
      const raw = lead.raw_data || {};
      const existingKeys = lead.duplicate_keys || buildDuplicateKeys(raw);
      const reasons: string[] = [];
      let exact = false;

      const sharedPhones = inputKeys.phones.filter(phone => existingKeys.phones.includes(phone));
      if (sharedPhones.length > 0) {
        exact = true;
        reasons.push('phone match');
      }

      if (inputKeys.email && existingKeys.email && inputKeys.email === existingKeys.email) {
        exact = true;
        reasons.push('email match');
      }

      const phoneSuffixOverlap = inputKeys.phones.some(phone =>
        existingKeys.phones.some(existingPhone => phone.slice(-4) === existingPhone.slice(-4)),
      );
      const similarity = nameSimilarity(inputKeys.name, existingKeys.name);
      if (!exact && phoneSuffixOverlap && similarity >= 0.82) {
        reasons.push('similar name and phone ending');
      }

      if (reasons.length === 0) return null;

      return {
        lead,
        strength: exact ? 'exact' : 'likely',
        reasons,
      };
    })
    .filter((candidate): candidate is DuplicateCandidate => Boolean(candidate))
    .sort((a, b) => {
      if (a.strength !== b.strength) return a.strength === 'exact' ? -1 : 1;
      return leadMillis(b.lead) - leadMillis(a.lead);
    });
}

export function describeDuplicateCandidate(candidate: DuplicateCandidate): string {
  const name = candidate.lead.raw_data?.lead_name || 'Existing lead';
  const reason = candidate.reasons.join(', ');
  return `${name} (${candidate.strength}, ${reason})`;
}
