import { normalize } from './clients';
import { detectNumberTemplate } from './invoice';
import type { Client, Invoice, RateItem } from './types';

/**
 * Import from facture.net (or any invoicing tool / spreadsheet) through CSV exports.
 * Each file is recognised from its column headers as clients, items or invoices; columns are
 * matched by their usual French and English names, so the exact export layout does not matter.
 */

export type Row = Record<string, string>;
export type FileKind = 'clients' | 'items' | 'invoices' | 'unknown';

/** RFC 4180-ish CSV parser: quotes, escaped quotes, newlines in quotes, BOM, ; , or tab separators. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = [';', '\t', ','].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

/** Column header -> lowercase words without accents or punctuation ("Encaissé le" -> "encaisse le"). */
export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toRows(table: string[][]): Row[] {
  const [header, ...body] = table;
  if (!header) return [];
  const keys = header.map(normalizeHeader);
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

// Column synonyms, already normalized (lowercase, no accents, no punctuation).
const COLS = {
  name: ['raison sociale', 'societe', 'entreprise', 'nom client', 'client', 'nom', 'company', 'name', 'denomination'],
  company: ['societe', 'raison sociale', 'entreprise', 'company', 'denomination'],
  contact: ['client', 'nom client', 'contact', 'customer'],
  firstName: ['prenom', 'first name'],
  lastName: ['nom de famille', 'last name', 'surname'],
  email: ['email', 'e mail', 'mail', 'adresse email', 'adresse e mail', 'courriel'],
  address: ['adresse', 'adresse 1', 'adresse ligne 1', 'rue', 'address', 'address line 1'],
  address2: ['complement d adresse', 'adresse 2', 'complement adresse', 'complement', 'address line 2'],
  zip: ['code postal', 'cp', 'postal code', 'zip'],
  city: ['ville', 'city', 'commune'],
  country: ['pays', 'country'],
  siren: ['siren', 'siret', 'n siret', 'numero siret', 'n siren', 'numero d entreprise', 'company number'],
  vat: ['numero de tva', 'tva intracommunautaire', 'n tva intracommunautaire', 'numero tva', 'n tva', 'tva intra', 'vat number', 'vat'],
  itemName: ['designation', 'libelle', 'article', 'produit', 'prestation', 'description', 'intitule', 'item', 'product'],
  price: ['prix unitaire ht', 'prix ht', 'pu ht', 'prix unitaire', 'prix', 'tarif', 'unit price', 'price', 'montant ht'],
  unit: ['unite', 'unit'],
  nature: ['nature', 'type'],
  number: ['numero', 'n facture', 'numero facture', 'facture', 'reference', 'invoice number', 'number', 'n'],
  date: ['date', 'date facture', 'date emission', 'date d emission', 'invoice date'],
  due: ['echeance', 'date echeance', 'date d echeance', 'due date'],
  terms: ['conditions de reglement', 'conditions de paiement', 'payment terms'],
  paidOn: ['encaisse le', 'date d encaissement', 'date de paiement', 'paye le', 'paid on'],
  totalHt: ['total ht', 'montant ht', 'ht', 'net', 'subtotal'],
  totalTtc: ['total ttc', 'montant ttc', 'ttc', 'total'],
  status: ['statut', 'etat', 'status', 'payee', 'paye', 'reglee'],
} as const;

type Col = keyof typeof COLS;

/** Header in this file for a field, matching exact synonyms first, then a header that starts with one. */
export function findColumn(headers: string[], field: Col): string | undefined {
  const syn = COLS[field] as readonly string[];
  return headers.find((h) => syn.includes(h)) ?? headers.find((h) => syn.some((s) => s.length > 3 && h.startsWith(s)));
}

export function classify(headers: string[]): FileKind {
  const has = (f: Col) => !!findColumn(headers, f);
  if (has('number') && has('date') && (has('totalHt') || has('totalTtc'))) return 'invoices';
  if (has('itemName') && has('price')) return 'items';
  if (has('name') && (has('email') || has('address') || has('siren') || has('city'))) return 'clients';
  return 'unknown';
}

/** "1 234,50 €" / "1234.50" / "1,234.50" -> minor units. */
export function parseAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d,.-]/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** "03/11/2026", "2026-11-03", "3.11.26" -> "2026-11-03". */
export function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

const UNIT_MAP: Record<string, RateItem['pricing'] extends infer P ? (P extends { unit: infer U } ? U : never) : never> = {
  heure: 'hour', h: 'hour', hour: 'hour', jour: 'day', j: 'day', day: 'day', journee: 'day', minute: 'minute', min: 'minute',
};

