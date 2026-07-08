-- AlphaLab watchlist schema.
--
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste ->
-- Run. It creates the per-user watchlist table and the Row-Level Security
-- policies that make sure each user can only read and write their own rows.

create table if not exists public.watchlist (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  ticker     text        not null,
  created_at timestamptz not null default now(),
  unique (user_id, ticker)
);

-- Enforce per-user isolation. Without RLS enabled the anon key could read
-- every row; with these policies a request only ever sees auth.uid()'s rows.
alter table public.watchlist enable row level security;

drop policy if exists "select own watchlist" on public.watchlist;
create policy "select own watchlist"
  on public.watchlist for select
  using (auth.uid() = user_id);

drop policy if exists "insert own watchlist" on public.watchlist;
create policy "insert own watchlist"
  on public.watchlist for insert
  with check (auth.uid() = user_id);

drop policy if exists "delete own watchlist" on public.watchlist;
create policy "delete own watchlist"
  on public.watchlist for delete
  using (auth.uid() = user_id);
