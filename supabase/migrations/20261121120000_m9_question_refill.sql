-- M9: the bank refills itself every day (Open Trivia DB + OpenRouter, through the
-- server-only edge function refill-questions), and an account never gets two
-- questions with the same answer, across all its games.
--
-- Rules kept from M3: the device never chooses questions; nobody reads the
-- questions table directly; only the service role can add questions.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ───────── answer key: the same answer written slightly differently ─────────
-- "الأسد", "أسد", "الأَسَد" and "الأسد (ملك الغابة)" all become "اسد".
create function private.answer_key(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(
           regexp_replace(
             regexp_replace(
               translate(
                 regexp_replace(
                   regexp_replace(lower(coalesce(p, '')), '\([^)]*\)', ' ', 'g'),  -- drop "(...)"
                   '[ً-ْٰـ]', '', 'g'),                         -- harakat, tatweel
                 'أإآٱىة٠١٢٣٤٥٦٧٨٩', 'اااايه0123456789'),
               '[^ء-يa-z0-9 ]', ' ', 'g'),                                -- punctuation
             '(^| )ال', '\1', 'g'),                                                   -- leading "ال"
           ' +', ' ', 'g')), '')
$$;
revoke execute on function private.answer_key(text) from public, anon, authenticated;
grant execute on function private.answer_key(text) to service_role;

alter table public.questions
  add column answer_key text generated always as (private.answer_key(answer)) stored,
  add column source text not null default 'manual'
    check (source in ('manual', 'sample', 'opentdb', 'ai')),
  add column source_ref text unique;

update public.questions set source = 'sample' where is_sample;
create index questions_answer_key_idx on public.questions (answer_key);

comment on column public.questions.answer_key is
  'Normalised answer. An account never gets two questions with the same key (draw_question).';
comment on column public.questions.source is
  'manual = our CSV bank, sample = old public samples, opentdb = Open Trivia DB (CC BY-SA 4.0, translated), ai = written by OpenRouter.';
comment on column public.questions.source_ref is
  'For opentdb: hash of the original English question, so it is never imported twice.';

-- ───────── draw_question: skip anything whose answer the account has seen ─────────
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

  -- Pick a random question the account has never seen, whose answer it has never
  -- seen either (in any category or game). Retry if another request took it.
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
      question_id := v_q.id; question := v_q.question; answer := v_q.answer; points := v_q.points;
      return next;
      return;
    end if;
    exit when v_try >= 5;
  end loop;
end;
$$;

-- Same rule for the "questions left" count; two unseen questions with the same
-- answer count once, because only one of them can ever be drawn.
create or replace function private.remaining_questions(p_category_ids text[])
returns table (category_id text, points smallint, remaining integer)
language sql
stable
security definer
set search_path = ''
as $$
  select q.category_id, q.points, count(distinct coalesce(q.answer_key, q.id::text))::int
    from public.questions q
   where (select auth.uid()) is not null
     and q.active
     and q.category_id = any (p_category_ids)
     and not exists (
       select 1
         from public.seen_questions s
         join public.questions sq on sq.id = s.question_id
        where s.user_id = (select auth.uid())
          and (s.question_id = q.id or sq.answer_key = q.answer_key))
   group by q.category_id, q.points;
$$;

revoke execute on function private.draw_question(uuid, text, smallint) from public, anon;
grant execute on function private.draw_question(uuid, text, smallint) to authenticated;
revoke execute on function private.remaining_questions(text[]) from public, anon;
grant execute on function private.remaining_questions(text[]) to authenticated;

-- ───────── service-role API for the refill-questions edge function ─────────

-- What the bank has now: active categories, counts per points, and the answers
-- already used (so the AI is told not to repeat them).
create function private.refill_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.sort_order)
        from public.categories c where c.active), '[]'::jsonb),
    'stock', coalesce((
      select jsonb_agg(jsonb_build_object('category_id', x.category_id, 'points', x.points, 'count', x.n))
        from (select q.category_id, q.points, count(*)::int n
                from public.questions q join public.categories c on c.id = q.category_id and c.active
               where q.active group by 1, 2) x), '[]'::jsonb),
    'answers', coalesce((
      select jsonb_object_agg(a.category_id, a.answers)
        from (select q.category_id, jsonb_agg(q.answer order by q.id desc) answers
                from public.questions q where q.active group by 1) a), '{}'::jsonb)
  );
$$;

-- Which Open Trivia DB questions were already imported.
create function private.known_refs(p_refs text[])
returns setof text
language sql
stable
security definer
set search_path = ''
as $$ select q.source_ref from public.questions q where q.source_ref = any (p_refs); $$;

