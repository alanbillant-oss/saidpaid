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

/** Next sequential number, e.g. SP-2026-0007. Numbers are only assigned on issue: no gaps. */
export function nextInvoiceNumber(existing: Invoice[], prefix: string, year: number): string {
  const re = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  const max = existing.reduce((m, i) => {
    const hit = i.number?.match(re);
    return hit ? Math.max(m, Number(hit[1])) : m;
  }, 0);
  return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`;
}

export function issueInvoice(inv: Invoice, all: Invoice[], business: Business, client: Client | undefined, today: string): Invoice {
  if (inv.number) return inv;
  const terms = client?.paymentTermsDays ?? business.paymentTermsDays;
  return {
    ...inv,
    number: nextInvoiceNumber(all, business.invoicePrefix, Number(today.slice(0, 4))),
    issueDate: today,
    dueDate: addDays(today, terms),
    status: 'sent',
  };
}
