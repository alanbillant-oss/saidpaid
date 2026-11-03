// WhatsApp webhook (Meta WhatsApp Business Cloud API).
//   GET  /functions/v1/whatsapp  -> webhook verification handshake (hub.challenge)
//   POST /functions/v1/whatsapp  -> incoming messages, signed with the Meta app secret
//
// Flow: voice note or text -> Deepgram (voice) -> Claude extraction with the context the app
// pushed -> stored in whatsapp_inbox -> short reply on WhatsApp. The app then pulls the inbox
// (whatsapp-link function) and prices the missions with its own rate card.
//
// Deployed with verify_jwt = false (Meta cannot send a Supabase JWT): the HMAC signature is the auth.
import Anthropic from 'npm:@anthropic-ai/sdk@0.133.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { type CaptureContext, extractItems } from '../_shared/extract.ts';
import { transcribe } from '../_shared/transcribe.ts';
import {
  findPairCode,
  formatSummary,
  type IncomingMessage,
  type Lang,
  parseWebhook,
  reply,
  verifySignature,
} from '../_shared/whatsapp.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const GRAPH = `https://graph.facebook.com/${env('WHATSAPP_GRAPH_VERSION') || 'v23.0'}`;
const PHONE_NUMBER_ID = env('WHATSAPP_PHONE_NUMBER_ID');
const ACCESS_TOKEN = env('WHATSAPP_ACCESS_TOKEN');
const LANG: Lang = env('WHATSAPP_REPLY_LANG') === 'en' ? 'en' : 'fr';
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

async function send(to: string, body: string) {
  const res = await fetch(`${GRAPH}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: body.slice(0, 4096) } }),
  });
  if (!res.ok) console.error('WhatsApp send failed', res.status, await res.text());
}

async function downloadMedia(mediaId: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; mimeType: string }> {
  const auth = { Authorization: `Bearer ${ACCESS_TOKEN}` };
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: auth });
  if (!meta.ok) throw new Error(`Media lookup failed (${meta.status})`);
  const info = (await meta.json()) as { url: string; mime_type?: string; file_size?: number };
  if (info.file_size && info.file_size > MAX_AUDIO_BYTES) throw new Error('too_long');
  const file = await fetch(info.url, { headers: auth });
  if (!file.ok) throw new Error(`Media download failed (${file.status})`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_AUDIO_BYTES) throw new Error('too_long');
  return { bytes, mimeType: (info.mime_type ?? 'audio/ogg').split(';')[0] };
}

async function tryPair(msg: IncomingMessage): Promise<boolean> {
  if (msg.kind !== 'text') return false;
  const code = findPairCode(msg.text);
  if (!code) return false;
  const { data: link } = await db
    .from('whatsapp_links')
    .select('id, pair_code_expires_at')
    .eq('pair_code', code)
    .maybeSingle();
  if (!link || !link.pair_code_expires_at || new Date(link.pair_code_expires_at) < new Date()) {
    await send(msg.from, reply(LANG, 'badCode'));
    return true;
  }
  // A WhatsApp number belongs to one phone at a time: free it from any previous link.
  await db.from('whatsapp_links').update({ wa_id: null }).eq('wa_id', msg.from);
  await db
    .from('whatsapp_links')
    .update({ wa_id: msg.from, pair_code: null, pair_code_expires_at: null, linked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', link.id);
  await send(msg.from, reply(LANG, 'linked'));
  return true;
}

async function handle(msg: IncomingMessage) {
  const { data: link } = await db.from('whatsapp_links').select('id, context').eq('wa_id', msg.from).maybeSingle();

  if (!link) {
    if (!(await tryPair(msg))) await send(msg.from, reply(LANG, 'notLinked'));
    return;
  }
  if (msg.kind === 'other') return send(msg.from, reply(LANG, 'unsupported'));
  if (await tryPair(msg)) return; // re-linking from the same number

  // Claim the message first: Meta retries webhooks, this keeps processing idempotent.
  const { data: row, error: claimError } = await db
    .from('whatsapp_inbox')
    .insert({ link_id: link.id, wa_message_id: msg.id, kind: msg.kind })
    .select('id')
    .single();
  if (claimError || !row) return; // already processed (unique wa_message_id)

  try {
    let transcript = msg.kind === 'text' ? msg.text.trim() : '';
    if (msg.kind === 'audio') {
      const { bytes, mimeType } = await downloadMedia(msg.mediaId);
      transcript = await transcribe(bytes, mimeType, env('DEEPGRAM_API_KEY'));
    }
    const ctx = (link.context ?? null) as CaptureContext | null;
    const context: CaptureContext = {
      today: new Date().toISOString().slice(0, 10),
      currency: ctx?.currency ?? 'GBP',
      clients: ctx?.clients ?? [],
      rateItems: ctx?.rateItems ?? [],
      rateOptions: ctx?.rateOptions ?? [],
      recentMissions: ctx?.recentMissions ?? [],
    };
    const items = transcript ? await extractItems(new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') }), transcript, context) : [];
    await db.from('whatsapp_inbox').update({ transcript, items }).eq('id', row.id);
    // deno-lint-ignore no-explicit-any
    await send(msg.from, formatSummary(items as any[], context.clients, context.currency, LANG));
  } catch (err) {
    console.error(err);
    const tooLong = err instanceof Error && err.message === 'too_long';
    await db.from('whatsapp_inbox').update({ error: err instanceof Error ? err.message : String(err) }).eq('id', row.id);
    await send(msg.from, reply(LANG, tooLong ? 'tooLong' : 'error'));
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const ok =
      url.searchParams.get('hub.mode') === 'subscribe' &&
      !!env('WHATSAPP_VERIFY_TOKEN') &&
      url.searchParams.get('hub.verify_token') === env('WHATSAPP_VERIFY_TOKEN');
    return ok ? new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 }) : new Response('Forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const raw = await req.text();
  const appSecret = env('WHATSAPP_APP_SECRET');
  if (!appSecret || !(await verifySignature(raw, req.headers.get('x-hub-signature-256'), appSecret))) {
    return new Response('Invalid signature', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response('ok'); // nothing we can do with it, don't make Meta retry
  }
  const messages = parseWebhook(payload, PHONE_NUMBER_ID || undefined);

  // Answer Meta right away (it retries slow webhooks); transcription + AI run in the background.
  const work = Promise.allSettled(messages.map(handle));
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(work);
  else await work;
  return new Response('ok');
});