-- Add new questions. Everything is checked here, not trusted from the caller.
create function private.add_questions(p_items jsonb, p_source text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item   jsonb;
  v_cat    text;
  v_pts    smallint;
  v_q      text;
  v_a      text;
  v_ref    text;
  v_key    text;
  v_reason text;
  v_added  int := 0;
  v_skips  jsonb := '{}'::jsonb;
begin
  if p_source is null or p_source not in ('opentdb', 'ai') then
    raise exception 'invalid source' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100 then
    raise exception 'items must be an array of at most 100' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cat := v_item ->> 'category_id';
    v_pts := case when (v_item ->> 'points') ~ '^[2-5]$' then (v_item ->> 'points')::smallint end;
    v_q   := btrim(regexp_replace(coalesce(v_item ->> 'question', ''), '\s+', ' ', 'g'));
    v_a   := btrim(regexp_replace(coalesce(v_item ->> 'answer', ''), '\s+', ' ', 'g'));
    v_ref := nullif(btrim(coalesce(v_item ->> 'source_ref', '')), '');
    v_key := private.answer_key(v_a);

    v_reason := case
      when jsonb_typeof(v_item) <> 'object' then 'bad_item'
      when not exists (select 1 from public.categories c where c.id = v_cat and c.active) then 'bad_category'
      when v_pts is null then 'bad_points'
      when char_length(v_q) not between 5 and 300 then 'bad_question'
      when char_length(v_a) not between 1 and 120 or v_key is null then 'bad_answer'
      when v_ref is not null and char_length(v_ref) > 100 then 'bad_ref'
      when exists (select 1 from public.questions q where q.question = v_q) then 'duplicate'
      when v_ref is not null and exists (select 1 from public.questions q where q.source_ref = v_ref) then 'duplicate'
      when exists (select 1 from public.questions q where q.answer_key = v_key and q.active) then 'same_answer'
    end;

    if v_reason is null then
      insert into public.questions (category_id, points, question, answer, source, source_ref)
      values (v_cat, v_pts, v_q, v_a, p_source, v_ref)
      on conflict do nothing;
      if found then
        v_added := v_added + 1;
      else
        v_reason := 'duplicate';
      end if;
    end if;

    if v_reason is not null then
      v_skips := jsonb_set(v_skips, array[v_reason], to_jsonb(coalesce((v_skips ->> v_reason)::int, 0) + 1));
    end if;
  end loop;

  return jsonb_build_object('added', v_added, 'skipped', v_skips);
end;
$$;

-- The daily job proves it is the job with a random token kept in Vault.
-- Nobody types or sees it; the cron job reads it from Vault.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'refill_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'refill_token',
      'Sent by the daily cron job to the refill-questions edge function.');
  end if;
end $$;

create function private.check_refill_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_token is not null and p_token <> '' and p_token = (
    select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'refill_token'), false);
$$;

revoke execute on function private.refill_context() from public, anon, authenticated;
revoke execute on function private.known_refs(text[]) from public, anon, authenticated;
revoke execute on function private.add_questions(jsonb, text) from public, anon, authenticated;
revoke execute on function private.check_refill_token(text) from public, anon, authenticated;
grant execute on function private.refill_context() to service_role;
grant execute on function private.known_refs(text[]) to service_role;
grant execute on function private.add_questions(jsonb, text) to service_role;
grant execute on function private.check_refill_token(text) to service_role;

create function public.refill_context() returns jsonb
language sql stable security invoker set search_path = ''
as $$ select private.refill_context(); $$;
create function public.known_refs(p_refs text[]) returns setof text
language sql stable security invoker set search_path = ''
as $$ select * from private.known_refs(p_refs); $$;
create function public.add_questions(p_items jsonb, p_source text) returns jsonb
language sql security invoker set search_path = ''
as $$ select private.add_questions(p_items, p_source); $$;
create function public.check_refill_token(p_token text) returns boolean
language sql stable security invoker set search_path = ''
as $$ select private.check_refill_token(p_token); $$;

revoke execute on function public.refill_context() from public, anon, authenticated;
revoke execute on function public.known_refs(text[]) from public, anon, authenticated;
revoke execute on function public.add_questions(jsonb, text) from public, anon, authenticated;
revoke execute on function public.check_refill_token(text) from public, anon, authenticated;
grant execute on function public.refill_context() to service_role;
grant execute on function public.known_refs(text[]) to service_role;
grant execute on function public.add_questions(jsonb, text) to service_role;
grant execute on function public.check_refill_token(text) to service_role;

-- ───────── once a day at 03:00 Kuwait time (00:00 UTC) ─────────
select cron.schedule(
  'refill-questions-daily',
  '0 0 * * *',
  $cron$
  select net.http_post(
    url := 'https://mqpzimmvnnzcoyfuqnbe.supabase.co/functions/v1/refill-questions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-refill-token', (select decrypted_secret from vault.decrypted_secrets where name = 'refill_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000);
  $cron$
);
