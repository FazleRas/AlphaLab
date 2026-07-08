-- AlphaLab schema: per-user watchlist and saved backtest runs.
--
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste ->
-- Run. It creates the per-user tables and the Row-Level Security policies that
-- make sure each user can only read and write their own rows.
--
-- Note on the backend: connecting from FastAPI via the pooler `DATABASE_URL`
-- uses the `postgres` role, which BYPASSES RLS. These policies protect any
-- direct (anon-key) access from the frontend; backend routes must still scope
-- every query by the user_id resolved from the request's JWT.

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


-- Saved backtest runs: a user pins a strategy configuration and its metrics.
create table if not exists public.saved_runs (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  ticker     text        not null,
  strategy   text        not null,
  period     text        not null,
  params     jsonb       not null default '{}'::jsonb,
  metrics    jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_saved_runs_user_id on public.saved_runs (user_id);

alter table public.saved_runs enable row level security;

drop policy if exists "select own saved_runs" on public.saved_runs;
create policy "select own saved_runs"
  on public.saved_runs for select
  using (auth.uid() = user_id);

drop policy if exists "insert own saved_runs" on public.saved_runs;
create policy "insert own saved_runs"
  on public.saved_runs for insert
  with check (auth.uid() = user_id);

drop policy if exists "delete own saved_runs" on public.saved_runs;
create policy "delete own saved_runs"
  on public.saved_runs for delete
  using (auth.uid() = user_id);
