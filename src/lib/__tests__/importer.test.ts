import { describe, expect, it } from 'vitest';
import { base64ToBytes, buildImport, classify, decodeCsvBytes, parseAmount, parseCsv, parseDate, toRows } from '../importer';
import { detectNumberTemplate, nextInvoiceNumber } from '../invoice';

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
    expect(decodeCsvBytes(base64ToBytes('data:text/csv;base64,' + btoa('a;b')))).toBe('a;b');
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

  // Same columns as facture.net's exports (made-up data).
  const FN_COMPANIES = `Nom;Numéro d'entreprise;Code d'activité;Numéro de TVA;Adresse;Complément d'adresse;Code postal;Ville;Pays;Numéro(s) de téléphone;Email;Mots clés;Site internet;Notes;Langue
ACME STUDIO;404 833 048 00012;"";FR83404833048;1 rue de Paris;"";06000;NICE;France;"";"";"";"";"";Français
Lagon Bleu;"";"";"";2 rue du Port;"";97200;Fort-de-France;Martinique;"";"";"";"";"";Français
`;
  const FN_CONTACTS = `Prénom;Nom de famille;Société;Fonction;Adresse email;Adresse;Complément d'adresse;Code postal;Ville;Pays;Numéro(s) de téléphone;Mots clés;Date de création;Date de dernière facture;Notes;Langue
Marie;Durand;ACME STUDIO;CEO;marie@acme.example;"";"";06000;NICE;France;"";"";02/09/2026;;"";Français
Paul;Martin;;"";paul@example.com;"";"";75011;Paris;France;"";"";02/09/2026;;"";Français
`;
  const FN_INVOICES = `Nature;Numéro;Client;Société;Montant HT;Montant TVA;Débours;Montant TTC;Devise;Date;Encaissé le;Conditions de règlement;Mode de règlement;Intérêts de retard;Statut;Mots clés
Facture;F2600003;Marie Durand;ACME STUDIO;1590,0;0,0;0,0;1590,0;€;07/07/2026;;30 jours;Virement bancaire;;Finalisé;""
Facture;F2600002;Marie Durand;ACME STUDIO;1590,0;0,0;0,0;1590,0;€;07/07/2026;;30 jours;Virement bancaire;;Rectifié;""
Facture;F2600001;Paul Martin;;390,0;0,0;0,0;390,0;€;27/06/2026;28/06/2026;45 jours fin de mois;Virement bancaire;;Finalisé;""
Facture;Provisoire;Paul Martin;;112,5;0,0;0,0;112,5;€;;;30 jours;Virement bancaire;;Provisoire;""
Facture;F2500009;;Lagon Bleu;250,0;0,0;0,0;250,0;€;20/12/2025;;30 jours;Virement bancaire;;Finalisé;""
Total Euro;;;;3932,5;0,0;0,0;3932,5;€;;;;;;;
`;

  it('imports facture.net exports: companies, contacts, corrected invoices, drafts and F26xxxxx numbers', () => {
    const files = [file(FN_CONTACTS), file(FN_COMPANIES), file(FN_INVOICES)];
    expect(files.map((f) => f.kind)).toEqual(['clients', 'clients', 'invoices']);
    const out = buildImport(files, { clients: [], rateItems: [], invoices: [] }, 'b1', 'EUR', newId);
    expect(out.clients.map((c) => [c.name, c.siren, c.email, c.aliases])).toEqual([
      ['ACME STUDIO', '404833048', 'marie@acme.example', []],
      ['Lagon Bleu', undefined, undefined, []],
      ['Paul Martin', undefined, 'paul@example.com', []],
    ]);
    expect(out.clients[1].address).toBe('2 rue du Port\n97200 Fort-de-France\nMartinique');
    const acme = out.clients[0].id;
    expect(out.invoices.map((i) => [i.number, i.status, i.clientId === acme])).toEqual([
      ['F2600003', 'sent', true],
      ['F2600002', 'void', true],
      ['F2600001', 'paid', false],
      [null, 'draft', false],
      ['F2500009', 'sent', false],
    ]);
    expect(out.invoices[2].dueDate).toBe('2026-08-31'); // 45 jours fin de mois
    expect([out.drafts, out.voided]).toEqual([1, 1]);
    expect(out.numberTemplate).toBe('F{yy}{seq:5}');
    expect(out.lastNumber).toBe('F2600003');
    expect(nextInvoiceNumber(out.invoices, 'F', 2026, out.numberTemplate!)).toBe('F2600004');
    expect(nextInvoiceNumber(out.invoices, 'F', 2027, out.numberTemplate!)).toBe('F2700001');
    const paid = buildImport(files, { clients: [], rateItems: [], invoices: [] }, 'b1', 'EUR', newId, { unpaidAsPaid: true });
    expect(paid.invoices.map((i) => i.status)).toEqual(['paid', 'void', 'paid', 'draft', 'paid']);
  });

  it('detects the usual numbering patterns', () => {
    expect(detectNumberTemplate([{ number: 'SP-2026-0007', year: 2026 }])).toBe('SP-{year}-{seq:4}');
    expect(detectNumberTemplate([{ number: 'F2600038', year: 2026 }])).toBe('F{yy}{seq:5}');
    expect(detectNumberTemplate([{ number: 'INV-12', year: 2026 }])).toBe('INV-{seq:2}');
  });
});
