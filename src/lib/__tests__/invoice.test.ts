import { describe, expect, it } from 'vitest';
import { buildDrafts, invoiceTotals, issueInvoice, nextInvoiceNumber, volumeDiscountFor } from '../invoice';
import { demoBusiness } from '../demo';
import type { Invoice, Mission } from '../types';

const mission = (id: string, clientId: string, unitPrice: number | null, status: Mission['status'] = 'confirmed'): Mission => ({
  id,
  clientId,
  description: `Mission ${id}`,
  quantity: 1,
  unitPrice,
  priceSource: 'rate_card',
  date: '2026-10-0' + id.slice(-1),
  status,
});

let n = 0;
const newId = () => `id${++n}`;

describe('invoices', () => {
  it('computes totals with discount and VAT', () => {
    const t = invoiceTotals({ lines: [{ description: 'a', quantity: 2, unitPrice: 10000 }], discountPercent: 10, vatRate: 20 });
    expect(t).toEqual({ subtotal: 20000, discount: 2000, net: 18000, vat: 3600, total: 21600 });
  });

  it('picks the volume discount for the cycle', () => {
    const tiers = demoBusiness.volumeDiscounts;
    expect(volumeDiscountFor(5, tiers)).toBe(0);
    expect(volumeDiscountFor(6, tiers)).toBe(8);
    expect(volumeDiscountFor(15, tiers)).toBe(15);
    expect(volumeDiscountFor(30, tiers)).toBe(20);
  });

  it('builds one draft per client and skips missions without a price', () => {
    const drafts = buildDrafts(
      [mission('m1', 'a', 100), mission('m2', 'b', 200), mission('m3', 'a', 300), mission('m4', 'a', null, 'needs_info')],
      demoBusiness,
      newId,
    );
    expect(drafts).toHaveLength(2);
    const a = drafts.find((d) => d.invoice.clientId === 'a')!;
    expect(a.missionIds).toEqual(['m1', 'm3']);
    expect(a.invoice.number).toBeNull();
  });

  it('numbers invoices sequentially on issue only', () => {
    const existing = [{ number: 'SP-2026-0001' }, { number: 'SP-2026-0002' }, { number: null }, { number: 'SP-2025-0099' }] as Invoice[];
    expect(nextInvoiceNumber(existing, 'SP', 2026)).toBe('SP-2026-0003');
    expect(nextInvoiceNumber(existing, 'SP', 2027)).toBe('SP-2027-0001');
  });

  it('sets issue and due dates when issuing', () => {
    const [d] = buildDrafts([mission('m1', 'a', 100)], demoBusiness, newId);
    const issued = issueInvoice(d.invoice, [], demoBusiness, undefined, '2026-10-14');
    expect(issued).toMatchObject({ number: 'SP-2026-0001', issueDate: '2026-10-14', dueDate: '2026-10-29', status: 'sent' });
  });
});
