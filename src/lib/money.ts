export function formatMoney(minor: number, currency: string, locale = 'en-GB'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

/** Parse "120", "120.50" or "120,50" typed by the user into minor units. */
export function parseMoney(input: string): number | null {
  const n = Number(input.replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function todayISO(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}
