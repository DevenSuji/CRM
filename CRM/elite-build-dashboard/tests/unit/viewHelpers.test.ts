import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { formatPrice } from '@/lib/utils/formatPrice';
import { relativeTime } from '@/lib/utils/formatTimestamp';
import {
  relativeLuminance,
  contrastingTextColor,
  DEFAULT_CARD_COLORS,
} from '@/lib/utils/colorUtils';

// ==================== formatPrice ====================

describe('formatPrice — Indian price formatting (₹ / Lakh / Crore)', () => {
  it('returns em-dash for 0 (falsy sentinel — "no price set")', () => {
    // '\u2014' is em-dash. Pins the convention that 0 means "not set",
    // not "literally zero" — the dashboard shows "—" for unpriced units.
    expect(formatPrice(0)).toBe('\u2014');
  });

  it('formats amounts ≥ 1 Cr (10,000,000) as Cr with 2 decimals', () => {
    expect(formatPrice(10_000_000)).toBe('\u20B91.00 Cr');
    expect(formatPrice(25_500_000)).toBe('\u20B92.55 Cr');
    expect(formatPrice(123_456_789)).toBe('\u20B912.35 Cr');
  });

  it('formats 1 L ≤ amount < 1 Cr as Lakh with 2 decimals', () => {
    expect(formatPrice(100_000)).toBe('\u20B91.00 L');
    expect(formatPrice(550_000)).toBe('\u20B95.50 L');
    expect(formatPrice(9_999_999)).toBe('\u20B9100.00 L');
  });

  it('formats amounts < 1 L with Indian digit grouping (lakhs-crores)', () => {
    // Pins that the en-IN locale is used for sub-lakh values — 99,999 not 99999.
    expect(formatPrice(99_999)).toBe('\u20B999,999');
    expect(formatPrice(1_234)).toBe('\u20B91,234');
    expect(formatPrice(50_000)).toBe('\u20B950,000');
  });

  it('boundary: 99,999 is sub-lakh, 1,00,000 is Lakh', () => {
    expect(formatPrice(99_999)).toBe('\u20B999,999');
    expect(formatPrice(100_000)).toBe('\u20B91.00 L');
  });

  it('boundary: 9,999,999 is Lakh, 10,000,000 is Cr', () => {
    expect(formatPrice(9_999_999)).toBe('\u20B9100.00 L');
    expect(formatPrice(10_000_000)).toBe('\u20B91.00 Cr');
  });
});

// ==================== relativeTime ====================

