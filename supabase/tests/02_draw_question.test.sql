-- draw_question / remaining_questions: sign-in needed, never repeats a question
-- for an account, records every draw, and respects the M8 game limits
-- (6 hours / 100 questions). Uses its own test category so it does not depend
-- on the real question bank. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- ───────── fixtures ─────────
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'pgtap-a@test.jawla.invalid', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'pgtap-b@test.jawla.invalid', 'authenticated', 'authenticated');

insert into public.categories (id, name, emoji, color, sort_order)
values ('pgtap_test', 'pgtap test', '?', '#000000', 999);

-- 5 active questions worth 3 points, 1 inactive one, and 100 inactive fillers worth 2.
insert into public.questions (category_id, points, question, answer)
select 'pgtap_test', 3, 'pgtap question ' || i || '?', 'answer ' || i from generate_series(1, 5) i;
insert into public.questions (category_id, points, question, answer, active)
values ('pgtap_test', 3, 'pgtap inactive question?', 'never', false);
insert into public.questions (category_id, points, question, answer, active)
select 'pgtap_test', 2, 'pgtap filler ' || i || '?', 'filler', false from generate_series(1, 100) i;

-- Every game uses the test category plus 7 placeholder ids.
create temp table t_cats as select array['pgtap_test', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'] as cats;

insert into public.games (id, owner_id, team_names, team_mascots, categories, created_at, status)
select g.id, g.owner, '{"T1","T2"}', '{"fox","cat"}', (select cats from t_cats), g.created, g.status
  from (values
    ('aaaaaaaa-1111-4000-8000-000000000001'::uuid, 'aaaaaaaa-0000-4000-8000-00000000000a'::uuid, now(),                                   'active'),   -- A main
    ('aaaaaaaa-1111-4000-8000-000000000002'::uuid, 'aaaaaaaa-0000-4000-8000-00000000000a'::uuid, now(),                                   'active'),   -- A second game
    ('aaaaaaaa-1111-4000-8000-000000000003'::uuid, 'aaaaaaaa-0000-4000-8000-00000000000a'::uuid, now() - interval '6 hours 1 minute',     'active'),   -- A expired
    ('aaaaaaaa-1111-4000-8000-000000000004'::uuid, 'aaaaaaaa-0000-4000-8000-00000000000a'::uuid, now(),                                   'finished'), -- A finished
    ('aaaaaaaa-1111-4000-8000-000000000005'::uuid, 'aaaaaaaa-0000-4000-8000-00000000000a'::uuid, now(),                                   'active'),   -- A with 100 questions
    ('bbbbbbbb-1111-4000-8000-000000000001'::uuid, 'bbbbbbbb-0000-4000-8000-00000000000b'::uuid, now() - interval '5 hours 59 minutes',   'active'),   -- B, almost 6 h old
    ('bbbbbbbb-1111-4000-8000-000000000002'::uuid, 'bbbbbbbb-0000-4000-8000-00000000000b'::uuid, now(),                                   'active')    -- B with 99 questions
  ) g(id, owner, created, status);

-- A has already seen question 1 (from an older game).
insert into public.seen_questions (user_id, question_id)
select 'aaaaaaaa-0000-4000-8000-00000000000a', id from public.questions where question = 'pgtap question 1?';

-- Game ...005 (A) already used 100 questions; game ...b002 (B) used 99.
insert into public.seen_questions (user_id, question_id, game_id)
select 'aaaaaaaa-0000-4000-8000-00000000000a', id, 'aaaaaaaa-1111-4000-8000-000000000005'
  from public.questions where question like 'pgtap filler %';
insert into public.seen_questions (user_id, question_id, game_id)
select 'bbbbbbbb-0000-4000-8000-00000000000b', id, 'bbbbbbbb-1111-4000-8000-000000000002'
  from public.questions where question like 'pgtap filler %' order by id limit 99;

create temp table t_drawn (n int, question_id bigint, answer text);
grant all on t_drawn to public;

-- ───────── not signed in ─────────
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select * from public.draw_question('aaaaaaaa-1111-4000-8000-000000000001', 'pgtap_test', 3::smallint)$$,
  '42501', null, 'anon cannot call draw_question');
select throws_ok($$select * from public.remaining_questions(array['pgtap_test'])$$,
  '42501', null, 'anon cannot call remaining_questions');
reset role;

-- A signed-in role with no user id (sub) is refused too.
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok($$select * from public.draw_question('aaaaaaaa-1111-4000-8000-000000000001', 'pgtap_test', 3::smallint)$$,
  '42501', 'not signed in', 'draw_question needs a user id');
reset role;

-- ───────── user A ─────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}';

select results_eq($$select category_id, points, remaining from public.remaining_questions(array['pgtap_test'])$$,
  $$values ('pgtap_test'::text, 3::smallint, 4)$$,
  'remaining_questions counts only active, unseen questions (5 active - 1 seen = 4)');

