-- M10: 14 categories (names as SeenJeem uses them) and picture questions (flags, map outlines).
--
-- * Seven categories keep their id and questions under a new name, seven are new,
--   three are retired (science, sports, food: hidden, nothing deleted).
-- * Football questions move from sports to the new football category.
-- * A question can have a picture (public bucket question-images, random file names,
--   so a file name never gives the answer away).
-- * A picture answer only counts as "the same answer" inside its own category:
--   the flag of Japan does not block the map of Japan or a text question about Japan.

-- ───────── categories ─────────
-- Temporary names first, so the unique name rule never trips while renaming.
update public.categories set name = name || ' (old)' where id in ('animals', 'tech', 'arabic');

update public.categories c set name = v.name, emoji = v.emoji, color = v.color, sort_order = v.sort_order, active = true
  from (values
    ('geo',      'جغرافيا',      '🌍', '#2EA8FF', 2),
    ('history',  'تاريخ',        '📜', '#D9893B', 3),
    ('animals',  'عالم الحيوان', '🐾', '#F2A516', 4),
    ('tech',     'تكنولوجيا',    '💻', '#7B5CFF', 5),
    ('arabic',   'لغة وأدب',     '✍️', '#E8488A', 6),
    ('capitals', 'عواصم',        '🏙️', '#14A6B8', 7),
    ('riddles',  'ألغاز',        '🧩', '#C9A100', 8)
  ) as v(id, name, emoji, color, sort_order)
 where c.id = v.id;

insert into public.categories (id, name, emoji, color, sort_order, active) values
  ('general',  'معلومات عامة',  '🧠', '#5B8DEF', 1,  true),
  ('flags',    'أعلام',         '🚩', '#E5484D', 9,  true),
  ('kuwait',   'الكويت',        '🇰🇼', '#1F9D55', 10, true),
  ('football', 'كرة قدم عالمية', '⚽', '#4CB944', 11, true),
  ('prophets', 'قصص الأنبياء',  '🕌', '#0E8C7A', 12, true),
  ('medicine', 'طب عام',        '🩺', '#FF6B4A', 13, true),
  ('cars',     'سيارات',        '🚗', '#3D5A80', 14, true)
on conflict (id) do update
  set name = excluded.name, emoji = excluded.emoji, color = excluded.color,
      sort_order = excluded.sort_order, active = true;

update public.categories set active = false, sort_order = 90 + sort_order
 where id in ('science', 'sports', 'food');

-- Football questions from the old sports bank.
update public.questions set category_id = 'football'
 where category_id = 'sports'
   and id in (611, 616, 618, 622, 623, 624, 626, 634, 637, 638, 641, 646, 650);

-- ───────── picture questions ─────────
alter table public.questions
  add column image_path text check (image_path ~ '^[0-9a-f]{32}\.(png|svg)$');

alter table public.questions drop constraint questions_source_check;
alter table public.questions add constraint questions_source_check
  check (source in ('manual', 'sample', 'opentdb', 'ai', 'picture'));
alter table public.questions add constraint questions_picture_check
  check ((source = 'picture') = (image_path is not null));

-- Many picture questions share the same words ("لمن هذا العلم؟"), so text is unique per picture.
alter table public.questions drop constraint questions_question_key;
alter table public.questions add constraint questions_question_image_key
  unique nulls not distinct (question, image_path);

comment on column public.questions.image_path is
  'Picture file in the public bucket question-images (random name). Null for text questions.';
comment on column public.questions.source is
  'manual = our CSV bank, sample = old public samples, opentdb = Open Trivia DB (CC BY-SA 4.0, translated), ai = written by OpenRouter, picture = flag or map picture (seed-pictures).';

-- Answer key: picture answers are per category.
create function private.answer_key(p_answer text, p_category text, p_picture boolean)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when k is not null and p_picture then p_category || ':img:' || k else k end
    from (select private.answer_key(p_answer, p_category) as k) x
