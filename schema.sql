-- ═══════════════════════════════════════════════════════
-- GHOST CLOSER — SUPABASE DATABASE SCHEMA
-- Run this entire file in your Supabase SQL Editor
-- supabase.com → your project → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- DEALERSHIPS TABLE
-- One row per dealership (supports multi-dealer in future)
-- ─────────────────────────────────────────────
create table if not exists dealerships (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  owner_email text not null unique,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────
-- LEADS TABLE
-- Core table — one row per dead lead
-- ─────────────────────────────────────────────
create table if not exists leads (
  id uuid primary key default uuid_generate_v4(),
  dealership_id uuid references dealerships(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  vehicle text not null,
  budget numeric default 0,
  days_silent integer default 0,
  heat text default 'cold' check (heat in ('fire', 'warm', 'cold', 'revived')),
  trigger_event text,
  motivation text,
  last_touch text,
  persona text[] default array[]::text[],
  buy_score integer default 30,
  engage_score integer default 30,
  salesperson text,
  lead_source text,
  channel text default 'text' check (channel in ('text', 'email', 'call')),
  timeline jsonb default '[]'::jsonb,
  notes text,
  revived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────────
-- REVIVAL MESSAGES TABLE
-- Saves every AI-generated message per lead
-- ─────────────────────────────────────────────
create table if not exists revival_messages (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade,
  dealership_id uuid references dealerships(id) on delete cascade,
  channel text,
  message text not null,
  sent boolean default false,
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────
-- INDEXES for fast queries
-- ─────────────────────────────────────────────
create index if not exists leads_dealership_id_idx on leads(dealership_id);
create index if not exists leads_heat_idx on leads(heat);
create index if not exists leads_buy_score_idx on leads(buy_score desc);
create index if not exists revival_messages_lead_id_idx on revival_messages(lead_id);

-- ─────────────────────────────────────────────
-- AUTO-UPDATE updated_at on leads
-- ─────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger leads_updated_at
  before update on leads
  for each row execute function update_updated_at();

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- Users can only see their own dealership's data
-- ─────────────────────────────────────────────
alter table dealerships enable row level security;
alter table leads enable row level security;
alter table revival_messages enable row level security;

-- Dealerships: users can read/write their own
create policy "Users manage own dealership"
  on dealerships for all
  using (owner_email = auth.jwt() ->> 'email');

-- Leads: scoped to dealership
create policy "Dealership members access leads"
  on leads for all
  using (
    dealership_id in (
      select id from dealerships
      where owner_email = auth.jwt() ->> 'email'
    )
  );

-- Revival messages: scoped to dealership
create policy "Dealership members access messages"
  on revival_messages for all
  using (
    dealership_id in (
      select id from dealerships
      where owner_email = auth.jwt() ->> 'email'
    )
  );

-- ─────────────────────────────────────────────
-- SAMPLE DATA (optional — delete if not needed)
-- ─────────────────────────────────────────────
-- After running this schema, your app will auto-create
-- a dealership record on first login. No need to insert
-- sample data manually — use the Import PBS feature.

select 'Ghost Closer schema installed successfully! 👻' as status;
