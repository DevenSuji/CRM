export interface CRMBranding {
  companyName: string;
  tagline: string;
  logo: string | null;
  banner: string | null;
  primaryColor: string;
  phone: string;
  email: string;
  website: string;
}

export const DEFAULT_BRANDING: CRMBranding = {
  companyName: 'Elite Build',
  tagline: 'Your calming command center for real-estate sales.',
  logo: null,
  banner: null,
  primaryColor: '#555856',
  phone: '',
  email: '',
  website: '',
};

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

function asTrimmedString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function asNullableUrl(value: unknown): string | null {
  const url = asTrimmedString(value, 2048);
  if (!url) return null;
  return /^(https?:\/\/|data:image\/)/i.test(url) ? url : null;
}

export function normalizeBrandColor(value: unknown): string {
  const color = asTrimmedString(value, 16);
  return HEX_COLOR_RE.test(color) ? color.toUpperCase() : DEFAULT_BRANDING.primaryColor;
}

export function normalizeBranding(value: unknown): CRMBranding {
  const data = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return {
    companyName: asTrimmedString(data.companyName, 80) || DEFAULT_BRANDING.companyName,
    tagline: asTrimmedString(data.tagline, 140) || DEFAULT_BRANDING.tagline,
    logo: asNullableUrl(data.logo),
    banner: asNullableUrl(data.banner),
    primaryColor: normalizeBrandColor(data.primaryColor),
    phone: asTrimmedString(data.phone, 40),
    email: asTrimmedString(data.email, 120),
    website: asTrimmedString(data.website, 240),
  };
}
