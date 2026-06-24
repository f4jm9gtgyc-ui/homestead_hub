-- Tiny Tenant UUID Sync Fix
-- Run this in the Finance Supabase project.
-- This only affects pregnancy_* tables.
-- Because you said the pregnancy tables have no rows, this safely rebuilds them with UUID IDs.

create extension if not exists pgcrypto;

drop table if exists public.pregnancy_budget_expenses cascade;
drop table if exists public.pregnancy_budget_settings cascade;
drop table if exists public.pregnancy_nursery_checklist cascade;
drop table if exists public.pregnancy_profile cascade;

create table public.pregnancy_profile (
  id uuid primary key,
  due_date date,
  current_week integer default 0,
  trimester text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.pregnancy_nursery_checklist (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  item_name text not null,
  completed boolean not null default false,
  created_at timestamptz default now()
);

create table public.pregnancy_budget_expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  amount numeric(12,2) not null default 0,
  notes text,
  expense_date date not null,
  created_at timestamptz default now()
);

create table public.pregnancy_budget_settings (
  id uuid primary key,
  monthly_budget numeric(12,2) not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into public.pregnancy_profile (id, due_date, current_week, trimester)
values ('00000000-0000-4000-8000-000000000001', null, 0, null)
on conflict (id) do nothing;

insert into public.pregnancy_budget_settings (id, monthly_budget)
values ('00000000-0000-4000-8000-000000000002', 0)
on conflict (id) do nothing;

alter table public.pregnancy_profile enable row level security;
alter table public.pregnancy_nursery_checklist enable row level security;
alter table public.pregnancy_budget_expenses enable row level security;
alter table public.pregnancy_budget_settings enable row level security;

create policy "Tiny Tenant public read profile"
on public.pregnancy_profile for select to anon using (true);

create policy "Tiny Tenant public insert profile"
on public.pregnancy_profile for insert to anon with check (true);

create policy "Tiny Tenant public update profile"
on public.pregnancy_profile for update to anon using (true) with check (true);

create policy "Tiny Tenant public read checklist"
on public.pregnancy_nursery_checklist for select to anon using (true);

create policy "Tiny Tenant public insert checklist"
on public.pregnancy_nursery_checklist for insert to anon with check (true);

create policy "Tiny Tenant public update checklist"
on public.pregnancy_nursery_checklist for update to anon using (true) with check (true);

create policy "Tiny Tenant public delete checklist"
on public.pregnancy_nursery_checklist for delete to anon using (true);

create policy "Tiny Tenant public read expenses"
on public.pregnancy_budget_expenses for select to anon using (true);

create policy "Tiny Tenant public insert expenses"
on public.pregnancy_budget_expenses for insert to anon with check (true);

create policy "Tiny Tenant public update expenses"
on public.pregnancy_budget_expenses for update to anon using (true) with check (true);

create policy "Tiny Tenant public delete expenses"
on public.pregnancy_budget_expenses for delete to anon using (true);

create policy "Tiny Tenant public read budget"
on public.pregnancy_budget_settings for select to anon using (true);

create policy "Tiny Tenant public insert budget"
on public.pregnancy_budget_settings for insert to anon with check (true);

create policy "Tiny Tenant public update budget"
on public.pregnancy_budget_settings for update to anon using (true) with check (true);
