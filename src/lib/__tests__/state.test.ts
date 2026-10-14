import { describe, expect, it } from 'vitest';
import { demoBusiness, demoClients, demoRateItems, demoRateOptions } from '../demo';
import { initialState, reducer, type State } from '../state';
import type { ExtractedItem } from '../types';

const base: State = {
  ...initialState,
  business: demoBusiness,
  clients: demoClients,
  rateItems: demoRateItems,
  rateOptions: demoRateOptions,
  chat: [{ id: 'u1', role: 'user', text: '🎙️', at: '' }],
};

const item = (over: Partial<ExtractedItem>): ExtractedItem => ({
  client_id: null,
  client_spoken_name: '',
  is_new_client: false,
  new_client_email: null,
  description: 'Poster',
  rate_item_id: 'r_poster',
  option_ids: [],
  quantity: 1,
  unit: null,
  spoken_price: null,
  spoken_price_is_per_unit: false,
  date: '2026-10-14',
  confidence: 'high',
  ambiguity: null,
  ...over,
});

const capture = (items: ExtractedItem[], state = base) =>
  reducer(state, { type: 'applyCapture', userEntryId: 'u1', transcript: 'Chez Paul, une affiche', items, today: '2026-10-14' });

describe('capture flow', () => {
  it('creates priced missions for known clients and writes the transcript', () => {
    const s = capture([item({ client_spoken_name: 'Chez Paul' })]);
    expect(s.missions).toHaveLength(1);
    expect(s.missions[0]).toMatchObject({ clientId: 'c_paul', unitPrice: 12000, status: 'confirmed' });
    expect(s.chat[0].text).toBe('Chez Paul, une affiche');
    expect(s.chat[1].missionIds).toEqual([s.missions[0].id]);
  });

  it('parks missions for unknown clients until the freelancer decides', () => {
    let s = capture([item({ client_spoken_name: 'Acme', is_new_client: true, new_client_email: 'a@acme.co' })]);
    expect(s.missions).toHaveLength(0);
    const entry = s.chat[1];
    expect(entry.pending).toHaveLength(1);
    s = reducer(s, { type: 'createClientForPending', entryId: entry.id, key: entry.pending![0].key });
    expect(s.clients.at(-1)).toMatchObject({ name: 'Acme', email: 'a@acme.co' });
    expect(s.missions[0]).toMatchObject({ unitPrice: 15000 });
    expect(s.chat[1].pending).toHaveLength(0);
  });

  it('asks for a price instead of inventing one, then confirms it', () => {
    let s = capture([item({ client_spoken_name: 'Nova', rate_item_id: 'r_brand' })]);
    expect(s.missions[0]).toMatchObject({ status: 'needs_info', unitPrice: null });
    s = reducer(s, { type: 'setMissionPrice', id: s.missions[0].id, unitPrice: 80000 });
    expect(s.missions[0]).toMatchObject({ status: 'confirmed', unitPrice: 80000, priceSource: 'user' });
  });

  it('turns confirmed missions into drafts, and frees them if the draft is deleted', () => {
    let s = capture([item({ client_spoken_name: 'Chez Paul' }), item({ client_spoken_name: 'Jérémy', rate_item_id: 'r_edit' })]);
    s = reducer(s, { type: 'createDrafts' });
    expect(s.invoices).toHaveLength(2);
    expect(s.missions.every((m) => m.status === 'invoiced')).toBe(true);
    s = reducer(s, { type: 'deleteDraft', id: s.invoices[0].id });
    expect(s.invoices).toHaveLength(1);
    expect(s.missions.filter((m) => m.status === 'confirmed')).toHaveLength(1);
  });

  it('locks an invoice once issued', () => {
    let s = capture([item({ client_spoken_name: 'Chez Paul' })]);
    s = reducer(s, { type: 'createDrafts' });
    const id = s.invoices[0].id;
    s = reducer(s, { type: 'issueInvoice', id, today: '2026-10-14' });
    expect(s.invoices[0]).toMatchObject({ number: 'SP-2026-0001', status: 'sent' });
    s = reducer(s, { type: 'updateInvoice', id, patch: { discountPercent: 50 } });
    expect(s.invoices[0].discountPercent).toBe(0);
  });
});
