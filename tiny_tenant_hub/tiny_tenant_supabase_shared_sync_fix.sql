-- Tiny Tenant shared sync fix
-- Run this in the Finance Supabase project SQL Editor.
-- This keeps the pregnancy_* table names and allows the shared GitHub Pages app to save/read data.

create extension if not exists pgcrypto;

-- Main due date/profile row. One shared row: id = 'main'.
create table if not exists public.pregnancy_profile (
  id text primary key default 'main',
  due_date date,
  current_week integer,
  trimester text,
  updated_at timestamptz default now()
);

alter table public.pregnancy_profile add column if not exists id text default 'main';
alter table public.pregnancy_profile add column if not exists due_date date;
alter table public.pregnancy_profile add column if not exists current_week integer;
alter table public.pregnancy_profile add column if not exists trimester text;
alter table public.pregnancy_profile add column if not exists updated_at timestamptz default now();

-- Add a unique/primary key path for upsert if one does not already exist.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pregnancy_profile'::regclass
      and contype in ('p','u')
      and conname = 'pregnancy_profile_id_key'
  ) and not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pregnancy_profile'::regclass
      and contype = 'p'
  ) then
    alter table public.pregnancy_profile add constraint pregnancy_profile_id_key unique (id);
  end if;
end $$;

create table if not exists public.pregnancy_nursery_checklist (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  item_name text not null,
  completed boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.pregnancy_budget_expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  amount numeric(12,2) not null default 0,
  notes text,
  expense_date date not null,
  created_at timestamptz default now()
);

create table if not exists public.pregnancy_budget_settings (
  id text primary key default 'main',
  monthly_budget numeric(12,2) not null default 0,
  updated_at timestamptz default now()
);

alter table public.pregnancy_budget_settings add column if not exists id text default 'main';
alter table public.pregnancy_budget_settings add column if not exists monthly_budget numeric(12,2) not null default 0;
alter table public.pregnancy_budget_settings add column if not exists updated_at timestamptz default now();

-- RLS must allow the browser's anon key to read/write these shared dashboard tables.
alter table public.pregnancy_profile enable row level security;
alter table public.pregnancy_nursery_checklist enable row level security;
alter table public.pregnancy_budget_expenses enable row level security;
alter table public.pregnancy_budget_settings enable row level security;

-- Clear old policies from prior attempts.
drop policy if exists "Tiny Tenant public read profile" on public.pregnancy_profile;
drop policy if exists "Tiny Tenant public insert profile" on public.pregnancy_profile;
drop policy if exists "Tiny Tenant public update profile" on public.pregnancy_profile;
drop policy if exists "Tiny Tenant public read checklist" on public.pregnancy_nursery_checklist;
drop policy if exists "Tiny Tenant public insert checklist" on public.pregnancy_nursery_checklist;
drop policy if exists "Tiny Tenant public update checklist" on public.pregnancy_nursery_checklist;
drop policy if exists "Tiny Tenant public delete checklist" on public.pregnancy_nursery_checklist;
drop policy if exists "Tiny Tenant public read expenses" on public.pregnancy_budget_expenses;
drop policy if exists "Tiny Tenant public insert expenses" on public.pregnancy_budget_expenses;
drop policy if exists "Tiny Tenant public update expenses" on public.pregnancy_budget_expenses;
drop policy if exists "Tiny Tenant public delete expenses" on public.pregnancy_budget_expenses;
drop policy if exists "Tiny Tenant public read budget" on public.pregnancy_budget_settings;
drop policy if exists "Tiny Tenant public insert budget" on public.pregnancy_budget_settings;
drop policy if exists "Tiny Tenant public update budget" on public.pregnancy_budget_settings;

create policy "Tiny Tenant public read profile" on public.pregnancy_profile for select to anon using (true);
create policy "Tiny Tenant public insert profile" on public.pregnancy_profile for insert to anon with check (true);
create policy "Tiny Tenant public update profile" on public.pregnancy_profile for update to anon using (true) with check (true);

create policy "Tiny Tenant public read checklist" on public.pregnancy_nursery_checklist for select to anon using (true);
create policy "Tiny Tenant public insert checklist" on public.pregnancy_nursery_checklist for insert to anon with check (true);
create policy "Tiny Tenant public update checklist" on public.pregnancy_nursery_checklist for update to anon using (true) with check (true);
create policy "Tiny Tenant public delete checklist" on public.pregnancy_nursery_checklist for delete to anon using (true);

create policy "Tiny Tenant public read expenses" on public.pregnancy_budget_expenses for select to anon using (true);
create policy "Tiny Tenant public insert expenses" on public.pregnancy_budget_expenses for insert to anon with check (true);
create policy "Tiny Tenant public update expenses" on public.pregnancy_budget_expenses for update to anon using (true) with check (true);
create policy "Tiny Tenant public delete expenses" on public.pregnancy_budget_expenses for delete to anon using (true);

create policy "Tiny Tenant public read budget" on public.pregnancy_budget_settings for select to anon using (true);
create policy "Tiny Tenant public insert budget" on public.pregnancy_budget_settings for insert to anon with check (true);
create policy "Tiny Tenant public update budget" on public.pregnancy_budget_settings for update to anon using (true) with check (true);

-- Optional starter row so the app always has a shared profile target.
insert into public.pregnancy_profile (id)
values ('main')
on conflict (id) do nothing;

insert into public.pregnancy_budget_settings (id, monthly_budget)
values ('main', 0)
on conflict (id) do nothing;