$$;
revoke execute on function private.answer_key(text, text, boolean) from public, anon, authenticated;
grant execute on function private.answer_key(text, text, boolean) to service_role;

alter table public.questions drop column answer_key;
alter table public.questions
  add column answer_key text generated always as
    (private.answer_key(answer, category_id, image_path is not null)) stored;
create index questions_answer_key_idx on public.questions (answer_key);
comment on column public.questions.answer_key is
  'Normalised answer (numbers and picture answers are per category). An account never gets two questions with the same key (draw_question).';

-- ───────── bucket for question pictures ─────────
-- Public read by URL (no listing: there is no select policy on storage.objects).
-- Only the service role (seed-pictures) uploads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-images', 'question-images', true, 524288, array['image/png', 'image/svg+xml'])
on conflict (id) do update
  set public = true, file_size_limit = 524288, allowed_mime_types = array['image/png', 'image/svg+xml'];

-- ───────── draw_question now also returns the picture ─────────
drop function public.draw_question(uuid, text, smallint);
drop function private.draw_question(uuid, text, smallint);

create function private.draw_question(p_game_id uuid, p_category_id text, p_points smallint)
returns table (question_id bigint, question text, answer text, points smallint, image_path text)
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
      return next;
      return;
    end if;
    exit when v_try >= 5;
  end loop;
end;
$$;

create function public.draw_question(p_game_id uuid, p_category_id text, p_points smallint)
returns table (question_id bigint, question text, answer text, points smallint, image_path text)
language sql
security invoker
set search_path = ''
as $$ select * from private.draw_question(p_game_id, p_category_id, p_points); $$;

revoke execute on function private.draw_question(uuid, text, smallint) from public, anon;
grant execute on function private.draw_question(uuid, text, smallint) to authenticated;
revoke execute on function public.draw_question(uuid, text, smallint) from public, anon;
grant execute on function public.draw_question(uuid, text, smallint) to authenticated;

-- ───────── refill API: text answers only in the "avoid" list ─────────
create or replace function private.refill_context()
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
                from public.questions q where q.active and q.image_path is null group by 1) a), '{}'::jsonb)
  );
$$;

-- add_questions: also takes picture questions (source 'picture' + image_path).
create or replace function private.add_questions(p_items jsonb, p_source text)
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
  v_img    text;
  v_key    text;
  v_reason text;
  v_added  int := 0;
  v_skips  jsonb := '{}'::jsonb;
begin
  if p_source is null or p_source not in ('opentdb', 'ai', 'picture') then
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
    v_img := nullif(btrim(coalesce(v_item ->> 'image_path', '')), '');
    v_key := private.answer_key(v_a, v_cat, v_img is not null);

    v_reason := case
      when jsonb_typeof(v_item) <> 'object' then 'bad_item'
      when not exists (select 1 from public.categories c where c.id = v_cat and c.active) then 'bad_category'
      when v_pts is null then 'bad_points'
      when char_length(v_q) not between 5 and 300 then 'bad_question'
      when char_length(v_a) not between 1 and 120 or v_key is null then 'bad_answer'
      when v_ref is not null and char_length(v_ref) > 100 then 'bad_ref'
      when (p_source = 'picture') <> (v_img is not null)
        or (v_img is not null and v_img !~ '^[0-9a-f]{32}\.(png|svg)$') then 'bad_image'
      when exists (select 1 from public.questions q
                    where q.question = v_q and q.image_path is not distinct from v_img) then 'duplicate'
      when v_ref is not null and exists (select 1 from public.questions q where q.source_ref = v_ref) then 'duplicate'
      when exists (select 1 from public.questions q where q.answer_key = v_key and q.active) then 'same_answer'
    end;

    if v_reason is null then
      insert into public.questions (category_id, points, question, answer, source, source_ref, image_path)
      values (v_cat, v_pts, v_q, v_a, p_source, v_ref, v_img)
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
