// POST /functions/v1/whatsapp-link   (called by the app with the anon key)
// Body: { device_secret: string, action: 'pair' | 'sync' | 'unlink', context?: CaptureContext, ack_ids?: string[] }
//
// The phone is identified by a random secret it generated (no accounts yet). Only its SHA-256 is stored.
//   pair   -> returns a short code to send on WhatsApp, which links the sender's number to this phone
//   sync   -> pushes the latest context (client and rate card names), acknowledges applied
//             captures, returns the WhatsApp captures waiting to be priced by the app
//   unlink -> forgets the link and its inbox
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { newPairCode, sha256Hex } from '../_shared/whatsapp.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const PAIR_CODE_TTL_MS = 15 * 60 * 1000;
const MAX_CONTEXT_BYTES = 200_000;

const mask = (waId: string | null) => (waId ? `+${waId.slice(0, 2)} ••• ${waId.slice(-3)}` : null);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: { device_secret?: string; action?: string; context?: unknown; ack_ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  const secret = body.device_secret ?? '';
  if (typeof secret !== 'string' || secret.length < 32) return json({ error: 'Invalid device secret.' }, 400);
  const context = body.context && JSON.stringify(body.context).length <= MAX_CONTEXT_BYTES ? body.context : undefined;
  const hash = await sha256Hex(secret);
  const now = new Date().toISOString();

  const { data: link, error } = await db
    .from('whatsapp_links')
    .select('id, wa_id')
    .eq('device_secret_hash', hash)
    .maybeSingle();
  if (error) return json({ error: 'Database error.' }, 500);

  switch (body.action) {
    case 'pair': {
      const code = newPairCode();
      const patch = {
        pair_code: code,
        pair_code_expires_at: new Date(Date.now() + PAIR_CODE_TTL_MS).toISOString(),
        updated_at: now,
        ...(context ? { context } : {}),
      };
      const res = link
        ? await db.from('whatsapp_links').update(patch).eq('id', link.id)
        : await db.from('whatsapp_links').insert({ device_secret_hash: hash, ...patch });
      if (res.error) return json({ error: 'Could not create a code, try again.' }, 500);
      return json({
        code: `SP-${code}`,
        number: env('WHATSAPP_DISPLAY_NUMBER').replace(/[^0-9]/g, '') || null,
        linked: !!link?.wa_id,
        phone: mask(link?.wa_id ?? null),
      });
    }

    case 'sync': {
      if (!link) return json({ linked: false, phone: null, captures: [] });
      if (context) await db.from('whatsapp_links').update({ context, updated_at: now }).eq('id', link.id);
      const ackIds = Array.isArray(body.ack_ids) ? body.ack_ids.filter((x): x is string => typeof x === 'string').slice(0, 200) : [];
      if (ackIds.length) {
        await db.from('whatsapp_inbox').update({ delivered_at: now }).eq('link_id', link.id).in('id', ackIds);
      }
      const { data: rows } = await db
        .from('whatsapp_inbox')
        .select('id, kind, transcript, items, created_at')
        .eq('link_id', link.id)
        .is('delivered_at', null)
        .not('items', 'is', null)
        .order('created_at')
        .limit(50);
      return json({ linked: !!link.wa_id, phone: mask(link.wa_id), captures: rows ?? [] });
    }

    case 'unlink': {
      if (link) await db.from('whatsapp_links').delete().eq('id', link.id);
      return json({ linked: false, phone: null, captures: [] });
    }

    default:
      return json({ error: 'Unknown action.' }, 400);
  }
});
