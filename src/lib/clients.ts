import type { Client } from './types';

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(chez|the|le|la|les|studio)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export type ClientMatch =
  | { kind: 'exact'; client: Client }
  | { kind: 'ambiguous'; candidates: Client[] }
  | { kind: 'none' };

/**
 * Resolve a spoken client name: exact name, then alias, then fuzzy.
 * Deterministic on purpose: the model suggests, the code decides.
 */
export function resolveClient(spoken: string, clients: Client[], suggestedId?: string | null): ClientMatch {
  if (suggestedId) {
    const c = clients.find((x) => x.id === suggestedId);
    if (c) return { kind: 'exact', client: c };
  }
  const target = normalize(spoken);
  if (!target) return { kind: 'none' };

  const exact = clients.filter((c) => [c.name, ...c.aliases].some((n) => normalize(n) === target));
  if (exact.length === 1) return { kind: 'exact', client: exact[0] };
  if (exact.length > 1) return { kind: 'ambiguous', candidates: exact };

  const scored = clients
    .map((c) => {
      const names = [c.name, ...c.aliases].map(normalize);
      const best = Math.min(
        ...names.map((n) => {
          if (n.includes(target) || target.includes(n)) return 0.1;
          return levenshtein(n, target) / Math.max(n.length, target.length);
        }),
      );
      return { c, best };
    })
    .filter((s) => s.best <= 0.3)
    .sort((a, b) => a.best - b.best);

  if (scored.length === 0) return { kind: 'none' };
  if (scored.length === 1 || scored[1].best - scored[0].best > 0.15) return { kind: 'exact', client: scored[0].c };
  return { kind: 'ambiguous', candidates: scored.map((s) => s.c) };
}
