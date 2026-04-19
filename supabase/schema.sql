-- Funnel Lab — Supabase schema
-- Run this in the Supabase SQL editor after creating your project.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- scenarios
-- ---------------------------------------------------------------------------
create table if not exists public.scenarios (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  slug        text unique,              -- when non-null, the scenario is publicly readable at /s/:slug
  nodes       jsonb not null default '[]'::jsonb,
  edges       jsonb not null default '[]'::jsonb,
  text_blocks jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists scenarios_owner_id_idx on public.scenarios (owner_id, updated_at desc);
create index if not exists scenarios_slug_idx     on public.scenarios (slug) where slug is not null;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.scenarios enable row level security;

-- Owners can do everything with their own scenarios.
drop policy if exists "owners_all" on public.scenarios;
create policy "owners_all"
  on public.scenarios
  for all
  using  (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Anyone (authenticated or anonymous) can read a scenario that has been published (slug is not null).
drop policy if exists "public_read_by_slug" on public.scenarios;
create policy "public_read_by_slug"
  on public.scenarios
  for select
  to anon, authenticated
  using (slug is not null);

-- ---------------------------------------------------------------------------
-- Restrict who can sign up (optional — uncomment and customise for your team)
-- ---------------------------------------------------------------------------
-- In Supabase dashboard → Authentication → Providers → Email, you can:
--   1. Disable "Enable email signups" once your team has created accounts,
--      OR
--   2. Allow signups but restrict the app by email domain in a trigger:
--
-- create or replace function public.restrict_signup_domain()
-- returns trigger as $$
-- begin
--   if new.email not like '%@digitalplane.pt' then
--     raise exception 'Signups restricted to @digitalplane.pt emails.';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer;
--
-- drop trigger if exists restrict_signup_domain_trg on auth.users;
-- create trigger restrict_signup_domain_trg
--   before insert on auth.users
--   for each row execute function public.restrict_signup_domain();
