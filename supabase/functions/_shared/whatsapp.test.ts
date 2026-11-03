import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { findPairCode, formatSummary, newPairCode, parseWebhook, verifySignature } from './whatsapp';

const payload = (messages: unknown[], phoneNumberId = '111') => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '33600000000', phone_number_id: phoneNumberId },
            contacts: [{ wa_id: '33612345678', profile: { name: 'Alan' } }],
            messages,
          },
        },
      ],
    },
  ],
});

describe('parseWebhook', () => {
  it('reads text and voice notes', () => {
    const msgs = parseWebhook(
      payload([
        { from: '33612345678', id: 'wamid.1', type: 'text', text: { body: 'Chez Paul une affiche' } },
        { from: '33612345678', id: 'wamid.2', type: 'audio', audio: { id: 'media1', mime_type: 'audio/ogg; codecs=opus', voice: true } },
        { from: '33612345678', id: 'wamid.3', type: 'image', image: { id: 'm' } },
      ]),
      '111',
    );
    expect(msgs).toEqual([
      { id: 'wamid.1', from: '33612345678', name: 'Alan', kind: 'text', text: 'Chez Paul une affiche' },
      { id: 'wamid.2', from: '33612345678', name: 'Alan', kind: 'audio', mediaId: 'media1', mimeType: 'audio/ogg; codecs=opus' },
      { id: 'wamid.3', from: '33612345678', name: 'Alan', kind: 'other' },
    ]);
  });

  it('ignores status updates and other numbers', () => {
    expect(parseWebhook({ entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'x' }] } }] }] })).toEqual([]);
    expect(parseWebhook(payload([{ from: '1', id: 'a', type: 'text', text: { body: 'hi' } }], '999'), '111')).toEqual([]);
    expect(parseWebhook(null)).toEqual([]);
  });
});

describe('verifySignature', () => {
  const body = JSON.stringify(payload([]));
  const sig = 'sha256=' + createHmac('sha256', 'secret').update(body).digest('hex');
  it('accepts a body signed with the app secret', async () => {
    expect(await verifySignature(body, sig, 'secret')).toBe(true);
  });
  it('rejects anything else', async () => {
    expect(await verifySignature(body, sig, 'other')).toBe(false);
    expect(await verifySignature(body + ' ', sig, 'secret')).toBe(false);
    expect(await verifySignature(body, null, 'secret')).toBe(false);
    expect(await verifySignature(body, 'sha256=00', 'secret')).toBe(false);
  });
});

describe('pairing codes', () => {
  it('are found in the prefilled message and typed by hand', () => {
    for (let i = 0; i < 50; i++) {
      const code = newPairCode();
      expect(code).toMatch(/^[A-Z2-9]{6}$/);
      expect(code).toMatch(/[0-9]/);
      expect(findPairCode(`Saidpaid code SP-${code}`)).toBe(code);
      expect(findPairCode(`sp${code.toLowerCase()}`)).toBe(code);
    }
  });
  it('do not match ordinary words', () => {
    expect(findPairCode('Spreadsheet pour SPEAKERS, banner et poster')).toBeNull();
    expect(findPairCode('Chez Paul, 3 affiches à 250')).toBeNull();
  });
});

describe('formatSummary', () => {
  const clients = [{ id: 'c1', name: 'Chez Paul' }];
  const it1 = {
    client_id: 'c1',
    client_spoken_name: 'Paul',
    description: 'Affiche menu été',
    quantity: 1,
    spoken_price: null,
    spoken_price_is_per_unit: false,
    ambiguity: null,
  };
  it('lists the jobs, the spoken prices and the doubts', () => {
    const text = formatSummary(
      [it1, { ...it1, client_id: null, client_spoken_name: 'Bistrot Marius', description: 'Logo', spoken_price: 400, ambiguity: 'Nouveau client ?' }],
      clients,
      'EUR',
      'fr',
    );
    expect(text).toContain('Noté ✅ 2 missions');
    expect(text).toContain('• Chez Paul : Affiche menu été');
    expect(text).toContain('• Bistrot Marius (nouveau client) : Logo · 400,00');
    expect(text).toContain('⚠️ Nouveau client ?');
    expect(text).toContain('Ouvre Saidpaid');
  });
  it('says so when nothing was billable', () => {
    expect(formatSummary([], clients, 'EUR', 'fr')).toMatch(/pas entendu de mission/);
  });
});
