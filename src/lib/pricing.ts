import type { ExtractedItem, Pricing, PriceSource, RateItem, RateOption } from './types';

/**
 * Deterministic pricing. The golden rule from the brief: a price always comes from an
 * explicit source (what the freelancer said, or their rate card). The model never guesses.
 */

export type PricedLine = {
  description: string;
  quantity: number;
  unitPrice: number | null;
  priceSource: PriceSource;
  /** Set when we cannot price the line and must ask the freelancer. */
  question?: string;
};

export function pricingFor(item: RateItem, clientId: string | null): Pricing {
  return (clientId && item.clientPricing?.[clientId]) || item.pricing;
}

const UNIT_LABEL: Record<string, string> = { minute: 'min', hour: 'h', day: 'day', piece: 'pc' };

/** Price one base service. Returns the line total in minor units, or a question. */
export function priceBase(
  pricing: Pricing,
  quantity: number | null,
): { total: number; quantity: number; unitPrice: number } | { question: string } {
  switch (pricing.kind) {
    case 'flat': {
      const qty = quantity ?? 1;
      return { total: pricing.amount * qty, quantity: qty, unitPrice: pricing.amount };
    }
    case 'per_unit': {
      if (quantity == null) return { question: `How many ${UNIT_LABEL[pricing.unit] ?? pricing.unit}?` };
      const raw = Math.round(pricing.amount * quantity);
      const total = Math.max(raw, pricing.minimum ?? 0);
      // When the minimum kicks in, bill a single line at the minimum.
      if (total !== raw) return { total, quantity: 1, unitPrice: total };
      return { total, quantity, unitPrice: pricing.amount };
    }
    case 'tiers': {
      if (quantity == null) return { question: `How long is it (${UNIT_LABEL[pricing.unit] ?? pricing.unit})?` };
      const tier = pricing.tiers.find((t) => t.upTo == null || quantity <= t.upTo);
      if (!tier || tier.amount == null) return { question: 'This one is on quote. What price?' };
      return { total: tier.amount, quantity: 1, unitPrice: tier.amount };
    }
    case 'on_quote':
      return { question: 'This one is on quote. What price?' };
  }
}

export function applyOptions(baseTotal: number, options: RateOption[]): number {
  const fixed = options.filter((o) => o.kind === 'fixed').reduce((s, o) => s + o.value, 0);
  const pct = options.filter((o) => o.kind === 'percent').reduce((s, o) => s + o.value, 0);
  return Math.round(baseTotal * (1 + pct / 100)) + fixed;
}

const toMinor = (major: number) => Math.round(major * 100);

export function priceItem(
  item: ExtractedItem,
  clientId: string | null,
  rateItems: RateItem[],
  rateOptions: RateOption[],
): PricedLine {
  const options = item.option_ids
    .map((id) => rateOptions.find((o) => o.id === id))
    .filter((o): o is RateOption => !!o);
  const optionSuffix = options.length ? ` (+ ${options.map((o) => o.name).join(', ')})` : '';
  const description = item.description + optionSuffix;

  // 1. The freelancer said a price: that is the source of truth.
  if (item.spoken_price != null) {
    const qty = item.quantity ?? 1;
    const spoken = toMinor(item.spoken_price);
    if (item.spoken_price_is_per_unit) {
      return { description, quantity: qty, unitPrice: spoken, priceSource: 'user' };
    }
    return { description, quantity: 1, unitPrice: spoken, priceSource: 'user' };
  }

  // 2. Rate card.
  const rate = item.rate_item_id ? rateItems.find((r) => r.id === item.rate_item_id) : undefined;
  if (!rate) {
    return {
      description,
      quantity: item.quantity ?? 1,
      unitPrice: null,
      priceSource: 'unknown',
      question: `No price in your rate card for "${item.description}". How much?`,
    };
  }

  const base = priceBase(pricingFor(rate, clientId), item.quantity);
  if ('question' in base) {
    return { description, quantity: item.quantity ?? 1, unitPrice: null, priceSource: 'unknown', question: base.question };
  }
  if (!options.length) {
    return { description, quantity: base.quantity, unitPrice: base.unitPrice, priceSource: 'rate_card' };
  }
  // Options turn the line into a single package price.
  const total = applyOptions(base.total, options);
  const quantityLabel = base.quantity !== 1 ? ` x${base.quantity}` : '';
  return { description: description + quantityLabel, quantity: 1, unitPrice: total, priceSource: 'rate_card' };
}
