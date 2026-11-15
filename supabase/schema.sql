-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null,
  inventory     jsonb not null default '[]'::jsonb,
  profit        bigint not null default 0,
  total_wagered bigint not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Each user can only read and write their own row.
create policy "read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Public leaderboard: exposes only username, profit and total wagered (never inventories).
create or replace view public.leaderboard as
  select username, profit, total_wagered
  from public.profiles
  order by profit desc
  limit 10;

grant select on public.leaderboard to anon, authenticated;
