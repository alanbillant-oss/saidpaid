import { describe, expect, it } from 'vitest';
import { priceItem } from '../pricing';
import { demoRateItems, demoRateOptions } from '../demo';
import type { ExtractedItem } from '../types';

const item = (over: Partial<ExtractedItem>): ExtractedItem => ({
  client_id: null,
  client_spoken_name: '',
  is_new_client: false,
  new_client_email: null,
  description: 'Test',
  rate_item_id: null,
  option_ids: [],
  quantity: null,
  unit: null,
  spoken_price: null,
  spoken_price_is_per_unit: false,
  date: '2026-10-14',
  confidence: 'high',
  ambiguity: null,
  ...over,
});

const price = (over: Partial<ExtractedItem>, clientId: string | null = null) =>
  priceItem(item(over), clientId, demoRateItems, demoRateOptions);

describe('priceItem', () => {
  it('uses the flat rate card price', () => {
    expect(price({ rate_item_id: 'r_reel_sig' })).toMatchObject({ unitPrice: 13000, quantity: 1, priceSource: 'rate_card' });
  });

  it('uses the client-specific price over the default one', () => {
    expect(price({ rate_item_id: 'r_poster' }, 'c_paul').unitPrice).toBe(12000);
    expect(price({ rate_item_id: 'r_poster' }, 'c_nova').unitPrice).toBe(15000);
  });

  it('picks the right duration bracket', () => {
    expect(price({ rate_item_id: 'r_vlog', quantity: 8 }).unitPrice).toBe(25000);
    expect(price({ rate_item_id: 'r_vlog', quantity: 15 }).unitPrice).toBe(39000);
    expect(price({ rate_item_id: 'r_vlog', quantity: 30 }).unitPrice).toBe(52000);
  });

  it('asks when the bracket is on quote', () => {
    const r = price({ rate_item_id: 'r_vlog', quantity: 45 });
    expect(r.unitPrice).toBeNull();
    expect(r.question).toMatch(/quote/);
  });

  it('applies a per-minute price with a minimum', () => {
    expect(price({ rate_item_id: 'r_vsl', quantity: 1 })).toMatchObject({ unitPrice: 20000, quantity: 1 });
    expect(price({ rate_item_id: 'r_vsl', quantity: 4 })).toMatchObject({ unitPrice: 10000, quantity: 4 });
  });

  it('asks for the quantity of a per-unit service when missing', () => {
    expect(price({ rate_item_id: 'r_day' }).question).toMatch(/How many/);
    expect(price({ rate_item_id: 'r_day', quantity: 2 })).toMatchObject({ unitPrice: 30000, quantity: 2 });
  });

  it('applies percent and fixed options', () => {
    // 85 + 30% = 110.50, + thumbnail 30 = 140.50
    expect(price({ rate_item_id: 'r_reel_ess', option_ids: ['o_express', 'o_thumb'] }).unitPrice).toBe(14050);
  });

  it('never invents a price for on-quote or unknown services', () => {
    expect(price({ rate_item_id: 'r_brand' })).toMatchObject({ unitPrice: null, priceSource: 'unknown' });
    expect(price({ rate_item_id: null })).toMatchObject({ unitPrice: null, priceSource: 'unknown' });
  });

  it('trusts the price the freelancer said', () => {
    expect(price({ rate_item_id: 'r_brand', spoken_price: 800 })).toMatchObject({ unitPrice: 80000, priceSource: 'user' });
    expect(price({ spoken_price: 250, spoken_price_is_per_unit: true, quantity: 2 })).toMatchObject({ unitPrice: 25000, quantity: 2 });
  });
});
