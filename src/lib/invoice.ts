import type { Business, Client, Invoice, InvoiceLine, Mission, VolumeDiscount } from './types';

export function lineTotal(l: InvoiceLine): number {
  return Math.round(l.unitPrice * l.quantity);
}

export function invoiceTotals(inv: Pick<Invoice, 'lines' | 'discountPercent' | 'vatRate'>) {
  const subtotal = inv.lines.reduce((s, l) => s + lineTotal(l), 0);
  const discount = Math.round((subtotal * inv.discountPercent) / 100);
  const net = subtotal - discount;
  const vat = Math.round((net * inv.vatRate) / 100);
  return { subtotal, discount, net, vat, total: net + vat };
}

/** Volume discount is computed per billing cycle, not per mission (e.g. 6-10 items -8%). */
export function volumeDiscountFor(count: number, tiers: VolumeDiscount[]): number {
  return [...tiers].sort((a, b) => b.minItems - a.minItems).find((t) => count >= t.minItems)?.percent ?? 0;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Group confirmed, not-yet-invoiced missions into one draft per client. */
export function buildDrafts(
  missions: Mission[],
  business: Business,
  newId: () => string,
): { invoice: Invoice; missionIds: string[] }[] {
  const ready = missions.filter((m) => m.status === 'confirmed' && m.unitPrice != null && !m.invoiceId);
  const byClient = new Map<string, Mission[]>();
  for (const m of ready) byClient.set(m.clientId, [...(byClient.get(m.clientId) ?? []), m]);

  return [...byClient.entries()].map(([clientId, ms]) => {
    const sorted = [...ms].sort((a, b) => a.date.localeCompare(b.date));
    return {
      missionIds: sorted.map((m) => m.id),
      invoice: {
        id: newId(),
        businessId: business.id,
        number: null,
        clientId,
        issueDate: null,
        dueDate: null,
        lines: sorted.map((m) => ({
          description: m.description,
          quantity: m.quantity,
          unitPrice: m.unitPrice as number,
          missionId: m.id,
        })),
        discountPercent: volumeDiscountFor(sorted.length, business.volumeDiscounts),
        vatRate: business.vatRate,
        currency: business.currency,
        status: 'draft',
      },
    };
  });
}

export const DEFAULT_NUMBER_TEMPLATE = '{prefix}-{year}-{seq:4}';

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Next sequential number from a template such as "{prefix}-{year}-{seq:4}" (SP-2026-0007),
 * "F{year}-{seq:3}" or "F{yy}{seq:5}" (F2600039, facture.net style), usually taken over from
 * imported invoices. Without {year} or {yy} the sequence never resets. Numbers are only assigned on
 * issue, so the sequence has no gaps.
 */
export function nextInvoiceNumber(existing: Invoice[], prefix: string, year: number, template = DEFAULT_NUMBER_TEMPLATE): string {
  const pad = Number(template.match(/\{seq:(\d+)\}/)?.[1] ?? 1);
  const filled = (seq: string) =>
    template
      .replaceAll('{prefix}', prefix)
      .replaceAll('{year}', String(year))
      .replaceAll('{yy}', String(year).slice(-2))
      .replace(/\{seq(?::\d+)?\}/, seq);
  const re = new RegExp('^' + escapeRe(filled('\u0000')).replace('\u0000', '(\\d+)') + '$');
  const max = existing.reduce((m, i) => {
    const hit = i.number?.match(re);
    return hit ? Math.max(m, Number(hit[1])) : m;
  }, 0);
  return filled(String(max + 1).padStart(pad, '0'));
}

/**
 * Guess the numbering template from existing invoice numbers:
 * "F2026-0012" -> "F{year}-{seq:4}", "F2600038" -> "F{yy}{seq:5}", "INV-12" -> "INV-{seq:2}".
 */
export function detectNumberTemplate(numbers: { number: string; year: number }[]): string | null {
  const parsed = numbers
    .map((n) => ({ ...n, number: n.number.trim(), m: n.number.trim().match(/^(.*?)(\d+)$/) }))
    .filter((n): n is typeof n & { m: RegExpMatchArray } => !!n.m)
    .sort((a, b) => a.year - b.year || a.number.localeCompare(b.number, undefined, { numeric: true }));
  const last = parsed.at(-1);
  if (!last) return null;
  const withYear = (token: string, text: string) => {
    // The year is followed only by separators and the sequence, e.g. F[26]00038 or F[2026]-0012.
    for (let i = last.number.indexOf(text); i >= 0; i = last.number.indexOf(text, i + 1)) {
      const rest = last.number.slice(i + text.length).match(/^(\D*)(\d+)$/);
      if (rest) return `${last.number.slice(0, i)}${token}${rest[1]}{seq:${rest[2].length}}`;
    }
    return null;
  };
  const full = String(last.year);
  return withYear('{year}', full) ?? withYear('{yy}', full.slice(-2)) ?? `${last.m[1]}{seq:${last.m[2].length}}`;
}

export function issueInvoice(inv: Invoice, all: Invoice[], business: Business, client: Client | undefined, today: string): Invoice {
  if (inv.number) return inv;
  const terms = client?.paymentTermsDays ?? business.paymentTermsDays;
  return {
    ...inv,
    number: nextInvoiceNumber(all, business.invoicePrefix, Number(today.slice(0, 4)), business.numberTemplate),
    issueDate: today,
    dueDate: addDays(today, terms),
    status: 'sent',
  };
}
