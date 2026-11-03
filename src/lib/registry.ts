/**
 * Company lookup in the official French registry (API Recherche d'entreprises, data from INSEE
 * Sirene). Free, no API key: https://recherche-entreprises.api.gouv.fr
 */

export type RegistryCompany = {
  siren: string;
  name: string;
  address: string;
  vatNumber: string;
  activity?: string;
  active: boolean;
};

/** French intra-EU VAT number derived from the SIREN: FR + 2-digit key + SIREN. */
export function frenchVatNumber(siren: string): string {
  const n = Number(siren);
  const key = (12 + 3 * (n % 97)) % 97;
  return `FR${String(key).padStart(2, '0')}${siren}`;
}

type ApiResult = {
  siren: string;
  nom_complet?: string;
  nom_raison_sociale?: string;
  etat_administratif?: string;
  activite_principale?: string;
  siege?: { adresse?: string; geo_adresse?: string; etat_administratif?: string };
};

export function parseRegistryResults(json: unknown): RegistryCompany[] {
  const results = ((json as { results?: ApiResult[] })?.results ?? []).filter((r) => /^\d{9}$/.test(r.siren ?? ''));
  return results.map((r) => ({
    siren: r.siren,
    name: r.nom_complet || r.nom_raison_sociale || r.siren,
    address: r.siege?.adresse || r.siege?.geo_adresse || '',
    vatNumber: frenchVatNumber(r.siren),
    activity: r.activite_principale,
    active: (r.etat_administratif ?? r.siege?.etat_administratif ?? 'A') === 'A',
  }));
}

export async function searchCompanies(query: string, signal?: AbortSignal): Promise<RegistryCompany[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&per_page=8`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (res.status === 429) throw new Error('rate_limited');
  if (!res.ok) throw new Error(`registry_${res.status}`);
  return parseRegistryResults(await res.json());
}
