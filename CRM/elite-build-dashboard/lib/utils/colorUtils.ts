/** Calculate relative luminance of a hex color (WCAG 2.0 formula) */
export function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Returns white for dark backgrounds, dark navy for light backgrounds */
export function contrastingTextColor(hex: string): string {
  return relativeLuminance(hex) > 0.4 ? '#050E3C' : '#FFFFFF';
}

export const DEFAULT_CARD_COLORS = [
  '#6FCF97', '#FFC81E', '#F9B2D7', '#5E7AC4', '#48A111', '#261CC1', '#002455',
];
