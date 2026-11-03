import type { Business, Client, RateItem, RateOption } from './types';

type NoBiz<T> = Omit<T, 'businessId'>;
const inBusiness = <T,>(businessId: string, xs: NoBiz<T>[]): T[] => xs.map((x) => ({ ...x, businessId }) as T);

/**
 * Demo workspace built from the real 317 LAB rate cards described in BRIEF.md.
 * Useful to try the app end to end and as fixtures for the pricing tests.
 */

export const demoBusiness: Business = {
  id: 'b_317',
  name: '317 LAB',
  legalForm: 'Micro-entreprise',
  address: 'Bangkok, Thaïlande',
  email: 'hello@317lab.example',
  country: 'FR',
  currency: 'EUR',
  vatRate: 0,
  legalNote: 'TVA non applicable, art. 293 B du CGI',
  paymentDetails: 'IBAN: FR76 XXXX XXXX XXXX XXXX XXXX XXX',
  paymentTermsDays: 15,
  invoicePrefix: 'SP',
  volumeDiscounts: [
    { minItems: 6, percent: 8 },
    { minItems: 11, percent: 15 },
    { minItems: 21, percent: 20 },
  ],
  template: 'bold',
  accentColor: '#1F6F4A',
  invoiceLanguage: 'fr',
};

/** A second company, to show invoicing from several businesses. */
export const demoBusiness2: Business = {
  id: 'b_studio',
  name: 'Studio Alan',
  legalForm: 'Micro-entreprise',
  address: '12 rue des Lilas\n75011 Paris',
  email: 'alan@studio.example',
  country: 'FR',
  currency: 'EUR',
  vatRate: 0,
  legalNote: 'TVA non applicable, art. 293 B du CGI',
  paymentDetails: 'IBAN: FR76 YYYY YYYY YYYY YYYY YYYY YYY',
  paymentTermsDays: 30,
  invoicePrefix: 'SA',
  volumeDiscounts: [],
  template: 'minimal',
  accentColor: '#2B4C9B',
  invoiceLanguage: 'fr',
};

export const demoClients: Client[] = [
  { id: 'c_paul', name: 'Chez Paul', aliases: ['Paul', 'le resto'], email: 'paul@chezpaul.example' },
  { id: 'c_jeremy', name: 'Jérémy Martin', aliases: ['Jérémy', 'Jeremy'], email: 'jeremy@example.com' },
  { id: 'c_nova', name: 'Studio Nova', aliases: ['Nova'], email: 'sarah@studionova.example' },
];

export const demoRateItems: RateItem[] = inBusiness<RateItem>('b_317', [
  { id: 'r_reel_ess', name: 'Reel Essentiel', aliases: ['réel', 'reel', 'réel essentiel'], pricing: { kind: 'flat', amount: 8500 } },
  { id: 'r_reel_sig', name: 'Reel Signature', aliases: ['réel signature'], pricing: { kind: 'flat', amount: 13000 } },
  { id: 'r_reel_prem', name: 'Reel Premium', aliases: ['réel premium'], pricing: { kind: 'flat', amount: 19000 } },
  {
    id: 'r_vlog',
    name: 'Vlog',
    aliases: ['vlog', 'montage vlog'],
    pricing: {
      kind: 'tiers',
      unit: 'minute',
      tiers: [
        { upTo: 10, amount: 25000 },
        { upTo: 20, amount: 39000 },
        { upTo: 30, amount: 52000 },
        { upTo: null, amount: null },
      ],
    },
  },
  { id: 'r_vsl', name: 'VSL', aliases: ['vsl', 'video sales letter'], pricing: { kind: 'per_unit', unit: 'minute', amount: 10000, minimum: 20000 } },
  {
    id: 'r_poster',
    name: 'Affiche',
    aliases: ['affiche', 'poster'],
    pricing: { kind: 'flat', amount: 15000 },
    clientPricing: { c_paul: { kind: 'flat', amount: 12000 } },
  },
  { id: 'r_edit', name: 'Petite modification', aliases: ['modif', 'petite modif', 'retouche', 'small revision'], pricing: { kind: 'flat', amount: 3000 } },
  { id: 'r_day', name: 'Journée de montage', aliases: ['jour de montage', 'journée', 'editing day'], pricing: { kind: 'per_unit', unit: 'day', amount: 30000 } },
  { id: 'r_brand', name: 'Identité visuelle', aliases: ['logo + charte', 'identité visuelle', 'brand identity'], pricing: { kind: 'on_quote' } },
]).concat(
  inBusiness<RateItem>('b_studio', [
    { id: 'r_consult', name: 'Conseil', aliases: ['conseil', 'consulting', 'call'], pricing: { kind: 'per_unit', unit: 'hour', amount: 9000 } },
    { id: 'r_shoot', name: 'Shooting photo (demi-journée)', aliases: ['shooting', 'shoot', 'demi-journée', 'photo shoot'], pricing: { kind: 'flat', amount: 45000 } },
  ]),
);

export const demoRateOptions: RateOption[] = inBusiness<RateOption>('b_317', [
  { id: 'o_thumb', name: 'Miniature', aliases: ['miniature', 'thumbnail'], kind: 'fixed', value: 3000 },
  { id: 'o_express', name: 'Livraison express', aliases: ['express', 'livraison express'], kind: 'percent', value: 30 },
  { id: 'o_rush', name: 'Urgence 24 h', aliases: ['rush', 'urgent'], kind: 'percent', value: 50 },
  { id: 'o_rights', name: 'Droits d’usage publicitaire', aliases: ['droits pub', 'droits publicitaires'], kind: 'percent', value: 20 },
]);

export function newBusiness(id: string): Business {
  return { ...emptyBusiness, id };
}

export const emptyBusiness: Business = {
  id: 'b_main',
  name: '',
  legalForm: '',
  address: '',
  email: '',
  country: 'FR',
  currency: 'EUR',
  vatRate: 0,
  legalNote: 'TVA non applicable, art. 293 B du CGI',
  paymentDetails: '',
  paymentTermsDays: 15,
  invoicePrefix: 'INV',
  volumeDiscounts: [],
  template: 'classic',
  accentColor: '#1F6F4A',
  invoiceLanguage: 'fr',
};

/** Everything the demo starts with: two companies, their rate cards, a few clients. */
export function demoWorkspace() {
  return {
    businesses: [demoBusiness, demoBusiness2],
    activeBusinessId: demoBusiness.id,
    clients: demoClients,
    rateItems: demoRateItems,
    rateOptions: demoRateOptions,
  };
}
