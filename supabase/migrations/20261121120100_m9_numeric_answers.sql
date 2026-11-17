-- M9 fix: a plain number ("6", "1990") is only "the same answer" inside the same
-- category. A riddle answered 6 must not block a science question answered 6.
create function private.answer_key(p_answer text, p_category text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when k ~ '^[0-9]+$' then p_category || ':' || k else k end
    from (select private.answer_key(p_answer) as k) x
$$;
revoke execute on function private.answer_key(text, text) from public, anon, authenticated;
grant execute on function private.answer_key(text, text) to service_role;

alter table public.questions drop column answer_key;
alter table public.questions
  add column answer_key text generated always as (private.answer_key(answer, category_id)) stored;
create index questions_answer_key_idx on public.questions (answer_key);
comment on column public.questions.answer_key is
  'Normalised answer (numbers are per category). An account never gets two questions with the same key (draw_question).';

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
    v_key := private.answer_key(v_a, v_cat);

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
