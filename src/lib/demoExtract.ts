import { normalize } from './clients';
import type { ExtractedItem, Unit } from './types';

type Ctx = {
  today: string;
  clients: { id: string; name: string; aliases: string[] }[];
  rateItems: { id: string; name: string; aliases: string[]; unit: string | null }[];
  rateOptions: { id: string; name: string; aliases: string[] }[];
};

/**
 * Offline stand-in for the Claude extraction, used only in demo mode (web preview without API keys).
 * Simple keyword matching against client names and the rate card: good enough to try the flow,
 * nowhere near the real model. Prices still come from the deterministic pricing engine.
 */
export function demoExtract(text: string, ctx: Ctx): ExtractedItem[] {
  const clauses = text
    .split(/[.;\n]|,|\bet\b|\band\b|\bpuis\b|\bplus\b/i)
    .map((c) => c.trim())
    .filter(Boolean);

  const names = (x: { name: string; aliases: string[] }) =>
    [x.name, ...x.aliases].map(normalize).filter((n) => n.length > 1).sort((a, b) => b.length - a.length);
  const has = (hay: string, needle: string) => new RegExp(`(^| )${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(hay);

  let currentClient: { id: string | null; spoken: string; isNew: boolean } | null = null;
  const items: ExtractedItem[] = [];

  for (const clause of clauses) {
    const n = normalize(clause);
    const newClient = clause.match(/(?:nouveau client|new client)\s*:?\s*([^,.;]+?)(?:\s*,|$)/i);
    if (newClient) {
      currentClient = { id: null, spoken: newClient[1].trim(), isNew: true };
    } else {
      const c = ctx.clients.find((cl) => names(cl).some((name) => has(n, name)));
      if (c) currentClient = { id: c.id, spoken: c.name, isNew: false };
    }

    // Longest matching name wins, so "reel signature" beats "reel".
    const rate = ctx.rateItems
      .map((r) => ({ r, len: Math.max(0, ...names(r).filter((name) => has(n, name)).map((name) => name.length)) }))
      .filter((x) => x.len > 0)
      .sort((a, b) => b.len - a.len)[0]?.r;
    const priceMatch = clause.match(/(\d+(?:[.,]\d+)?)\s*(€|euros?|£|livres?|pounds?)/i);
    const spokenPrice = priceMatch ? Number(priceMatch[1].replace(',', '.')) : null;
    if (!rate) {
      // "..., 800 euros" right after a service: the price belongs to it.
      const last = items.at(-1);
      if (last && spokenPrice != null && last.spoken_price == null) last.spoken_price = spokenPrice;
      continue;
    }
    const options = ctx.rateOptions.filter((o) => names(o).some((name) => has(n, name))).map((o) => o.id);

    const qtyMatch = clause.match(/(\d+(?:[.,]\d+)?)\s*(min|minutes?|h|heures?|hours?|jours?|days?)\b/i);
    const unit: Unit | null = qtyMatch
      ? /^min/i.test(qtyMatch[2])
        ? 'minute'
        : /^(h|heure|hour)/i.test(qtyMatch[2])
          ? 'hour'
          : 'day'
      : null;

    items.push({
      client_id: currentClient?.id ?? null,
      client_spoken_name: currentClient?.spoken ?? '',
      is_new_client: currentClient?.isNew ?? false,
      new_client_email: clause.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? null,
      description: rate.name,
      rate_item_id: rate.id,
      option_ids: options,
      quantity: qtyMatch ? Number(qtyMatch[1].replace(',', '.')) : rate.unit ? null : 1,
      unit,
      spoken_price: spokenPrice,
      spoken_price_is_per_unit: false,
      date: ctx.today,
      confidence: 'medium',
      ambiguity: null,
    });
  }
  return items;
}
