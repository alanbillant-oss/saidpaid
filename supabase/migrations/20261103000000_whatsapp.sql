-- WhatsApp channel. The app still keeps its data on the phone, so the server only holds:
--  - a link between one phone (identified by a random device secret) and one WhatsApp number,
--  - a snapshot of what the AI needs to read a message (client names, rate card names, no prices),
--  - an inbox of messages already read by the AI, waiting for the app to pick them up and price them.
-- Only the Edge Functions (service role) touch these tables: RLS is on with no policy.

create table public.whatsapp_links (
  id uuid primary key default gen_random_uuid(),
  device_secret_hash text not null unique,
  wa_id text unique,                -- WhatsApp number in international format, digits only
  pair_code text unique,            -- short code the user sends on WhatsApp to link the number
  pair_code_expires_at timestamptz,
  context jsonb,                    -- CaptureContext snapshot pushed by the app
  linked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.whatsapp_inbox (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.whatsapp_links(id) on delete cascade,
  wa_message_id text not null unique, -- Meta retries webhooks: this makes processing idempotent
  kind text not null check (kind in ('text', 'audio')),
  transcript text,
  items jsonb,
  error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz           -- set once the app has applied it
);

create index on public.whatsapp_inbox (link_id) where delivered_at is null;

alter table public.whatsapp_links enable row level security;
alter table public.whatsapp_inbox enable row level security;
