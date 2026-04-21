export function formatPrice(price: number): string {
  if (!price) return '\u2014';
  if (price >= 10_000_000) return `\u20B9${(price / 10_000_000).toFixed(2)} Cr`;
  if (price >= 100_000) return `\u20B9${(price / 100_000).toFixed(2)} L`;
  return `\u20B9${price.toLocaleString('en-IN')}`;
}
