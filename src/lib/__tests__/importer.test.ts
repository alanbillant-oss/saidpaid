import { describe, expect, it } from 'vitest';
import { base64ToBytes, buildImport, classify, decodeCsvBytes, parseAmount, parseCsv, parseDate, toRows } from '../importer';
import { nextInvoiceNumber } from '../invoice';

let n = 0;
const newId = (p: string) => `${p}${++n}`;
const file = (csv: string) => {
  const rows = toRows(parseCsv(csv));
  return { kind: classify(Object.keys(rows[0] ?? {})), rows };
};

const CLIENTS = `﻿Raison sociale;Email;Adresse;Code postal;Ville;SIRET
"Chez Paul";paul@chezpaul.fr;"12 rue du Port";13002;Marseille;40483304800012
Studio Nova;sarah@nova.fr;;75011;Paris;
`;
const ITEMS = `Désignation;Prix unitaire HT;Unité
Montage vidéo court;"250,00 €";
Journée de tournage;"1 200,00";jour
`;
const INVOICES = `Numéro;Date;Client;Total HT;Total TTC;Statut
F2026-0011;14/10/2026;Chez Paul;390,00;390,00;Payée
F2026-0012;28/10/2026;Studio Nova;800,00;960,00;En attente
`;

describe('importer', () => {
  it('parses French CSV exports', () => {
    expect(parseCsv('a;b\n"x;y";"say ""hi"""\n')).toEqual([['a', 'b'], ['x;y', 'say "hi"']]);
    expect(parseAmount('1 234,50 €')).toBe(123450);
    expect(parseAmount('1,234.50')).toBe(123450);
    expect(parseDate('03/11/2026')).toBe('2026-11-03');
  });

  it('reads UTF-8 and Windows-1252 files', () => {
    expect(decodeCsvBytes(new TextEncoder().encode('Désignation;Prix'))).toBe('Désignation;Prix');
    expect(decodeCsvBytes(new Uint8Array([0x44, 0xe9, 0x80]))).toBe('Dé€');
    expect(decodeCsvBytes(base64ToBytes(btoa(String.fromCharCode(...new TextEncoder().encode('Échéance;Total €')))))).toBe('Échéance;Total €');
  });

  it('recognises each export from its columns', () => {
    expect([CLIENTS, ITEMS, INVOICES].map((c) => file(c).kind)).toEqual(['clients', 'items', 'invoices']);
    expect(file('foo;bar\n1;2').kind).toBe('unknown');
  });

  it('builds clients, items and invoices, and continues the numbering', () => {
    const out = buildImport([file(INVOICES), file(ITEMS), file(CLIENTS)], { clients: [], rateItems: [], invoices: [] }, 'b1', 'EUR', newId);
    expect(out.clients.map((c) => [c.name, c.siren, c.address])).toEqual([
      ['Chez Paul', '404833048', '12 rue du Port\n13002 Marseille'],
      ['Studio Nova', undefined, '75011 Paris'],
    ]);
    expect(out.rateItems.map((r) => r.pricing)).toEqual([
      { kind: 'flat', amount: 25000 },
      { kind: 'per_unit', unit: 'day', amount: 120000 },
    ]);
    expect(out.invoices.map((i) => [i.number, i.status, i.vatRate, i.clientId === out.clients[0].id])).toEqual([
      ['F2026-0011', 'paid', 0, true],
      ['F2026-0012', 'sent', 20, false],
    ]);
    expect(out.numberTemplate).toBe('F{year}-{seq:4}');
    expect(nextInvoiceNumber(out.invoices, 'SP', 2026, out.numberTemplate!)).toBe('F2026-0013');
    expect(nextInvoiceNumber(out.invoices, 'SP', 2027, out.numberTemplate!)).toBe('F2027-0001');
  });

  it('skips what is already there', () => {
    const first = buildImport([file(CLIENTS)], { clients: [], rateItems: [], invoices: [] }, 'b1', 'EUR', newId);
    const again = buildImport([file(CLIENTS)], { clients: first.clients, rateItems: [], invoices: [] }, 'b1', 'EUR', newId);
    expect(again.clients).toHaveLength(0);
    expect(again.skipped).toBe(2);
  });
});
