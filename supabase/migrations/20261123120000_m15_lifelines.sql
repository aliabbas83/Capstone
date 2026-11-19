-- M15 lifelines: "pick from two answers" needs one believable wrong answer per question.
--   * text questions: questions.wrong_answer, written once by the AI (edge function
--     seed-wrong-answers) and checked again here before it is saved;
--   * picture questions (flags, maps): another country from the same category, picked when
--     the question is drawn;
--   * a text question whose wrong answer is not written yet: the answer of another text
--     question from the same category and points.
-- The app already receives the right answer with each question (the host reveals it), so the
-- wrong answer is no more secret than that. The once-per-team limit is a fairness rule between
-- two teams on one phone and lives in the app, like the level limits (M12).

alter table public.questions
  add column wrong_answer text
  constraint questions_wrong_answer_len check (wrong_answer is null or char_length(btrim(wrong_answer)) between 1 and 120);

comment on column public.questions.wrong_answer is
  'A believable wrong answer for the "pick from two answers" lifeline (text questions; set by private.set_wrong_answers).';

-- ───────── draw_question now also returns a wrong answer ─────────
drop function public.draw_question(uuid, text, smallint);
drop function private.draw_question(uuid, text, smallint);

create function private.draw_question(p_game_id uuid, p_category_id text, p_points smallint)
returns table (question_id bigint, question text, answer text, points smallint, image_path text, wrong_answer text)
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

  -- A random question the account has never seen, whose answer it has never seen
  -- either (in any category or game). Retry if another request took it.
  loop
    v_try := v_try + 1;
    select q.* into v_q
      from public.questions q
     where q.category_id = p_category_id
       and q.points = p_points
       and q.active
       and not exists (
         select 1
           from public.seen_questions s
           join public.questions sq on sq.id = s.question_id
          where s.user_id = v_uid
            and (s.question_id = q.id or sq.answer_key = q.answer_key))
     order by random()
     limit 1;

    if not found then
      return; -- nothing new left: empty result
    end if;

    insert into public.seen_questions (user_id, question_id, game_id)
    values (v_uid, v_q.id, p_game_id)
    on conflict do nothing;

    if found then
      question_id := v_q.id; question := v_q.question; answer := v_q.answer;
      points := v_q.points; image_path := v_q.image_path;
      -- The wrong answer: the written one, or else another answer of the same kind
      -- (picture questions: another country; text questions: same category and points).
      wrong_answer := coalesce(
        nullif(btrim(v_q.wrong_answer), ''),
        (select o.answer
           from public.questions o
          where o.category_id = v_q.category_id
            and o.active
            and o.id <> v_q.id
            and o.answer_key is distinct from v_q.answer_key
            and (o.image_path is null) = (v_q.image_path is null)
            and (v_q.image_path is not null or o.points = v_q.points)
          order by random()
          limit 1));
      return next;
      return;
    end if;
    exit when v_try >= 5;
  end loop;
end;
$$;

create function public.draw_question(p_game_id uuid, p_category_id text, p_points smallint)
returns table (question_id bigint, question text, answer text, points smallint, image_path text, wrong_answer text)
language sql
security invoker
set search_path = ''
as $$ select * from private.draw_question(p_game_id, p_category_id, p_points); $$;

revoke execute on function private.draw_question(uuid, text, smallint) from public, anon;
grant execute on function private.draw_question(uuid, text, smallint) to authenticated;
revoke execute on function public.draw_question(uuid, text, smallint) from public, anon;
grant execute on function public.draw_question(uuid, text, smallint) to authenticated;

-- ───────── API for the seed-wrong-answers edge function (service role only) ─────────

-- Text questions that still need a wrong answer.
create function private.questions_missing_wrong(p_limit int)
returns table (id bigint, category text, question text, answer text)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, c.name, q.question, q.answer
    from public.questions q
    join public.categories c on c.id = q.category_id
   where q.active and q.image_path is null and q.wrong_answer is null
   order by q.id
   limit least(greatest(coalesce(p_limit, 40), 1), 200);
$$;

-- Save wrong answers: [{"id": 12, "wrong": "…"}, …]. Every item is checked again here;
-- bad ones are skipped. Returns how many were saved.
create function private.set_wrong_answers(p_items jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item  jsonb;
  v_id    bigint;
  v_wrong text;
  v_saved int := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 200 then
    raise exception 'items must be an array of at most 200' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    continue when jsonb_typeof(v_item) <> 'object'
      or jsonb_typeof(v_item -> 'id') <> 'number'
      or jsonb_typeof(v_item -> 'wrong') <> 'string';
    continue when (v_item ->> 'id') !~ '^[0-9]{1,18}$';
    v_id := (v_item ->> 'id')::bigint;
    v_wrong := btrim(regexp_replace(v_item ->> 'wrong', '\s+', ' ', 'g'));
    continue when char_length(v_wrong) not between 1 and 120
      or v_wrong ~ '[[:cntrl:]<>]';

    update public.questions q
       set wrong_answer = v_wrong
     where q.id = v_id
       and q.image_path is null
       and q.wrong_answer is null
       -- never the right answer in other words (same normalised key)
       and private.answer_key(v_wrong, q.category_id, false) is distinct from q.answer_key
       and lower(v_wrong) <> lower(btrim(q.answer));
    if found then
      v_saved := v_saved + 1;
    end if;
  end loop;
  return v_saved;
end;
$$;

revoke execute on function private.questions_missing_wrong(int) from public, anon, authenticated;
revoke execute on function private.set_wrong_answers(jsonb) from public, anon, authenticated;
grant execute on function private.questions_missing_wrong(int) to service_role;
grant execute on function private.set_wrong_answers(jsonb) to service_role;

create function public.questions_missing_wrong(p_limit int)
returns table (id bigint, category text, question text, answer text)
language sql stable security invoker set search_path = ''
as $$ select * from private.questions_missing_wrong(p_limit); $$;
create function public.set_wrong_answers(p_items jsonb) returns int
language sql security invoker set search_path = ''
as $$ select private.set_wrong_answers(p_items); $$;

revoke execute on function public.questions_missing_wrong(int) from public, anon, authenticated;
revoke execute on function public.set_wrong_answers(jsonb) from public, anon, authenticated;
grant execute on function public.questions_missing_wrong(int) to service_role;
grant execute on function public.set_wrong_answers(jsonb) to service_role;
