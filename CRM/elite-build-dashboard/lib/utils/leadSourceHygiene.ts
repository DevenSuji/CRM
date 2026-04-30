import type { Lead } from '@/lib/types/lead';

const SOURCE_ALIASES: Array<{ label: string; patterns: RegExp[] }> = [
  {
    label: 'Meta Ads',
    patterns: [
      /\bmeta\b/i,
      /\bfacebook\b/i,
      /\bfb\b/i,
      /\binstagram\b/i,
      /\big\b/i,
    ],
  },
  {
    label: 'Google Ads',
    patterns: [
      /\bgoogle\b/i,
      /\bgads\b/i,
      /\badwords\b/i,
    ],
  },
  {
    label: 'Website',
    patterns: [
      /\bwebsite\b/i,
      /\bweb\s*site\b/i,
      /\blanding\s*page\b/i,
    ],
  },
  {
    label: 'Channel Partner',
    patterns: [
      /\bchannel\s*partner\b/i,
      /\bcp\b/i,
      /\bbroker\b/i,
    ],
  },
  {
    label: 'Walk-in',
    patterns: [
      /\bwalk[\s-]*in\b/i,
      /\bsite\s*walk[\s-]*in\b/i,
    ],
  },
  {
    label: 'CSV Import',
    patterns: [
      /\bcsv\b/i,
      /\bimport\b/i,
    ],
  },
  {
    label: 'WhatsApp',
    patterns: [
      /\bwhatsapp\b/i,
      /\bwa\b/i,
    ],
  },
  {
    label: 'Organic',
    patterns: [
      /\borganic\b/i,
      /\breferral\b/i,
      /\bword\s*of\s*mouth\b/i,
    ],
  },
];

function cleanSource(value?: string | null): string {
  return (value || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function normalizeLeadSource(source?: string | null): string {
  const cleaned = cleanSource(source);
  if (!cleaned) return 'Unknown';

  for (const alias of SOURCE_ALIASES) {
    if (alias.patterns.some(pattern => pattern.test(cleaned))) {
      return alias.label;
    }
  }

  return cleaned;
}

export function leadSourceLabel(lead: Pick<Lead, 'source' | 'source_normalized'>): string {
  return lead.source_normalized || normalizeLeadSource(lead.source);
}

export function sourceMatches(source: string, allowedSources: string[]): boolean {
  const normalized = normalizeLeadSource(source);
  return allowedSources.some(allowed =>
    allowed === source || normalizeLeadSource(allowed) === normalized,
  );
}

export interface LeadSourceNormalizationPatch {
  source: string;
  source_normalized: string;
}

export function getLeadSourceNormalizationPatch(lead: Pick<Lead, 'source' | 'source_normalized'>): LeadSourceNormalizationPatch | null {
  const normalized = normalizeLeadSource(lead.source);
  if (normalized === 'Unknown') return null;
  if (lead.source_normalized === normalized) return null;
  return {
    source: lead.source,
    source_normalized: normalized,
  };
}
