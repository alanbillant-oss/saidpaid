// POST /functions/v1/import-rates
// Body: { pdf_base64: string, currency: string }
// Returns: { items: { name, aliases, pricing }[] }  (amounts in minor units)
//
// Claude reads a rate card PDF and returns it as structured services. Nothing is saved here:
// the app shows the result to the freelancer, who checks it before importing.
import Anthropic from 'npm:@anthropic-ai/sdk@0.133.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MAX_PDF_BASE64 = 14 * 1024 * 1024;
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'aliases', 'kind', 'unit', 'amount', 'minimum'],
        properties: {
          name: { type: 'string' },
          aliases: { type: 'array', items: { type: 'string' } },
          kind: { type: 'string', enum: ['flat', 'per_unit', 'on_quote'] },
          unit: nullable({ type: 'string', enum: ['piece', 'hour', 'day', 'minute'] }),
          amount: nullable({ type: 'number' }),
          minimum: nullable({ type: 'number' }),
        },
      },
    },
  },
} as const;

const SYSTEM = `You read a freelancer's rate card (price list) and list every service it contains.

- name: the service as written, short.
- aliases: 1 to 3 other words the freelancer might say for it out loud, in the same language.
- kind: flat for a fixed price, per_unit for a price per hour/day/minute/piece, on_quote when the card says "sur devis", "on quote" or gives no price.
- amount: the price excluding VAT, in major units of the currency, exactly as printed. Never estimate a missing price: use on_quote and amount null instead. For a range, take the lowest price.
- minimum: a minimum charge for per_unit services when printed, otherwise null.
- Skip headers, legal mentions and totals.`;

type Row = { name: string; aliases: string[]; kind: 'flat' | 'per_unit' | 'on_quote'; unit: string | null; amount: number | null; minimum: number | null };

const minor = (n: number) => Math.round(n * 100);

function toPricing(r: Row) {
  if (r.kind === 'on_quote' || r.amount == null) return { kind: 'on_quote' as const };
  if (r.kind === 'per_unit' && r.unit) {
    return { kind: 'per_unit' as const, unit: r.unit, amount: minor(r.amount), ...(r.minimum ? { minimum: minor(r.minimum) } : {}) };
  }
  return { kind: 'flat' as const, amount: minor(r.amount) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY is not set on the server.' }, 500);

  let body: { pdf_base64?: string; currency?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  if (!body.pdf_base64) return json({ error: 'Missing PDF.' }, 400);
  if (body.pdf_base64.length > MAX_PDF_BASE64) return json({ error: 'PDF too large.' }, 413);

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: body.pdf_base64 } },
            { type: 'text', text: `Currency: ${body.currency ?? 'EUR'}. List the services on this rate card.` },
          ],
        },
      ],
    });
    if (response.stop_reason === 'refusal') return json({ error: 'The request was declined.' }, 422);
    if (response.stop_reason === 'max_tokens') return json({ error: 'This rate card is too long to read in one go.' }, 422);
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    const rows = (JSON.parse(text) as { items: Row[] }).items;
    return json({ items: rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), aliases: r.aliases, pricing: toPricing(r) })) });
  } catch (err) {
    console.error(err);
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'Too many requests, try again in a moment.' }, 429);
    if (err instanceof Anthropic.APIError) return json({ error: 'The AI service failed, try again.' }, 502);
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