export type ImportPreview = {
  clients: Client[];
  rateItems: RateItem[];
  invoices: Invoice[];
  /** Numbering pattern to continue, detected from the imported invoice numbers. */
  numberTemplate: string | null;
  lastNumber: string | null;
  skipped: number;
  /** Unnumbered drafts ("provisoire") imported as drafts. */
  drafts: number;
  /** Corrected or cancelled invoices: kept for their number, left out of the totals. */
  voided: number;
};

type Existing = { clients: Client[]; rateItems: RateItem[]; invoices: Invoice[] };

export type ImportOptions = {
  /** Most tools (facture.net included) leave "paid on" empty when payments are not tracked there. */
  unpaidAsPaid?: boolean;
};

/** "30 jours", "45 jours fin de mois", "à réception" -> due date. */
export function dueDateFrom(issue: string, terms: string): string {
  const t = normalize(terms);
  const days = Number(t.match(/(\d+)\s*j/)?.[1] ?? t.match(/(\d+)/)?.[1] ?? 0);
  const d = new Date(issue + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  if (/fin de mois|end of month/.test(t)) d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

const NOT_FR = (country: string) => !!country && !/^(france|fr)$/i.test(country.trim());

export function buildImport(
  files: { kind: FileKind; rows: Row[] }[],
  existing: Existing,
  businessId: string,
  currency: string,
  newId: (prefix: string) => string,
  options: ImportOptions = {},
): ImportPreview {
  const out: ImportPreview = { clients: [], rateItems: [], invoices: [], numberTemplate: null, lastNumber: null, skipped: 0, drafts: 0, voided: 0 };
  const knownClient = (name: string, siren?: string) =>
    [...existing.clients, ...out.clients].find((c) => (siren && c.siren === siren) || normalize(c.name) === normalize(name));

  // Clients first, so invoices can point at them. Files with company numbers go first, so a
  // contact file (people, with the company they work for) only adds what is missing.
  const clientFiles = files
    .filter((x) => x.kind === 'clients')
    .sort((a, b) => Number(!!findColumn(Object.keys(b.rows[0] ?? {}), 'siren')) - Number(!!findColumn(Object.keys(a.rows[0] ?? {}), 'siren')));
  for (const f of clientFiles) {
    const h = Object.keys(f.rows[0] ?? {});
    const col = (field: Col) => findColumn(h, field);
    for (const r of f.rows) {
      const get = (field: Col) => {
        const c = col(field);
        return c ? (r[c] ?? '').trim() : '';
      };
      const person = [get('firstName'), get('lastName')].filter(Boolean).join(' ');
      const name = (get('company') || get('name') || person).trim();
      if (!name) continue;
      const digits = get('siren').replace(/\D/g, '');
      const siren = digits.length >= 9 ? digits.slice(0, 9) : undefined;
      const country = get('country');
      const address = [get('address'), get('address2'), [get('zip'), get('city')].filter(Boolean).join(' '), NOT_FR(country) ? country : '']
        .filter(Boolean)
        .join('\n');
      const email = get('email') || undefined;
      const vatNumber = get('vat').replace(/\s/g, '') || undefined;

      const fresh = out.clients.find((c) => (siren && c.siren === siren) || normalize(c.name) === normalize(name));
      if (fresh) {
        // Same client seen again in this import (company + its contact): fill the gaps.
        Object.assign(fresh, {
          email: fresh.email ?? email,
          address: fresh.address ?? (address || undefined),
          siren: fresh.siren ?? siren,
          vatNumber: fresh.vatNumber ?? vatNumber,
        });
        continue;
      }
      if (knownClient(name, siren)) {
        out.skipped++;
        continue;
      }
      out.clients.push({ id: newId('c_'), name, aliases: person && person !== name ? [person] : [], email, address: address || undefined, siren, vatNumber });
    }
  }

  for (const f of files.filter((x) => x.kind === 'items')) {
    const h = Object.keys(f.rows[0] ?? {});
    const nameCol = findColumn(h, 'itemName');
    const priceCol = findColumn(h, 'price');
    const unitCol = findColumn(h, 'unit');
    for (const r of f.rows) {
      const name = nameCol ? r[nameCol] : '';
      const amount = parseAmount(priceCol ? r[priceCol] : '');
      if (!name || amount == null) continue;
      if ([...existing.rateItems, ...out.rateItems].some((x) => x.businessId === businessId && normalize(x.name) === normalize(name))) {
        out.skipped++;
        continue;
      }
      const unit = unitCol ? UNIT_MAP[normalize(r[unitCol] ?? '')] : undefined;
      out.rateItems.push({
        id: newId('r_'),
        businessId,
        name,
        aliases: [],
        pricing: unit ? { kind: 'per_unit', unit, amount } : { kind: 'flat', amount },
      });
    }
  }

  for (const f of files.filter((x) => x.kind === 'invoices')) {
    const h = Object.keys(f.rows[0] ?? {});
    const col = (field: Col) => findColumn(h, field);
    for (const r of f.rows) {
      const get = (field: Col) => {
        const c = col(field);
        return c ? (r[c] ?? '').trim() : '';
      };
      const nature = normalize(get('nature'));
      if (nature && !/facture|invoice/.test(nature)) {
        // Credit notes and quotes have their own numbering: not imported as invoices.
        if (/avoir|credit/.test(nature)) out.skipped++;
        continue;
      }
      const statusRaw = normalize(get('status'));
      const isDraft = /provisoire|brouillon|draft/.test(statusRaw) || normalize(get('number')) === 'provisoire';
      const number = isDraft ? null : get('number');
      const date = parseDate(get('date'));
      const ht = parseAmount(get('totalHt'));
      const ttc = parseAmount(get('totalTtc'));
      const net = ht ?? ttc;
      if (net == null || (!isDraft && (!number || !date))) continue;

      const clientName = get('company') || get('contact') || get('name') || '—';
      let client = knownClient(clientName);
      if (!client) {
        client = { id: newId('c_'), name: clientName, aliases: [] };
        out.clients.push(client);
      }
      const clientId = client.id;
      const duplicate = [...existing.invoices, ...out.invoices].some((i) =>
        i.businessId !== businessId
          ? false
          : number
            ? i.number === number
            : i.status === 'draft' && i.clientId === clientId && i.lines[0]?.unitPrice === net && i.lines[0]?.description === 'Facture importée',
      );
      if (duplicate) {
        out.skipped++;
        continue;
      }
      const vatRate = ht && ttc && ttc > ht ? Math.round(((ttc - ht) / ht) * 1000) / 10 : 0;
      const paidOn = parseDate(get('paidOn'));
      const voided = /rectifi|annul|cancel|void/.test(statusRaw);
      const paidWord = /pay|regl|acquit|paid|encaiss/.test(statusRaw) && !/non|impay|unpaid|attente|retard/.test(statusRaw);
      const status: Invoice['status'] = isDraft ? 'draft' : voided ? 'void' : paidOn || paidWord || options.unpaidAsPaid ? 'paid' : 'sent';
      if (isDraft) out.drafts++;
      if (voided) out.voided++;
      out.invoices.push({
        id: newId('i_'),
        businessId,
        number,
        clientId,
        issueDate: isDraft ? null : date,
        dueDate: isDraft ? null : parseDate(get('due')) ?? (get('terms') && date ? dueDateFrom(date, get('terms')) : date),
        lines: [{ description: 'Facture importée', quantity: 1, unitPrice: net }],
        discountPercent: 0,
        vatRate,
        currency,
        status,
      });
    }
  }

  const numbered = out.invoices.filter((i) => i.number);
  const numbers = numbered.map((i) => ({ number: i.number as string, year: Number((i.issueDate ?? '').slice(0, 4)) }));
  out.numberTemplate = detectNumberTemplate(numbers);
  out.lastNumber =
    [...numbered].sort((a, b) => (a.issueDate ?? '').localeCompare(b.issueDate ?? '') || (a.number ?? '').localeCompare(b.number ?? '', undefined, { numeric: true })).at(-1)
      ?.number ?? null;
  return out;
}

const CP1252_HIGH: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ',
  0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›',
  0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

/** CSV bytes to text. Excel on Windows still saves French CSV in Windows-1252, so fall back to it when the bytes are not UTF-8. */
export function decodeCsvBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    let out = '';
    for (const b of bytes) out += b >= 0x80 && b <= 0x9f ? (CP1252_HIGH[b] ?? '') : String.fromCharCode(b);
    return out;
  }
}

export function base64ToBytes(b64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  // Some pickers hand back a data URL ("data:text/csv;base64,...") instead of bare base64.
  const clean = b64.replace(/^data:[^,]*,/, '').replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (chars.indexOf(clean[i]) << 18) | (chars.indexOf(clean[i + 1]) << 12) | ((chars.indexOf(clean[i + 2]) & 63) << 6) | (chars.indexOf(clean[i + 3]) & 63);
    out[o++] = (n >> 16) & 255;
    if (i + 2 < clean.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < clean.length) out[o++] = n & 255;
  }
  return out.slice(0, o);
}
