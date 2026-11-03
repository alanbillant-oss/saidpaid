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

export function toRows(table: string[][]): Row[] {
  const [header, ...body] = table;
  if (!header) return [];
  const keys = header.map((h) => normalize(h));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

// Column synonyms, already normalized (lowercase, no accents, no punctuation).
const COLS = {
  name: ['raison sociale', 'societe', 'entreprise', 'nom client', 'client', 'nom', 'company', 'name', 'denomination'],
  firstName: ['prenom', 'first name'],
  email: ['email', 'e mail', 'mail', 'adresse email', 'courriel'],
  address: ['adresse', 'adresse 1', 'adresse ligne 1', 'rue', 'address', 'address line 1'],
  address2: ['adresse 2', 'complement adresse', 'complement', 'address line 2'],
  zip: ['code postal', 'cp', 'postal code', 'zip'],
  city: ['ville', 'city', 'commune'],
  country: ['pays', 'country'],
  siren: ['siren', 'siret', 'n siret', 'numero siret', 'n siren'],
  vat: ['tva intracommunautaire', 'n tva intracommunautaire', 'numero tva', 'n tva', 'tva intra', 'vat number', 'vat'],
  itemName: ['designation', 'libelle', 'article', 'produit', 'prestation', 'description', 'intitule', 'item', 'product'],
  price: ['prix unitaire ht', 'prix ht', 'pu ht', 'prix unitaire', 'prix', 'tarif', 'unit price', 'price', 'montant ht'],
  unit: ['unite', 'unit'],
  number: ['numero', 'n facture', 'numero facture', 'facture', 'reference', 'invoice number', 'number', 'n'],
  date: ['date', 'date facture', 'date emission', 'date d emission', 'invoice date'],
  due: ['echeance', 'date echeance', 'date d echeance', 'due date'],
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
};

type Existing = { clients: Client[]; rateItems: RateItem[]; invoices: Invoice[] };

export function buildImport(
  files: { kind: FileKind; rows: Row[] }[],
  existing: Existing,
  businessId: string,
  currency: string,
  newId: (prefix: string) => string,
): ImportPreview {
  const out: ImportPreview = { clients: [], rateItems: [], invoices: [], numberTemplate: null, lastNumber: null, skipped: 0 };
  const knownClient = (name: string, siren?: string) =>
    [...existing.clients, ...out.clients].find((c) => (siren && c.siren === siren) || normalize(c.name) === normalize(name));

  // Clients first, so invoices can point at them.
  for (const f of files.filter((x) => x.kind === 'clients')) {
    const h = Object.keys(f.rows[0] ?? {});
    const col = (field: Col) => findColumn(h, field);
    for (const r of f.rows) {
      const get = (field: Col) => {
        const c = col(field);
        return c ? r[c] : '';
      };
      const name = [get('name'), get('name') ? '' : get('firstName')].filter(Boolean).join(' ').trim();
      if (!name) continue;
      const siren = get('siren').replace(/\D/g, '').slice(0, 9) || undefined;
      if (knownClient(name, siren)) {
        out.skipped++;
        continue;
      }
      const address = [get('address'), get('address2'), [get('zip'), get('city')].filter(Boolean).join(' '), get('country')]
        .filter(Boolean)
        .join('\n');
      out.clients.push({
        id: newId('c_'),
        name,
        aliases: [],
        email: get('email') || undefined,
        address: address || undefined,
        siren: siren && siren.length === 9 ? siren : undefined,
        vatNumber: get('vat') || undefined,
      });
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
        return c ? r[c] : '';
      };
      const number = get('number');
      const date = parseDate(get('date'));
      const ht = parseAmount(get('totalHt'));
      const ttc = parseAmount(get('totalTtc'));
      const net = ht ?? ttc;
      if (!number || !date || net == null) continue;
      if ([...existing.invoices, ...out.invoices].some((i) => i.businessId === businessId && i.number === number)) {
        out.skipped++;
        continue;
      }
      const clientName = get('name') || '—';
      let client = knownClient(clientName);
      if (!client) {
        client = { id: newId('c_'), name: clientName, aliases: [] };
        out.clients.push(client);
      }
      const vatRate = ht && ttc && ttc > ht ? Math.round(((ttc - ht) / ht) * 1000) / 10 : 0;
      const statusRaw = normalize(get('status'));
      const paid = /pay|regl|acquit|paid|oui|yes|^1$/.test(statusRaw) && !/non|impay|unpaid|attente|retard/.test(statusRaw);
      out.invoices.push({
        id: newId('i_'),
        businessId,
        number,
        clientId: client.id,
        issueDate: date,
        dueDate: parseDate(get('due')) ?? date,
        lines: [{ description: 'Facture importée', quantity: 1, unitPrice: net }],
        discountPercent: 0,
        vatRate,
        currency,
        status: paid ? 'paid' : 'sent',
      });
    }
  }

  const numbers = out.invoices.map((i) => ({ number: i.number as string, year: Number((i.issueDate ?? '').slice(0, 4)) }));
  out.numberTemplate = detectNumberTemplate(numbers);
  out.lastNumber =
    [...out.invoices].sort((a, b) => (a.issueDate ?? '').localeCompare(b.issueDate ?? '') || (a.number ?? '').localeCompare(b.number ?? '', undefined, { numeric: true })).at(-1)
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
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
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
