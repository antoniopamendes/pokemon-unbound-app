-- Run this once in your Supabase project's SQL editor (Database -> SQL Editor -> New query).
-- It creates a single table that stores each signed-in user's caught-Pokemon and build data
-- as JSON, protected by Row Level Security so users can only read/write their own row.

create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  caught_pokemon_map jsonb not null default '{}'::jsonb,
  build_map jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

create policy "Users can view their own data"
  on public.user_data for select
  using (auth.uid() = user_id);

create policy "Users can insert their own data"
  on public.user_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own data"
  on public.user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
