-- M8 security hardening (from the OWASP review).
-- 1. One paid game can no longer be kept open forever: questions stop after
--    6 hours or 100 questions per game (a normal game uses far fewer).
-- 2. The "max 5 pending orders per 10 minutes" limit is now safe against
--    many requests arriving at the same moment (per-user lock).

create or replace function private.draw_question(p_game_id uuid, p_category_id text, p_points smallint)
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
  if v_game.created_at < now() - interval '6 hours' then
    raise exception 'game expired' using errcode = '22023';
  end if;
  if (select count(*) from public.seen_questions s where s.game_id = p_game_id) >= 100 then
    raise exception 'question limit reached' using errcode = '22023';
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

create or replace function private.create_order(p_user uuid, p_return_url text)
returns table (order_id uuid, amount_fils integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent int;
begin
  if p_user is null then
    raise exception 'no user' using errcode = '42501';
  end if;
  -- One order at a time per user, so parallel requests can't slip past the limit.
  perform pg_advisory_xact_lock(hashtext('create_order:' || p_user::text));
  select count(*) into v_recent from public.orders o
   where o.owner_id = p_user and o.status = 'pending' and o.created_at > now() - interval '10 minutes';
  if v_recent >= 5 then
    raise exception 'too many pending orders' using errcode = 'P0001', hint = 'rate_limited';
  end if;

  insert into public.orders (owner_id, amount_fils, games, return_url)
  values (p_user, private.game_price_fils(), 1, p_return_url)
  returning id, orders.amount_fils into order_id, amount_fils;
  return next;
end;
$$;

-- create or replace keeps grants, but restate them so this file is safe on its own.
revoke execute on function private.draw_question(uuid, text, smallint) from public, anon;
grant execute on function private.draw_question(uuid, text, smallint) to authenticated;
revoke execute on function private.create_order(uuid, text) from public, anon, authenticated;
grant execute on function private.create_order(uuid, text) to service_role;

-- The questions table has RLS on and no policies on purpose: nobody reads it
-- directly; questions come out one at a time through draw_question.
comment on table public.questions is 'Question bank. RLS on, no policies by design: read only via private.draw_question.';
