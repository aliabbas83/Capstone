-- start_game takes exactly 1 credit in the same step that creates the game,
-- fails at 0 credit, and bad input never costs a credit. finish_game only
-- works for the owner on an active game. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- ───────── fixtures ─────────
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'pgtap-a@test.jawla.invalid', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'pgtap-b@test.jawla.invalid', 'authenticated', 'authenticated');

-- 8 active test categories + 1 inactive one (ids may only use a-z and _).
insert into public.categories (id, name, emoji, color, sort_order, active)
select 'pgtap_' || c, 'pgtap ' || c, '?', '#000000', 900, c <> 'z'
  from unnest(array['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'z']) c;

create temp table t_ctx (cats text[], games uuid[] default '{}');
insert into t_ctx (cats) values (array['pgtap_a', 'pgtap_b', 'pgtap_c', 'pgtap_d', 'pgtap_e', 'pgtap_f', 'pgtap_g', 'pgtap_h']);
grant all on t_ctx to public;

-- ───────── not signed in ─────────
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select public.start_game('{"A","B"}', '{"fox","cat"}', (select cats from t_ctx))$$,
  '42501', null, 'anon cannot start a game');
select throws_ok($$select public.finish_game(gen_random_uuid(), 1::smallint)$$,
  '42501', null, 'anon cannot finish a game');
reset role;

-- ───────── user A with 0 credit ─────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}';
select is((select games_credit from public.profiles), 0, 'new account starts with 0 credit');
select throws_ok($$select public.start_game('{"A","B"}', '{"fox","cat"}', (select cats from t_ctx))$$,
  'P0001', 'no credit', 'start_game fails at 0 credit');
select is((select count(*)::int from public.games), 0, 'no game was created without credit');
reset role;

update public.profiles set games_credit = 2 where id = 'aaaaaaaa-0000-4000-8000-00000000000a';

-- ───────── user A with 2 credits ─────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}';

-- Bad input is refused before any credit is taken.
select throws_ok($$select public.start_game('{"Same","same "}', '{"fox","cat"}', (select cats from t_ctx))$$,
  '22023', 'team names must differ', 'team names must differ');
select throws_ok($$select public.start_game('{"A",""}', '{"fox","cat"}', (select cats from t_ctx))$$,
  '22023', null, 'empty team name refused');
select throws_ok($$select public.start_game('{"A","B"}', '{"fox","Cat!"}', (select cats from t_ctx))$$,
  '22023', 'invalid mascots', 'bad mascot id refused');
select throws_ok($$select public.start_game('{"A","B"}', '{"fox","cat"}', (select cats[1:7] from t_ctx))$$,
  '22023', null, '7 categories refused');
select throws_ok($$select public.start_game('{"A","B"}', '{"fox","cat"}', (select cats[1:7] || 'pgtap_a'::text from t_ctx))$$,
  '22023', null, 'duplicate category refused');
select throws_ok($$select public.start_game('{"A","B"}', '{"fox","cat"}', (select cats[1:7] || 'pgtap_z'::text from t_ctx))$$,
  '22023', null, 'inactive category refused');
select throws_ok($$select public.start_game('{"A","B"}', '{"fox","cat"}', (select cats from t_ctx),
                   array['bbbbbbbb-0000-4000-8000-00000000000b/x.jpg', null])$$,
  '22023', 'invalid photo path', 'photo from another user''s folder refused');
select throws_ok($$select public.start_game('{"A","B"}', '{"fox","cat"}', (select cats from t_ctx),
                   array['aaaaaaaa-0000-4000-8000-00000000000a/../x.jpg', null])$$,
  '22023', 'invalid photo path', 'path tricks in photo names refused');
select is((select games_credit from public.profiles), 2, 'refused starts did not take any credit');

-- Good starts.
update t_ctx set games = games || public.start_game('{" Lions ","Tigers"}', '{"fox","cat"}', cats);
select is((select games_credit from public.profiles), 1, 'first game took exactly 1 credit');
select results_eq($$select owner_id, status, team_names, lane_length from public.games$$,
  $$values ('aaaaaaaa-0000-4000-8000-00000000000a'::uuid, 'active'::text, array['Lions', 'Tigers'], 20::smallint)$$,
  'game created for A, active, names trimmed, lane set by the server');

update t_ctx set games = games || public.start_game('{"A","B"}', '{"fox","cat"}', cats,
  array['aaaaaaaa-0000-4000-8000-00000000000a/team_1.jpg', null]);
select is((select games_credit from public.profiles), 0, 'second game took the last credit');
select is((select team_photos from public.games where id = (select games[2] from t_ctx)),
  array['aaaaaaaa-0000-4000-8000-00000000000a/team_1.jpg', null], 'own-folder photo path saved');

select throws_ok($$select public.start_game('{"A","B"}', '{"fox","cat"}', (select cats from t_ctx))$$,
  'P0001', 'no credit', 'third start fails: credit is 0');
select is((select count(*)::int from public.games), 2, 'still exactly 2 games');
reset role;

-- ───────── user B tries to finish A's game ─────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}';
select throws_ok($$select public.finish_game((select games[1] from t_ctx), 0::smallint)$$,
  'P0002', null, 'B cannot finish A''s game');
reset role;

-- ───────── A finishes their games ─────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}';
select is((select status from public.games where id = (select games[1] from t_ctx)), 'active', 'game still active after B''s attempt');
select throws_ok($$select public.finish_game((select games[1] from t_ctx), 2::smallint)$$,
  '22023', 'invalid winner', 'winner must be 0, 1 or null');
select lives_ok($$select public.finish_game((select games[1] from t_ctx), 1::smallint)$$, 'A finishes game 1 with a winner');
select results_eq($$select status, winner, finished_at is not null from public.games where id = (select games[1] from t_ctx)$$,
  $$values ('finished'::text, 1::smallint, true)$$, 'game 1 is finished with winner 1');
select throws_ok($$select public.finish_game((select games[1] from t_ctx), 0::smallint)$$,
  'P0002', null, 'a finished game cannot be finished again (winner can''t be changed)');
select lives_ok($$select public.finish_game((select games[2] from t_ctx))$$, 'A abandons game 2 (no winner)');
select results_eq($$select status, winner from public.games where id = (select games[2] from t_ctx)$$,
  $$values ('abandoned'::text, null::smallint)$$, 'game 2 is abandoned');
select throws_ok($$select * from public.draw_question((select games[1] from t_ctx), 'pgtap_a', 2::smallint)$$,
  '22023', 'game is not active', 'a finished game gives no more questions');
reset role;

-- ───────── database guard ─────────
select throws_ok($$update public.profiles set games_credit = -1 where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  '23514', null, 'credit can never go below 0 (check constraint)');

select * from finish();
rollback;
