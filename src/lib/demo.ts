import type { Business, Client, RateItem, RateOption } from './types';

/**
 * Demo workspace built from the real 317 LAB rate cards described in BRIEF.md.
 * Useful to try the app end to end and as fixtures for the pricing tests.
 */

export const demoBusiness: Business = {
  name: '317 LAB',
  address: 'Bangkok, Thailand',
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
};

export const demoClients: Client[] = [
  { id: 'c_paul', name: 'Chez Paul', aliases: ['Paul', 'le resto'], email: 'paul@chezpaul.example' },
  { id: 'c_jeremy', name: 'Jérémy Martin', aliases: ['Jérémy', 'Jeremy'], email: 'jeremy@example.com' },
  { id: 'c_nova', name: 'Studio Nova', aliases: ['Nova'], email: 'sarah@studionova.example' },
];

export const demoRateItems: RateItem[] = [
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
    name: 'Poster',
    aliases: ['affiche'],
    pricing: { kind: 'flat', amount: 15000 },
    clientPricing: { c_paul: { kind: 'flat', amount: 12000 } },
  },
  { id: 'r_edit', name: 'Small revision', aliases: ['modif', 'petite modif', 'retouche'], pricing: { kind: 'flat', amount: 3000 } },
  { id: 'r_day', name: 'Editing day', aliases: ['jour de montage', 'journée'], pricing: { kind: 'per_unit', unit: 'day', amount: 30000 } },
  { id: 'r_brand', name: 'Brand identity', aliases: ['logo + charte', 'identité visuelle'], pricing: { kind: 'on_quote' } },
];

export const demoRateOptions: RateOption[] = [
  { id: 'o_thumb', name: 'Thumbnail', aliases: ['miniature'], kind: 'fixed', value: 3000 },
  { id: 'o_express', name: 'Express delivery', aliases: ['express', 'livraison express'], kind: 'percent', value: 30 },
  { id: 'o_rush', name: '24h rush', aliases: ['rush', 'urgent'], kind: 'percent', value: 50 },
  { id: 'o_rights', name: 'Ad usage rights', aliases: ['droits pub'], kind: 'percent', value: 20 },
];

export const emptyBusiness: Business = {
  name: '',
  address: '',
  email: '',
  country: 'GB',
  currency: 'GBP',
  vatRate: 0,
  legalNote: 'Not VAT registered.',
  paymentDetails: '',
  paymentTermsDays: 15,
  invoicePrefix: 'INV',
  volumeDiscounts: [],
};
