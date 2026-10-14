// Core domain types. All money amounts are integers in minor units (pence, cents).

export type CurrencyCode = 'GBP' | 'EUR' | 'USD' | (string & {});

export type Unit = 'piece' | 'hour' | 'day' | 'minute';

/** How a service is priced. Mirrors the shapes found in real freelance rate cards. */
export type Pricing =
  | { kind: 'flat'; amount: number }
  | { kind: 'per_unit'; unit: Unit; amount: number; minimum?: number }
  /** Price by bracket of a measured quantity (e.g. video length). `amount: null` = on quote. */
  | { kind: 'tiers'; unit: Unit; tiers: { upTo: number | null; amount: number | null }[] }
  | { kind: 'on_quote' };

export type RateItem = {
  id: string;
  name: string;
  aliases: string[];
  pricing: Pricing;
  /** Client-specific prices that override `pricing` (partner rates, negotiated prices). */
  clientPricing?: Record<string, Pricing>;
};

/** Add-ons such as "express delivery +30%" or "thumbnail £30". */
export type RateOption = {
  id: string;
  name: string;
  aliases: string[];
  kind: 'fixed' | 'percent';
  /** Minor units for `fixed`, whole percent for `percent`. */
  value: number;
};

export type Client = {
  id: string;
  name: string;
  aliases: string[];
  email?: string;
  address?: string;
  paymentTermsDays?: number;
};

export type VolumeDiscount = { minItems: number; percent: number };

export type Business = {
  name: string;
  address: string;
  email: string;
  country: string;
  currency: CurrencyCode;
  /** VAT rate in percent (0 when not VAT registered). */
  vatRate: number;
  vatNumber?: string;
  /** Legal mention printed on every invoice, e.g. "Not VAT registered". */
  legalNote: string;
  paymentDetails: string;
  paymentTermsDays: number;
  invoicePrefix: string;
  volumeDiscounts: VolumeDiscount[];
};

export type PriceSource = 'user' | 'rate_card' | 'unknown';

export type MissionStatus = 'needs_info' | 'confirmed' | 'invoiced';

export type Mission = {
  id: string;
  clientId: string;
  description: string;
  quantity: number;
  /** Unit price in minor units; null while we wait for the freelancer to give a price. */
  unitPrice: number | null;
  priceSource: PriceSource;
  date: string; // YYYY-MM-DD
  status: MissionStatus;
  /** Question to ask when status is needs_info. */
  question?: string;
  captureId?: string;
  invoiceId?: string;
};

export type InvoiceLine = { description: string; quantity: number; unitPrice: number; missionId?: string };

export type InvoiceStatus = 'draft' | 'sent' | 'paid';

export type Invoice = {
  id: string;
  /** Assigned only when the invoice is issued, so numbering never has gaps. */
  number: string | null;
  clientId: string;
  issueDate: string | null;
  dueDate: string | null;
  lines: InvoiceLine[];
  discountPercent: number;
  vatRate: number;
  currency: CurrencyCode;
  status: InvoiceStatus;
  notes?: string;
};

/** What Claude returns for each mission it heard. Prices are never guessed by the model. */
export type ExtractedItem = {
  client_id: string | null;
  client_spoken_name: string;
  is_new_client: boolean;
  new_client_email: string | null;
  description: string;
  rate_item_id: string | null;
  option_ids: string[];
  quantity: number | null;
  unit: Unit | null;
  /** Price the freelancer said out loud, in major units. Null when not said. */
  spoken_price: number | null;
  spoken_price_is_per_unit: boolean;
  date: string;
  confidence: 'high' | 'medium' | 'low';
  ambiguity: string | null;
};

export type CaptureResult = {
  transcript: string;
  items: ExtractedItem[];
};
