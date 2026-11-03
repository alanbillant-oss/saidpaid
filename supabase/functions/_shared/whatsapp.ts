// Pure helpers for the WhatsApp Business Cloud API (Meta). No Deno-only imports, so the
// unit tests can run them under Node (see whatsapp.test.ts).

export type IncomingMessage =
  | { id: string; from: string; name: string | null; kind: 'text'; text: string }
  | { id: string; from: string; name: string | null; kind: 'audio'; mediaId: string; mimeType: string }
  | { id: string; from: string; name: string | null; kind: 'other' };

/** Extract the user messages from a webhook payload, ignoring delivery/read statuses. */
export function parseWebhook(payload: unknown, phoneNumberId?: string): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  // deno-lint-ignore no-explicit-any
  const entries: any[] = Array.isArray((payload as any)?.entry) ? (payload as any).entry : [];
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      if (change?.field !== 'messages' || !value) continue;
      // One Meta app can serve several numbers: only handle ours.
      if (phoneNumberId && value.metadata?.phone_number_id !== phoneNumberId) continue;
      const names = new Map<string, string>(
        (value.contacts ?? []).map((c: { wa_id: string; profile?: { name?: string } }) => [c.wa_id, c.profile?.name ?? '']),
      );
      for (const m of value.messages ?? []) {
        if (!m?.id || !m?.from) continue;
        const base = { id: String(m.id), from: String(m.from), name: names.get(m.from) || null };
        if (m.type === 'text' && typeof m.text?.body === 'string') {
          out.push({ ...base, kind: 'text', text: m.text.body });
        } else if (m.type === 'audio' && m.audio?.id) {
          out.push({ ...base, kind: 'audio', mediaId: String(m.audio.id), mimeType: m.audio.mime_type ?? 'audio/ogg' });
        } else {
          out.push({ ...base, kind: 'other' });
        }
      }
    }
  }
  return out;
}

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Meta signs every webhook body with the app secret: header `X-Hub-Signature-256: sha256=<hex>`. */
export async function verifySignature(rawBody: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header?.startsWith('sha256=')) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = toHex(await crypto.subtle.sign('HMAC', key, enc.encode(rawBody)));
  const given = header.slice('sha256='.length).toLowerCase();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

// No 0/O/1/I so the code survives being read out or retyped.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PAIR_CODE_LENGTH = 6;

/** A code looks like "SP-K7M3QX" and always holds a digit, so ordinary words never match. */
export function newPairCode(): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(PAIR_CODE_LENGTH));
    const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    if (/[0-9]/.test(code)) return code;
  }
}

/** Finds a pairing code in a message like "Saidpaid code SP-K7M3QX" and returns "K7M3QX". */
export function findPairCode(text: string): string | null {
  const re = new RegExp(`(?:^|[^A-Z0-9])SP-?([${CODE_ALPHABET}]{${PAIR_CODE_LENGTH}})(?![A-Z0-9])`, 'g');
  for (const m of text.toUpperCase().matchAll(re)) if (/[0-9]/.test(m[1])) return m[1];
  return null;
}

// ---------- Replies ----------

export type Lang = 'fr' | 'en';

type ReplyItem = {
  client_spoken_name: string;
  client_id: string | null;
  description: string;
  quantity: number | null;
  spoken_price: number | null;
  spoken_price_is_per_unit: boolean;
  ambiguity: string | null;
};

const T = {
  fr: {
    linked: "C'est branché ✅ Envoie-moi un vocal ou un message avec tes missions, je prépare les factures dans Saidpaid.",
    badCode: "Ce code n'est pas bon ou a expiré. Dans l'app : Settings → WhatsApp → Connect, puis renvoie le nouveau code.",
    notLinked:
      "Salut ! Ce numéro n'est pas encore relié à Saidpaid. Dans l'app : Settings → WhatsApp → Connect, puis envoie-moi le code affiché.",
    unsupported: "Je ne lis que les messages texte et les vocaux pour l'instant 🙏",
    nothing: "Je n'ai pas entendu de mission à facturer dans celui-là. Dis-moi le client et ce que tu as fait.",
    error: "Oups, je n'ai pas réussi à traiter ce message. Réessaie dans un instant.",
    tooLong: 'Vocal trop long, coupe-le en plusieurs morceaux stp.',
    noted: (n: number) => (n === 1 ? 'Noté ✅ 1 mission :' : `Noté ✅ ${n} missions :`),
    newClient: 'nouveau client',
    footer: "Ouvre Saidpaid pour voir les prix et valider la facture.",
  },
  en: {
    linked: "You're connected ✅ Send me a voice note or a message with your jobs and I'll draft the invoices in Saidpaid.",
    badCode: 'That code is wrong or has expired. In the app: Settings → WhatsApp → Connect, then send the new code.',
    notLinked: "Hi! This number isn't linked to Saidpaid yet. In the app: Settings → WhatsApp → Connect, then send me the code shown.",
    unsupported: 'I can only read text messages and voice notes for now 🙏',
    nothing: "I didn't hear any billable job in that one. Tell me the client and what you did.",
    error: "Sorry, I couldn't process that message. Try again in a moment.",
    tooLong: 'That voice note is too long, please split it.',
    noted: (n: number) => (n === 1 ? 'Got it ✅ 1 job:' : `Got it ✅ ${n} jobs:`),
    newClient: 'new client',
    footer: 'Open Saidpaid to check the prices and approve the invoice.',
  },
} as const;

export type ReplyKey = 'linked' | 'badCode' | 'notLinked' | 'unsupported' | 'nothing' | 'error' | 'tooLong';

export const reply = (lang: Lang, key: ReplyKey): string => T[lang][key];

/**
 * Short summary sent back after a capture. Prices only appear when the freelancer said them:
 * rate card prices are computed by the app (src/lib/pricing.ts), the single source of truth.
 */
export function formatSummary(items: ReplyItem[], clients: { id: string; name: string }[], currency: string, lang: Lang): string {
  const t = T[lang];
  if (!items.length) return t.nothing;
  const money = (n: number) => {
    try {
      return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { style: 'currency', currency }).format(n);
    } catch {
      return `${n} ${currency}`;
    }
  };
  const lines = items.map((it) => {
    const known = it.client_id ? clients.find((c) => c.id === it.client_id)?.name : null;
    const client = known ?? `${it.client_spoken_name || '?'} (${t.newClient})`;
    const qty = it.quantity && it.quantity !== 1 ? ` ×${it.quantity}` : '';
    const price = it.spoken_price != null ? ` · ${money(it.spoken_price)}${it.spoken_price_is_per_unit ? '/u' : ''}` : '';
    return `• ${client} : ${it.description}${qty}${price}`;
  });
  const doubts = items.flatMap((it) => (it.ambiguity ? [`⚠️ ${it.ambiguity}`] : []));
  return [t.noted(items.length), ...lines, ...doubts, '', t.footer].join('\n');
}
