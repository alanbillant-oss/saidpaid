import { describe, expect, it } from 'vitest';
import { frenchVatNumber, parseRegistryResults } from '../registry';

describe('registry', () => {
  it('computes the French VAT number from the SIREN', () => {
    // Published example: SIREN 404833048 -> FR83404833048
    expect(frenchVatNumber('404833048')).toBe('FR83404833048');
  });

  it('parses API results and drops malformed rows', () => {
    const rows = parseRegistryResults({
      results: [
        { siren: '404833048', nom_complet: 'EXEMPLE SAS', etat_administratif: 'A', siege: { adresse: '1 RUE DE PARIS 75001 PARIS' } },
        { siren: '12', nom_complet: 'BAD' },
        { siren: '552100554', nom_raison_sociale: 'FERMEE', etat_administratif: 'C' },
      ],
    });
    expect(rows).toEqual([
      { siren: '404833048', name: 'EXEMPLE SAS', address: '1 RUE DE PARIS 75001 PARIS', vatNumber: 'FR83404833048', activity: undefined, active: true },
      { siren: '552100554', name: 'FERMEE', address: '', vatNumber: frenchVatNumber('552100554'), activity: undefined, active: false },
    ]);
  });
});
