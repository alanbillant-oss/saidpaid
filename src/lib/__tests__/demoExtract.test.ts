import { describe, expect, it } from 'vitest';
import { demoExtract } from '../demoExtract';
import { demoClients, demoRateItems, demoRateOptions } from '../demo';

const ctx = {
  today: '2026-10-14',
  clients: demoClients,
  rateItems: demoRateItems.map((r) => ({ ...r, unit: r.pricing.kind === 'per_unit' || r.pricing.kind === 'tiers' ? r.pricing.unit : null })),
  rateOptions: demoRateOptions,
};

describe('demoExtract', () => {
  it('finds clients, services, options and durations', () => {
    const items = demoExtract(
      "Chez Paul, une affiche pour le menu d'été et une petite modif. Vlog de 15 min pour Jérémy. Nouveau client Acme, un réel signature en express.",
      ctx,
    );
    expect(items.map((i) => [i.client_spoken_name, i.rate_item_id, i.quantity])).toEqual([
      ['Chez Paul', 'r_poster', 1],
      ['Chez Paul', 'r_edit', 1],
      ['Jérémy Martin', 'r_vlog', 15],
      ['Acme', 'r_reel_sig', 1],
    ]);
    expect(items[3]).toMatchObject({ is_new_client: true, option_ids: ['o_express'] });
  });

  it('reads a spoken price', () => {
    expect(demoExtract('Logo + charte pour Nova, 800 euros', ctx)[0]).toMatchObject({ client_id: 'c_nova', spoken_price: 800 });
  });
});
