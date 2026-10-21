-- 菸槍快跑！排行榜資料庫
-- 使用方式：Supabase 後台 → SQL Editor → New query → 貼上全部 → Run

-- 每位玩家（每台裝置）一筆：暱稱、成就數
create table if not exists public.players (
  id          uuid primary key,
  name        text not null check (char_length(name) between 1 and 12),
  ach         int  not null default 0 check (ach between 0 and 200),
  updated_at  timestamptz not null default now()
);

-- 每位玩家在每個難度的最高分
create table if not exists public.scores (
  player_id   uuid not null references public.players(id) on delete cascade,
  diff        text not null check (diff in ('easy', 'normal', 'hard')),
  name        text not null,
  score       int  not null check (score >= 0),
  survive     int  not null check (survive >= 0),
  cigs        int  not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (player_id, diff)
);

create index if not exists scores_rank_idx  on public.scores  (diff, score desc);
create index if not exists players_ach_idx  on public.players (ach desc);

-- 權限：所有人都能讀，但不能直接寫，只能透過下面的函式寫入
alter table public.players enable row level security;
alter table public.scores  enable row level security;

drop policy if exists "public read" on public.players;
drop policy if exists "public read" on public.scores;
create policy "public read" on public.players for select using (true);
create policy "public read" on public.scores  for select using (true);

grant select on public.players, public.scores to anon, authenticated;

-- 更新暱稱、成就數
create or replace function public.submit_player(p_id uuid, p_name text, p_ach int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(p_name);
begin
  if char_length(v_name) < 1 or char_length(v_name) > 12 then
    raise exception 'invalid name';
  end if;

  insert into players (id, name, ach, updated_at)
  values (p_id, v_name, greatest(0, least(p_ach, 200)), now())
  on conflict (id) do update
    set name = excluded.name,
        ach = greatest(players.ach, excluded.ach),
        updated_at = now();

  update scores set name = v_name where player_id = p_id;
end;
$$;

-- 上傳分數：只保留最高分，回傳名次
create or replace function public.submit_score(
  p_id uuid, p_name text, p_diff text,
  p_score int, p_survive int, p_cigs int, p_ach int
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_best int;
  v_rank int;
begin
  if p_diff not in ('easy', 'normal', 'hard') then
    raise exception 'invalid diff';
  end if;
  -- 基本防作弊：分數不可能超過存活秒數 × 上限
  if p_score < 0 or p_survive < 0 or p_survive > 3600 or p_score > (p_survive + 5) * 60 then
    raise exception 'invalid score';
  end if;

  perform submit_player(p_id, p_name, p_ach);

  insert into scores (player_id, diff, name, score, survive, cigs, updated_at)
  values (p_id, p_diff, btrim(p_name), p_score, p_survive, p_cigs, now())
  on conflict (player_id, diff) do update
    set score      = greatest(scores.score, excluded.score),
        survive    = case when excluded.score > scores.score then excluded.survive else scores.survive end,
        cigs       = case when excluded.score > scores.score then excluded.cigs    else scores.cigs    end,
        updated_at = case when excluded.score > scores.score then now()            else scores.updated_at end,
        name       = excluded.name;

  select score into v_best from scores where player_id = p_id and diff = p_diff;
  select count(*) + 1 into v_rank from scores where diff = p_diff and score > v_best;

  return json_build_object('best', v_best, 'rank', v_rank);
end;
$$;

grant execute on function public.submit_player(uuid, text, int) to anon, authenticated;
grant execute on function public.submit_score(uuid, text, text, int, int, int, int) to anon, authenticated;
