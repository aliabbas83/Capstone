-- M9: same answer never comes back for an account; the refill API is service-role
-- only and checks everything it saves. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- ───────── answer key ─────────
select is(private.answer_key('الأسد'), private.answer_key('أسد'), 'answer key ignores "ال" and hamza');
select is(private.answer_key('الأَسَد (ملك الغابة)'), 'اسد', 'answer key ignores harakat and brackets');
select is(private.answer_key('٦', 'riddles'), 'riddles:6', 'plain numbers are per category');
select isnt(private.answer_key('6', 'riddles'), private.answer_key('6', 'science'), 'same number in two categories is not the same answer');
select is(private.answer_key('@', 'tech'), null, 'an answer with no letters has no key');

-- ───────── fixtures ─────────
insert into auth.users (id, email, aud, role) values
  ('cccccccc-0000-4000-8000-00000000000c', 'pgtap-c@test.jawla.invalid', 'authenticated', 'authenticated');
insert into public.categories (id, name, emoji, color, sort_order)
values ('pgtap_refill', 'pgtap m9', '?', '#000000', 998);
insert into public.questions (category_id, points, question, answer) values
  ('pgtap_refill', 3, 'pgtap m9 lion one?', 'الأسد'),
  ('pgtap_refill', 3, 'pgtap m9 lion two?', 'أسد'),
  ('pgtap_refill', 3, 'pgtap m9 other?', 'النمر');
insert into public.games (id, owner_id, team_names, team_mascots, categories)
values ('cccccccc-1111-4000-8000-000000000001', 'cccccccc-0000-4000-8000-00000000000c',
        '{"T1","T2"}', '{"fox","cat"}', array['pgtap_refill', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']);
-- C already had the first lion question in an older game.
insert into public.seen_questions (user_id, question_id, game_id)
select 'cccccccc-0000-4000-8000-00000000000c', id, 'cccccccc-1111-4000-8000-000000000001'
  from public.questions where question = 'pgtap m9 lion one?';

-- ───────── draw rule (as C) ─────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-00000000000c","role":"authenticated"}';

select is((select remaining from public.remaining_questions(array['pgtap_refill']) where points = 3), 1,
  'remaining counts only the one question with a new answer');
select is((select answer from public.draw_question('cccccccc-1111-4000-8000-000000000001', 'pgtap_refill', 3::smallint)), 'النمر',
  'the only drawable question is the one with a new answer');
select is((select count(*)::int from public.draw_question('cccccccc-1111-4000-8000-000000000001', 'pgtap_refill', 3::smallint)), 0,
  '"أسد" never comes back after "الأسد"');

-- ───────── refill API is service-role only ─────────
select throws_ok($$ select public.add_questions('[]'::jsonb, 'ai') $$, '42501', null, 'signed-in users cannot add questions');
select throws_ok($$ select public.refill_context() $$, '42501', null, 'signed-in users cannot read the refill context');
select throws_ok($$ select public.check_refill_token('x') $$, '42501', null, 'signed-in users cannot test refill tokens');
reset role;
set local role anon;
select throws_ok($$ select public.add_questions('[]'::jsonb, 'ai') $$, '42501', null, 'anon cannot add questions');
select throws_ok($$ select * from public.known_refs(array['x']) $$, '42501', null, 'anon cannot list imported refs');
reset role;

set local role service_role;
select is(public.check_refill_token('wrong'), false, 'wrong refill token is refused');
select is(public.check_refill_token(''), false, 'empty refill token is refused');
select is(public.check_refill_token(null), false, 'missing refill token is refused');
select ok(public.refill_context() ? 'stock', 'service role reads the refill context');

select throws_ok($$ select public.add_questions('[]'::jsonb, 'manual') $$, '22023', null, 'only opentdb/ai/picture sources');

create temp table t_res on commit drop as
select public.add_questions(jsonb_build_array(
  jsonb_build_object('category_id', 'pgtap_refill', 'points', 2, 'question', 'pgtap m9 new one?', 'answer', 'الفهد', 'source_ref', 'opentdb:test1'),
  jsonb_build_object('category_id', 'pgtap_refill', 'points', 2, 'question', 'pgtap m9 dup ref?', 'answer', 'الذئب', 'source_ref', 'opentdb:test1'),
  jsonb_build_object('category_id', 'pgtap_refill', 'points', 2, 'question', 'pgtap m9 lion three?', 'answer', 'أسد'),
  jsonb_build_object('category_id', 'pgtap_refill', 'points', 2, 'question', 'pgtap m9 other?', 'answer', 'الضبع'),
  jsonb_build_object('category_id', 'pgtap_refill', 'points', 9, 'question', 'pgtap m9 bad points?', 'answer', 'الصقر'),
  jsonb_build_object('category_id', 'nope', 'points', 2, 'question', 'pgtap m9 bad category?', 'answer', 'الصقر'),
  jsonb_build_object('category_id', 'pgtap_refill', 'points', 2, 'question', 'x', 'answer', 'الصقر')
), 'opentdb') as r;

select is((select r -> 'added' from t_res), '1'::jsonb, 'one valid question added');
select is((select r -> 'skipped' from t_res),
  '{"duplicate": 2, "same_answer": 1, "bad_points": 1, "bad_category": 1, "bad_question": 1}'::jsonb,
  'duplicates, same answers and bad fields are skipped with a reason');
select is((select source || '|' || source_ref from public.questions where question = 'pgtap m9 new one?'),
  'opentdb|opentdb:test1', 'source and ref are saved');
select is((select array_agg(x order by x) from public.known_refs(array['opentdb:test1', 'opentdb:none']) x),
  array['opentdb:test1'], 'known_refs finds imported questions');
reset role;

-- ───────── schedule ─────────
select is((select count(*)::int from cron.job where jobname = 'refill-questions-daily'), 1, 'daily refill job is scheduled');
select is((select count(*)::int from cron.job where jobname = 'refill-questions-daily' and command like '%vault.decrypted_secrets%'),
  1, 'the job reads its token from Vault (no token in the job text)');

select * from finish();
rollback;
