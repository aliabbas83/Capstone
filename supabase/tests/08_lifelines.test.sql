-- M15: wrong answers for the "pick from two answers" lifeline.
-- Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- ───────── shape and access ─────────
select has_column('public', 'questions', 'wrong_answer', 'questions have a wrong_answer column');
select matches(pg_get_function_result('public.draw_question(uuid, text, smallint)'::regprocedure),
  'wrong_answer text', 'draw_question returns the wrong answer');
select ok(not has_function_privilege('anon', 'public.draw_question(uuid, text, smallint)', 'execute'),
  'anon cannot draw questions');
select ok(has_function_privilege('authenticated', 'public.draw_question(uuid, text, smallint)', 'execute'),
  'signed-in users can draw questions');
select ok(not has_function_privilege('authenticated', 'public.set_wrong_answers(jsonb)', 'execute'),
  'app users cannot write wrong answers');
select ok(not has_function_privilege('authenticated', 'public.questions_missing_wrong(int)', 'execute'),
  'app users cannot list the question bank');
select ok(has_function_privilege('service_role', 'public.set_wrong_answers(jsonb)', 'execute'),
  'the server function can write wrong answers');

-- ───────── fixtures ─────────
insert into public.questions (id, category_id, points, question, answer, source)
overriding system value
values (990001, 'general', 3, 'pgtap lifeline question?', 'الكويت', 'manual');

-- ───────── every item is checked again before it is saved ─────────
select is(private.set_wrong_answers('[{"id": 990001, "wrong": "الكويت"}]'::jsonb), 0,
  'the right answer is never saved as the wrong one');
select is(private.set_wrong_answers(jsonb_build_array(jsonb_build_object('id', 990001, 'wrong', repeat('ا', 121)))), 0,
  'a wrong answer over 120 characters is skipped');
select is(private.set_wrong_answers('[{"id": 990001, "wrong": "<b>قطر</b>"}]'::jsonb), 0,
  'markup is skipped');
select is(private.set_wrong_answers('[{"id": "990001", "wrong": "قطر"}, {"wrong": "قطر"}, "x"]'::jsonb), 0,
  'badly shaped items are skipped');
select is(private.set_wrong_answers('[{"id": 990001, "wrong": "  قطر  "}]'::jsonb), 1,
  'a good wrong answer is saved');
select is((select wrong_answer from public.questions where id = 990001), 'قطر', 'saved trimmed');
select is(private.set_wrong_answers('[{"id": 990001, "wrong": "البحرين"}]'::jsonb), 0,
  'a question that has a wrong answer is not overwritten');

select * from finish();
rollback;
