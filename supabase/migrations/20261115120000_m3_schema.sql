-- M3: core tables, row-level security, and the question-drawing functions.
-- Rule: the device never chooses questions. It asks the server, and the server
-- picks one the account has never seen before.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ───────────────────────── profiles ─────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text check (char_length(display_name) <= 40),
  games_credit  integer not null default 0 check (games_credit >= 0),
  created_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Users may only change their display name. Credit is changed by the server only.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Create a profile automatically for every new account.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ───────────────────────── categories ─────────────────────────
create table public.categories (
  id          text primary key check (id ~ '^[a-z_]{2,30}$'),
  name        text not null unique,
  emoji       text not null,
  color       text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order  smallint not null default 0,
  active      boolean not null default true
);
alter table public.categories enable row level security;

create policy "categories: anyone reads active" on public.categories
  for select to anon, authenticated using (active);
revoke all on public.categories from anon, authenticated;
grant select on public.categories to anon, authenticated;

-- ───────────────────────── questions ─────────────────────────
-- No client can read this table directly. Questions are handed out one at a
-- time by public.draw_question().
create table public.questions (
  id           bigint generated always as identity primary key,
  category_id  text not null references public.categories (id),
  points       smallint not null check (points in (2, 3, 4, 5)),
  question     text not null unique check (char_length(question) between 5 and 300),
  answer       text not null check (char_length(answer) between 1 and 120),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index questions_pick_idx on public.questions (category_id, points) where active;
alter table public.questions enable row level security;
revoke all on public.questions from anon, authenticated;
-- (no policies on purpose: RLS on + no policy = no rows for clients)

-- ───────────────────────── games ─────────────────────────
-- Created and finished by server functions (M5). Owners can only read theirs.
create table public.games (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'active' check (status in ('active', 'finished', 'abandoned')),
  team_names   text[] not null check (cardinality(team_names) = 2),
  team_mascots text[] not null check (cardinality(team_mascots) = 2),
  team_photos  text[] check (team_photos is null or cardinality(team_photos) = 2),
  categories   text[] not null check (cardinality(categories) = 8),
  lane_length  smallint not null default 20 check (lane_length between 6 and 40),
  winner       smallint check (winner in (0, 1)),
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index games_owner_idx on public.games (owner_id, created_at desc);
alter table public.games enable row level security;

create policy "games: read own" on public.games
  for select to authenticated using ((select auth.uid()) = owner_id);
revoke all on public.games from anon, authenticated;
grant select on public.games to authenticated;

-- ───────────────────────── seen_questions ─────────────────────────
-- One row per (account, question). The primary key makes repeats impossible.
create table public.seen_questions (
  user_id      uuid not null references auth.users (id) on delete cascade,
  question_id  bigint not null references public.questions (id) on delete cascade,
  game_id      uuid references public.games (id) on delete set null,
  seen_at      timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index seen_questions_question_idx on public.seen_questions (question_id);
create index seen_questions_game_idx on public.seen_questions (game_id);
alter table public.seen_questions enable row level security;

create policy "seen_questions: read own" on public.seen_questions
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.seen_questions from anon, authenticated;
grant select on public.seen_questions to authenticated;

-- ───────────────────────── draw_question ─────────────────────────
-- Private worker (bypasses RLS to read questions). Not reachable through the API:
-- the private schema is not exposed, and only the public wrapper may call it.
create function private.draw_question(p_game_id uuid, p_category_id text, p_points smallint)
returns table (question_id bigint, question text, answer text, points smallint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_game public.games%rowtype;
  v_q    public.questions%rowtype;
  v_try  int := 0;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_points not in (2, 3, 4, 5) then
    raise exception 'invalid points' using errcode = '22023';
  end if;

  select * into v_game from public.games g where g.id = p_game_id and g.owner_id = v_uid;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  if v_game.status <> 'active' then
    raise exception 'game is not active' using errcode = '22023';
  end if;
  if not (p_category_id = any (v_game.categories)) then
    raise exception 'category not in this game' using errcode = '22023';
  end if;

  -- Pick a random unseen question. Retry if another request took it at the same moment.
  loop
    v_try := v_try + 1;
    select q.* into v_q
      from public.questions q
     where q.category_id = p_category_id
       and q.points = p_points
       and q.active
       and not exists (
         select 1 from public.seen_questions s
          where s.user_id = v_uid and s.question_id = q.id)
     order by random()
     limit 1;

    if not found then
      return; -- no unseen questions left: empty result
    end if;

    insert into public.seen_questions (user_id, question_id, game_id)
    values (v_uid, v_q.id, p_game_id)
    on conflict do nothing;

    if found then
      question_id := v_q.id; question := v_q.question; answer := v_q.answer; points := v_q.points;
      return next;
      return;
    end if;
    exit when v_try >= 5;
  end loop;
end;
$$;
revoke execute on function private.draw_question(uuid, text, smallint) from public, anon, authenticated;

-- How many unseen questions the account has left, per category and points.
create function private.remaining_questions(p_category_ids text[])
returns table (category_id text, points smallint, remaining integer)
language sql
stable
security definer
set search_path = ''
as $$
  select q.category_id, q.points, count(*)::int
    from public.questions q
   where (select auth.uid()) is not null
     and q.active
     and q.category_id = any (p_category_ids)
     and not exists (
       select 1 from public.seen_questions s
        where s.user_id = (select auth.uid()) and s.question_id = q.id)
   group by q.category_id, q.points;
$$;
revoke execute on function private.remaining_questions(text[]) from public, anon, authenticated;

-- Public API wrappers (security invoker). Only signed-in users may call them.
grant usage on schema private to authenticated;
grant execute on function private.draw_question(uuid, text, smallint) to authenticated;
grant execute on function private.remaining_questions(text[]) to authenticated;

create function public.draw_question(p_game_id uuid, p_category_id text, p_points smallint)
returns table (question_id bigint, question text, answer text, points smallint)
language sql
security invoker
set search_path = ''
as $$ select * from private.draw_question(p_game_id, p_category_id, p_points); $$;

create function public.remaining_questions(p_category_ids text[])
returns table (category_id text, points smallint, remaining integer)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.remaining_questions(p_category_ids); $$;

revoke execute on function public.draw_question(uuid, text, smallint) from public, anon;
revoke execute on function public.remaining_questions(text[]) from public, anon;
grant execute on function public.draw_question(uuid, text, smallint) to authenticated;
grant execute on function public.remaining_questions(text[]) to authenticated;
