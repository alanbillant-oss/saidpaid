-- Several companies per freelancer: each has its own legal identity, rate card, numbering and
-- invoice look. Clients stay shared across the workspace.

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null default '',
  legal_form text not null default '',
  siren text check (siren is null or siren ~ '^[0-9]{9}$'),
  address text not null default '',
  email text not null default '',
  country text not null default 'FR',
  currency text not null default 'EUR',
  vat_rate numeric(5,2) not null default 0,
  vat_number text,
  legal_note text not null default '',
  payment_details text not null default '',
  payment_terms_days int not null default 30,
  invoice_prefix text not null default 'F',
  number_template text, -- e.g. 'F{year}-{seq:4}', detected from imported invoices
  volume_discounts jsonb not null default '[]'::jsonb,
  template text not null default 'classic' check (template in ('classic', 'minimal', 'bold')),
  accent_color text not null default '#1F6F4A' check (accent_color ~ '^#[0-9A-Fa-f]{3,8}$'),
  logo_path text, -- Supabase Storage path
  invoice_language text not null default 'fr' check (invoice_language in ('fr', 'en')),
  created_at timestamptz not null default now()
);
create index on public.businesses (workspace_id);
alter table public.businesses enable row level security;
create policy "members" on public.businesses for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

-- One company per existing workspace, from the billing identity stored on the workspace.
insert into public.businesses (workspace_id, name, address, email, country, currency, vat_rate, vat_number, legal_note,
  payment_details, payment_terms_days, invoice_prefix, volume_discounts)
select id, name, address, email, country, currency, vat_rate, vat_number, legal_note,
  payment_details, payment_terms_days, invoice_prefix, volume_discounts
from public.workspaces;

alter table public.clients add column siren text check (siren is null or siren ~ '^[0-9]{9}$');

alter table public.rate_items add column business_id uuid references public.businesses(id) on delete cascade;
alter table public.rate_options add column business_id uuid references public.businesses(id) on delete cascade;
alter table public.missions add column business_id uuid references public.businesses(id);
alter table public.invoices add column business_id uuid references public.businesses(id);

update public.rate_items r set business_id = (select b.id from public.businesses b where b.workspace_id = r.workspace_id order by b.created_at limit 1);
update public.rate_options r set business_id = (select b.id from public.businesses b where b.workspace_id = r.workspace_id order by b.created_at limit 1);
update public.missions r set business_id = (select b.id from public.businesses b where b.workspace_id = r.workspace_id order by b.created_at limit 1);
update public.invoices r set business_id = (select b.id from public.businesses b where b.workspace_id = r.workspace_id order by b.created_at limit 1);

alter table public.rate_items alter column business_id set not null;
alter table public.rate_options alter column business_id set not null;
alter table public.missions alter column business_id set not null;
alter table public.invoices alter column business_id set not null;

-- Numbering is per company now: two companies can both have F2026-0001.
alter table public.invoices drop constraint invoices_workspace_id_number_key;
alter table public.invoices add constraint invoices_business_id_number_key unique (business_id, number);
create index on public.invoices (business_id, status);
create index on public.missions (business_id, status);

-- A company and the records pointing at it must live in the same workspace.
create function public.same_workspace_business() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.businesses b where b.id = new.business_id and b.workspace_id = new.workspace_id) then
    raise exception 'business % is not in workspace %', new.business_id, new.workspace_id;
  end if;
  return new;
end $$;
create trigger rate_items_business before insert or update of business_id, workspace_id on public.rate_items for each row execute function public.same_workspace_business();
create trigger rate_options_business before insert or update of business_id, workspace_id on public.rate_options for each row execute function public.same_workspace_business();
create trigger missions_business before insert or update of business_id, workspace_id on public.missions for each row execute function public.same_workspace_business();
create trigger invoices_business before insert or update of business_id, workspace_id on public.invoices for each row execute function public.same_workspace_business();
