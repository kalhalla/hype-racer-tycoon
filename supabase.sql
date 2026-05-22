-- Leaderboard storage for Hype Racer Tycoon (Supabase / Postgres).
-- Run this once in the Supabase SQL editor (Dashboard -> SQL -> New query).

create table if not exists scores (
  player_id  text primary key,
  name       text not null,
  best_time  real not null,
  territory  text not null default 'Global',
  level      int  not null default 1,
  flavour    text,
  updated_at timestamptz not null default now()
);

-- Territory board:  where territory = $1 order by best_time
-- Global board:     order by best_time   (no territory filter)
create index if not exists scores_territory_time on scores (territory, best_time);
create index if not exists scores_time           on scores (best_time);

-- Atomic "insert, or keep the better (lower) time" upsert. Metadata always
-- reflects the latest run; the time keeps the player's personal best.
create or replace function submit_score(
  p_id text, p_name text, p_time real, p_terr text, p_level int, p_flavour text
) returns void language sql as $$
  insert into scores (player_id, name, best_time, territory, level, flavour, updated_at)
  values (p_id, p_name, p_time, p_terr, p_level, p_flavour, now())
  on conflict (player_id) do update set
    best_time  = least(scores.best_time, excluded.best_time),
    name       = excluded.name,
    territory  = excluded.territory,
    level      = excluded.level,
    flavour    = excluded.flavour,
    updated_at = now();
$$;

-- Lock the table down. All access flows through the serverless function using the
-- service_role key, which bypasses RLS. With RLS enabled and no policies, the
-- public anon key can read and write nothing directly.
alter table scores enable row level security;
revoke execute on function submit_score(text, text, real, text, int, text) from anon, authenticated;
