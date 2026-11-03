-- Saidpaid initial schema.
-- Money is stored as integers in minor units (pence, cents). Every row belongs to a workspace
-- (a billing entity: a freelancer, an agency...). Access is limited to workspace members via RLS.
-- v0 of the app stores data on the device; this schema is the target for sync.

create extension if not exists pgcrypto;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null default '',
  email text not null default '',
  country text not null default 'GB',
  currency text not null default 'GBP',
  vat_rate numeric(5,2) not null default 0,
  vat_number text,
  legal_note text not null default '',
  payment_details text not null default '',
  payment_terms_days int not null default 15,
  invoice_prefix text not null default 'INV',
  volume_discounts jsonb not null default '[]'::jsonb, -- [{ "minItems": 6, "percent": 8 }]
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  primary key (workspace_id, user_id)
);

create or replace function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members where workspace_id = ws and user_id = auth.uid());
$$;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  aliases text[] not null default '{}',
  email text,
  address text,
  vat_number text,
  currency text,
  payment_terms_days int,
  reminders_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- pricing / client_pricing follow the Pricing type in src/lib/types.ts:
-- flat, per_unit (+ minimum), tiers (by duration, null amount = on quote), on_quote.
create table public.rate_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  aliases text[] not null default '{}',
  pricing jsonb not null,
  client_pricing jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.rate_options (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  aliases text[] not null default '{}',
  kind text not null check (kind in ('fixed', 'percent')),
  value int not null
);

-- Every message is journaled: raw input, transcript, model output. Useful to debug and to build trust.
create table public.captures (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id),
  channel text not null default 'app' check (channel in ('app', 'telegram', 'whatsapp')),
  audio_path text, -- storage path; deleted after transcription by default
  transcript text,
  model_output jsonb,
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  number text, -- assigned on issue only, so the sequence has no gaps
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'overdue', 'void')),
  issue_date date,
  due_date date,
  currency text not null,
  discount_percent numeric(5,2) not null default 0,
  vat_rate numeric(5,2) not null default 0,
  notes text,
  stripe_invoice_id text,
  created_at timestamptz not null default now(),
  unique (workspace_id, number)
);

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  capture_id uuid references public.captures(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_price int, -- null while waiting for the freelancer to give a price
  price_source text not null check (price_source in ('user', 'rate_card', 'unknown')),
  status text not null default 'needs_info' check (status in ('needs_info', 'confirmed', 'invoiced')),
  question text,
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  mission_id uuid references public.missions(id) on delete set null,
  position int not null default 0,
  description text not null,
  quantity numeric(10,2) not null,
  unit_price int not null
);

create table public.audit_log (
  id bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  data jsonb,
  created_at timestamptz not null default now()
);

create index on public.clients (workspace_id);
create index on public.missions (workspace_id, status);
create index on public.missions (client_id);
create index on public.invoices (workspace_id, status);
create index on public.captures (workspace_id, created_at desc);

-- Row level security: members of a workspace see and edit its rows, nobody else.
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.clients enable row level security;
alter table public.rate_items enable row level security;
alter table public.rate_options enable row level security;
alter table public.captures enable row level security;
alter table public.missions enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.audit_log enable row level security;

create policy "members read workspace" on public.workspaces for select using (public.is_member(id));
create policy "members update workspace" on public.workspaces for update using (public.is_member(id));
create policy "members read membership" on public.workspace_members for select using (user_id = auth.uid() or public.is_member(workspace_id));

create policy "members" on public.clients for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "members" on public.rate_items for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "members" on public.rate_options for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "members" on public.captures for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "members" on public.missions for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "members" on public.invoices for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "members" on public.invoice_lines for all
  using (exists (select 1 from public.invoices i where i.id = invoice_id and public.is_member(i.workspace_id)))
  with check (exists (select 1 from public.invoices i where i.id = invoice_id and public.is_member(i.workspace_id)));
create policy "members read" on public.audit_log for select using (public.is_member(workspace_id));

-- Creating a workspace also makes the caller its owner.
create or replace function public.create_workspace(ws_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.workspaces (name) values (ws_name) returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, auth.uid(), 'owner');
  return ws;
end;
$$;
