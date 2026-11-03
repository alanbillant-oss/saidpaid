import { describe, expect, it } from 'vitest';
import { resolveClient } from '../clients';
import { demoClients } from '../demo';

describe('resolveClient', () => {
  it('matches by name and alias, ignoring accents and case', () => {
    expect(resolveClient('chez paul', demoClients)).toMatchObject({ kind: 'exact', client: { id: 'c_paul' } });
    expect(resolveClient('le resto', demoClients)).toMatchObject({ kind: 'exact', client: { id: 'c_paul' } });
    expect(resolveClient('jeremy', demoClients)).toMatchObject({ kind: 'exact', client: { id: 'c_jeremy' } });
  });

  it('tolerates small transcription errors', () => {
    expect(resolveClient('Studio Novah', demoClients)).toMatchObject({ kind: 'exact', client: { id: 'c_nova' } });
  });

  it('trusts a valid suggested id', () => {
    expect(resolveClient('whatever', demoClients, 'c_nova')).toMatchObject({ kind: 'exact', client: { id: 'c_nova' } });
  });

  it('returns none for an unknown client', () => {
    expect(resolveClient('Acme Corp', demoClients).kind).toBe('none');
  });

  it('flags homonyms as ambiguous', () => {
    const clients = [...demoClients, { id: 'c_paul2', name: 'Paul Durand', aliases: ['Paul'] }];
    expect(resolveClient('Paul', clients).kind).toBe('ambiguous');
  });
});