select throws_ok($$select * from public.draw_question('bbbbbbbb-1111-4000-8000-000000000002', 'pgtap_test', 3::smallint)$$,
  'P0002', 'game not found', 'A cannot draw from B''s game');
select throws_ok($$select * from public.draw_question('aaaaaaaa-1111-4000-8000-000000000001', 'pgtap_test', 7::smallint)$$,
  '22023', 'invalid points', 'points must be 2, 3, 4 or 5');
select throws_ok($$select * from public.draw_question('aaaaaaaa-1111-4000-8000-000000000001', 'geo_not_in_game', 3::smallint)$$,
  '22023', 'category not in this game', 'category must belong to the game');
select throws_ok($$select * from public.draw_question('aaaaaaaa-1111-4000-8000-000000000004', 'pgtap_test', 3::smallint)$$,
  '22023', 'game is not active', 'finished game gives no questions');
select throws_ok($$select * from public.draw_question('aaaaaaaa-1111-4000-8000-000000000003', 'pgtap_test', 3::smallint)$$,
  '22023', 'game expired', 'game older than 6 hours gives no questions');
select throws_ok($$select * from public.draw_question('aaaaaaaa-1111-4000-8000-000000000005', 'pgtap_test', 3::smallint)$$,
  '22023', 'question limit reached', 'game with 100 questions gives no more');

-- Draw 6 times from the main game: 4 questions, then nothing.
do $$
begin
  for i in 1..6 loop
    insert into t_drawn (n, question_id, answer)
    select i, d.question_id, d.answer
      from public.draw_question('aaaaaaaa-1111-4000-8000-000000000001', 'pgtap_test', 3::smallint) d;
  end loop;
end $$;

select is((select count(*)::int from t_drawn), 4, 'only the 4 unseen questions were handed out');
select is((select count(distinct question_id)::int from t_drawn), 4, 'no question was handed out twice');
select is((select max(n) from t_drawn), 4, 'draws 5 and 6 returned nothing (bank empty for A)');
select is(
  (select count(*)::int from t_drawn d
     join public.seen_questions s on s.question_id = d.question_id
    where s.user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'
      and s.game_id = 'aaaaaaaa-1111-4000-8000-000000000001'),
  4, 'every draw was recorded in seen_questions for this game');
select is((select remaining from public.remaining_questions(array['pgtap_test'])), null::int,
  'remaining_questions shows nothing left for A');
select is((select string_agg(answer, ',') from t_drawn where answer like 'answer %'),
  (select string_agg(answer, ',') from t_drawn), 'draw_question returns the answer with the question');
select is((select count(*)::int from t_drawn where answer in ('answer 1', 'never')), 0,
  'already-seen and inactive questions are never handed out');
select is_empty($$select * from public.draw_question('aaaaaaaa-1111-4000-8000-000000000002', 'pgtap_test', 3::smallint)$$,
  'a new game of the same account still gets no repeats');

reset role;

-- ───────── user B (separate account, separate history) ─────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}';

select results_eq($$select remaining from public.remaining_questions(array['pgtap_test'])$$,
  $$values (5)$$, 'B still has all 5 questions (history is per account)');
select is((select count(*)::int from public.draw_question('bbbbbbbb-1111-4000-8000-000000000001', 'pgtap_test', 3::smallint)),
  1, 'game almost 6 hours old still works');
select is((select count(*)::int from public.draw_question('bbbbbbbb-1111-4000-8000-000000000002', 'pgtap_test', 3::smallint)),
  1, 'game with 99 questions gives one more (the 100th)');
select throws_ok($$select * from public.draw_question('bbbbbbbb-1111-4000-8000-000000000002', 'pgtap_test', 3::smallint)$$,
  '22023', 'question limit reached', 'then the 100-question limit applies');
select results_eq($$select remaining from public.remaining_questions(array['pgtap_test'])$$,
  $$values (3)$$, 'remaining_questions went down by one per draw');
select is((select count(*)::int from public.seen_questions where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 0,
  'B cannot see A''s seen_questions');

reset role;

-- ───────── checks as the owner ─────────
select is((select count(*)::int from public.seen_questions s join public.questions q on q.id = s.question_id
            where q.category_id = 'pgtap_test' and q.points = 3
              and s.user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 5,
  'A has seen all 5 active questions exactly once (primary key user + question)');
select throws_ok($$insert into public.seen_questions (user_id, question_id)
                   select 'aaaaaaaa-0000-4000-8000-00000000000a', id from public.questions where question = 'pgtap question 2?'$$,
  '23505', null, 'the database itself refuses a repeat for the same account');
select ok(not has_function_privilege('anon', 'public.draw_question(uuid, text, smallint)', 'execute'),
  'anon has no execute right on draw_question');

select * from finish();
rollback;
