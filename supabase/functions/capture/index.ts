// POST /functions/v1/capture
// Body: { text?: string, audio_base64?: string, mime_type?: string, context: CaptureContext }
// Returns: { transcript: string, items: ExtractedItem[] }
//
// API keys live only here (Supabase secrets), never in the mobile app.
import Anthropic from 'npm:@anthropic-ai/sdk@0.133.0';
import { decodeBase64 } from 'jsr:@std/encoding@1/base64';
import { type CaptureContext, extractItems } from '../_shared/extract.ts';
import { transcribe } from '../_shared/transcribe.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) return json({ error: 'ANTHROPIC_API_KEY is not set on the server.' }, 500);

  let body: { text?: string; audio_base64?: string; mime_type?: string; context?: CaptureContext };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  if (!body.context) return json({ error: 'Missing context.' }, 400);

  try {
    let transcript = (body.text ?? '').trim();
    if (body.audio_base64) {
      const deepgramKey = Deno.env.get('DEEPGRAM_API_KEY');
      if (!deepgramKey) return json({ error: 'DEEPGRAM_API_KEY is not set on the server.' }, 500);
      const audio = decodeBase64(body.audio_base64);
      if (audio.byteLength > MAX_AUDIO_BYTES) return json({ error: 'Voice note too long.' }, 413);
      transcript = await transcribe(audio, body.mime_type ?? 'audio/m4a', deepgramKey);
    }
    if (!transcript) return json({ transcript: '', items: [] });

    const client = new Anthropic({ apiKey: anthropicKey });
    const items = await extractItems(client, transcript, body.context);
    return json({ transcript, items });
  } catch (err) {
    console.error(err);
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'Too many requests, try again in a moment.' }, 429);
    if (err instanceof Anthropic.APIError) return json({ error: 'The AI service failed, try again.' }, 502);
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
