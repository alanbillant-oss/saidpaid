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
 * Next sequential number from a template such as "{prefix}-{year}-{seq:4}" (SP-2026-0007) or
 * "F{year}-{seq:3}" (taken over from invoices imported from another tool). Without {year} the
 * sequence never resets. Numbers are only assigned on issue, so the sequence has no gaps.
 */
export function nextInvoiceNumber(existing: Invoice[], prefix: string, year: number, template = DEFAULT_NUMBER_TEMPLATE): string {
  const pad = Number(template.match(/\{seq:(\d+)\}/)?.[1] ?? 1);
  const filled = (seq: string) =>
    template.replaceAll('{prefix}', prefix).replaceAll('{year}', String(year)).replace(/\{seq(?::\d+)?\}/, seq);
  const re = new RegExp('^' + escapeRe(filled('\u0000')).replace('\u0000', '(\\d+)') + '$');
  const max = existing.reduce((m, i) => {
    const hit = i.number?.match(re);
    return hit ? Math.max(m, Number(hit[1])) : m;
  }, 0);
  return filled(String(max + 1).padStart(pad, '0'));
}

/** Guess the numbering template from existing invoice numbers, e.g. "F2026-0012" -> "F{year}-{seq:4}". */
export function detectNumberTemplate(numbers: { number: string; year: number }[]): string | null {
  const parsed = numbers
    .map((n) => ({ ...n, m: n.number.trim().match(/^(.*?)(\d+)$/) }))
    .filter((n): n is typeof n & { m: RegExpMatchArray } => !!n.m)
    .sort((a, b) => a.year - b.year || Number(a.m[2]) - Number(b.m[2]));
  const last = parsed.at(-1);
  if (!last) return null;
  const head = last.m[1].replace(String(last.year), '{year}');
  return `${head}{seq:${last.m[2].length}}`;
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
