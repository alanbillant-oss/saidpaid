import Anthropic from 'npm:@anthropic-ai/sdk@0.133.0';

// Kept in sync with src/lib/types.ts (ExtractedItem) and src/lib/api.ts (CaptureContext).
export type CaptureContext = {
  today: string;
  currency: string;
  clients: { id: string; name: string; aliases: string[] }[];
  rateItems: { id: string; name: string; aliases: string[]; unit: string | null }[];
  rateOptions: { id: string; name: string; aliases: string[] }[];
  recentMissions?: { client: string; description: string; date: string }[];
};

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

export const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'client_id',
          'client_spoken_name',
          'is_new_client',
          'new_client_email',
          'description',
          'rate_item_id',
          'option_ids',
          'quantity',
          'unit',
          'spoken_price',
          'spoken_price_is_per_unit',
          'date',
          'confidence',
          'ambiguity',
        ],
        properties: {
          client_id: nullable({ type: 'string' }),
          client_spoken_name: { type: 'string' },
          is_new_client: { type: 'boolean' },
          new_client_email: nullable({ type: 'string' }),
          description: { type: 'string' },
          rate_item_id: nullable({ type: 'string' }),
          option_ids: { type: 'array', items: { type: 'string' } },
          quantity: nullable({ type: 'number' }),
          unit: nullable({ type: 'string', enum: ['piece', 'hour', 'day', 'minute'] }),
          spoken_price: nullable({ type: 'number' }),
          spoken_price_is_per_unit: { type: 'boolean' },
          date: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          ambiguity: nullable({ type: 'string' }),
        },
      },
    },
  },
} as const;

const SYSTEM = `You turn a freelancer's quick voice note or text into a list of billable missions.

Each mission becomes one item. One message can contain several missions and several clients.

Rules:
- Match the client against the client list (name or alias, the transcript may misspell it). Put its id in client_id. If no client fits, client_id is null and client_spoken_name holds what was said. Set is_new_client only when the freelancer explicitly says it is a new client.
- Match the service against the rate card and put its id in rate_item_id, or null if nothing fits. Add matching add-ons to option_ids.
- Never invent a price. spoken_price is only filled when the freelancer actually said an amount, in major units of the currency (e.g. "800 pounds" -> 800). Set spoken_price_is_per_unit when the amount is clearly per hour/day/minute/piece.
- quantity is the number the price depends on: count of pieces, hours, days, or the duration in minutes for services priced by length. Use null if it was not said and is not obvious (a single poster is quantity 1).
- description is a short invoice line in the language the freelancer used, e.g. "Poster for the summer menu".
- date is YYYY-MM-DD. Resolve "yesterday", "on Monday" relative to today. Default to today.
- confidence is low when you had to guess the client or the service. Explain any doubt in ambiguity (one short sentence for the freelancer), otherwise null.
- If the message contains no billable mission, return an empty list.`;

export async function extractItems(client: Anthropic, transcript: string, ctx: CaptureContext) {
  const context = JSON.stringify({
    today: ctx.today,
    currency: ctx.currency,
    clients: ctx.clients,
    rate_card: ctx.rateItems,
    add_ons: ctx.rateOptions,
    recent_missions: ctx.recentMissions ?? [],
  });

  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    // Server-side fallback if the request is ever declined by a safety classifier.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `<context>${context}</context>\n\n<message>${transcript}</message>`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') throw new Error('The request was declined.');
  if (response.stop_reason === 'max_tokens') throw new Error('The message was too long to process.');

  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  const parsed = JSON.parse(text) as { items: unknown[] };
  return parsed.items;
}
