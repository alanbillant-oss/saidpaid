import { describe, expect, it } from 'vitest';
import { demoBusiness, demoClients, demoRateItems, demoRateOptions } from '../demo';
import { initialState, reducer, type State } from '../state';
import type { ExtractedItem } from '../types';
import { actionsForCaptures, chatIdFor, pairLink, type WhatsAppCapture } from '../whatsapp';

const base: State = { ...initialState, business: demoBusiness, clients: demoClients, rateItems: demoRateItems, rateOptions: demoRateOptions };

const item = (over: Partial<ExtractedItem>): ExtractedItem => ({
  client_id: demoClients[0].id,
  client_spoken_name: demoClients[0].name,
  is_new_client: false,
  new_client_email: null,
  description: 'Poster',
  rate_item_id: demoRateItems[0].id,
  option_ids: [],
  quantity: 1,
  unit: null,
  spoken_price: null,
  spoken_price_is_per_unit: false,
  date: '2026-11-03',
  confidence: 'high',
  ambiguity: null,
  ...over,
});

const capture = (id: string, items: ExtractedItem[]): WhatsAppCapture => ({
  id,
  kind: 'audio',
  transcript: 'Chez Paul, une affiche',
  items,
  created_at: '2026-11-03T09:00:00Z',
});

describe('WhatsApp captures', () => {
  it('go through the same capture flow as the app and are tagged as WhatsApp', () => {
    let state = base;
    for (const a of actionsForCaptures(state, [capture('x1', [item({})])])) state = reducer(state, a);
    const user = state.chat.find((c) => c.id === chatIdFor('x1'));
    expect(user?.source).toBe('whatsapp');
    expect(user?.text).toBe('Chez Paul, une affiche');
    expect(state.missions).toHaveLength(1);
    expect(state.missions[0].clientId).toBe(demoClients[0].id);
    expect(state.missions[0].captureId).toBe(chatIdFor('x1'));
  });

  it('are never applied twice', () => {
    let state = base;
    const caps = [capture('x1', [item({})])];
    for (const a of actionsForCaptures(state, caps)) state = reducer(state, a);
    expect(actionsForCaptures(state, caps)).toEqual([]);
    expect(actionsForCaptures(base, [...caps, ...caps])).toHaveLength(2);
  });

  it('use the spoken price when there is one', () => {
    let state = base;
    for (const a of actionsForCaptures(state, [capture('x2', [item({ spoken_price: 250, rate_item_id: null })])])) state = reducer(state, a);
    expect(state.missions[0].unitPrice).toBe(25000);
    expect(state.missions[0].priceSource).toBe('user');
  });
});

describe('pairLink', () => {
  it('prefills the code in WhatsApp', () => {
    expect(pairLink('33612345678', 'SP-K7M3QX')).toBe('https://wa.me/33612345678?text=Saidpaid%20code%20SP-K7M3QX');
    expect(pairLink(null, 'SP-K7M3QX')).toBeNull();
  });
});