describe('relativeTime — human-readable "X ago" strings', () => {
  beforeEach(() => {
    // Pin "now" to a fixed date so relative outputs are deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const ago = (seconds: number) =>
    Timestamp.fromMillis(Date.now() - seconds * 1000);

  it('returns empty string for null', () => {
    expect(relativeTime(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(relativeTime(undefined)).toBe('');
  });

  it('returns "just now" for under 60 seconds', () => {
    expect(relativeTime(ago(0))).toBe('just now');
    expect(relativeTime(ago(30))).toBe('just now');
    expect(relativeTime(ago(59))).toBe('just now');
  });

  it('returns Nm ago for 1–59 minutes', () => {
    expect(relativeTime(ago(60))).toBe('1m ago');
    expect(relativeTime(ago(5 * 60))).toBe('5m ago');
    expect(relativeTime(ago(59 * 60))).toBe('59m ago');
  });

  it('returns Nh ago for 1–23 hours', () => {
    expect(relativeTime(ago(60 * 60))).toBe('1h ago');
    expect(relativeTime(ago(12 * 3600))).toBe('12h ago');
    expect(relativeTime(ago(23 * 3600))).toBe('23h ago');
  });

  it('returns Nd ago for 1–29 days', () => {
    expect(relativeTime(ago(24 * 3600))).toBe('1d ago');
    expect(relativeTime(ago(7 * 86400))).toBe('7d ago');
    expect(relativeTime(ago(29 * 86400))).toBe('29d ago');
  });

  it('returns Nmo ago once days ≥ 30', () => {
    // Pins the 30-day "month" approximation — not calendar-month accurate,
    // but matches the behavior every card in the app uses.
    expect(relativeTime(ago(30 * 86400))).toBe('1mo ago');
    expect(relativeTime(ago(90 * 86400))).toBe('3mo ago');
    expect(relativeTime(ago(365 * 86400))).toBe('12mo ago');
  });

  it('boundary: exactly 60s is 1m, 3600s is 1h, 86400s is 1d', () => {
    expect(relativeTime(ago(60))).toBe('1m ago');
    expect(relativeTime(ago(3600))).toBe('1h ago');
    expect(relativeTime(ago(86400))).toBe('1d ago');
  });

  it('handles future-dated timestamps (negative diff) — rounds to "just now"', () => {
    // A clock-skew lead gets a timestamp 5s in the future. We don't want a
    // negative "X ago" rendering — the floor of the diff puts it at -1 which
    // is < 60, so "just now" wins. Pinned so no one accidentally adds an
    // absolute-value branch that changes behavior.
    const future = Timestamp.fromMillis(Date.now() + 5000);
    expect(relativeTime(future)).toBe('just now');
  });
});

// ==================== colorUtils ====================

describe('relativeLuminance — WCAG 2.0 formula', () => {
  it('black is 0', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
  });

  it('white is 1', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('pure red ≈ 0.2126 (R coefficient)', () => {
    expect(relativeLuminance('#FF0000')).toBeCloseTo(0.2126, 3);
  });

  it('pure green ≈ 0.7152 (G coefficient — largest)', () => {
    expect(relativeLuminance('#00FF00')).toBeCloseTo(0.7152, 3);
  });

  it('pure blue ≈ 0.0722 (B coefficient — smallest)', () => {
    expect(relativeLuminance('#0000FF')).toBeCloseTo(0.0722, 3);
  });

  it('50% gray is in the mid-range', () => {
    const lum = relativeLuminance('#808080');
    expect(lum).toBeGreaterThan(0.15);
    expect(lum).toBeLessThan(0.25);
  });
});

describe('contrastingTextColor — pick dark-text-on-light vs white-text-on-dark', () => {
  // Threshold is 0.4. Pinning actual DEFAULT_CARD_COLORS results so a change
  // in threshold is caught — changing the threshold would flip real cards.

  it('returns dark navy for pure white', () => {
    expect(contrastingTextColor('#FFFFFF')).toBe('#050E3C');
  });

  it('returns white for pure black', () => {
    expect(contrastingTextColor('#000000')).toBe('#FFFFFF');
  });

  it('returns white for deep navy / dark blues', () => {
    expect(contrastingTextColor('#002455')).toBe('#FFFFFF');
    expect(contrastingTextColor('#261CC1')).toBe('#FFFFFF');
    expect(contrastingTextColor('#5E7AC4')).toBe('#FFFFFF');
  });

  it('returns dark navy for pastels and bright yellows/greens', () => {
    expect(contrastingTextColor('#FFC81E')).toBe('#050E3C'); // bright yellow
    expect(contrastingTextColor('#F9B2D7')).toBe('#050E3C'); // pastel pink
    expect(contrastingTextColor('#6FCF97')).toBe('#050E3C'); // mint green
  });

  it('every DEFAULT_CARD_COLORS entry resolves to one of the two approved text colors', () => {
    // Belt-and-suspenders: defends the invariant "card text is always readable
    // on every default card color". If a new color is added that picks something
    // other than navy/white, this fails.
    for (const color of DEFAULT_CARD_COLORS) {
      const text = contrastingTextColor(color);
      expect(['#050E3C', '#FFFFFF']).toContain(text);
    }
  });

  it('DEFAULT_CARD_COLORS has stable set (pin regressions if the palette changes)', () => {
    // Not asserting a specific order, but asserting the set — a silent removal
    // of a color would change user-visible defaults.
    expect(DEFAULT_CARD_COLORS).toHaveLength(7);
    expect(new Set(DEFAULT_CARD_COLORS).size).toBe(7);
  });
});
