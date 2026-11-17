-- RLS and grants on every table: anon sees nothing private, a user only sees
-- their own rows, nobody reads `questions`, and credit can't be changed by the app.
-- Everything runs in a transaction that is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

-- ───────── fixtures (as the database owner) ─────────
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'pgtap-a@test.jawla.invalid', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'pgtap-b@test.jawla.invalid', 'authenticated', 'authenticated');
update public.profiles set games_credit = 3
 where id in ('aaaaaaaa-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-00000000000b');

insert into public.categories (id, name, emoji, color, sort_order)
values ('pgtap_test', 'pgtap test', '?', '#000000', 999);
insert into public.questions (category_id, points, question, answer)
values ('pgtap_test', 2, 'pgtap rls question one?', 'one');

insert into public.games (id, owner_id, team_names, team_mascots, categories) values
  ('aaaaaaaa-1111-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-00000000000a',
   '{"A1","A2"}', '{"fox","cat"}', '{c1,c2,c3,c4,c5,c6,c7,c8}'),
  ('bbbbbbbb-1111-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-00000000000b',
   '{"B1","B2"}', '{"fox","cat"}', '{c1,c2,c3,c4,c5,c6,c7,c8}');

insert into public.orders (id, owner_id, amount_fils, return_url, invoice_id) values
  ('aaaaaaaa-2222-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-00000000000a', 1000, 'jawla://payment', 'pgtap-inv-a'),
  ('bbbbbbbb-2222-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-00000000000b', 1000, 'jawla://payment', 'pgtap-inv-b');

insert into public.seen_questions (user_id, question_id, game_id)
select u, (select id from public.questions where question = 'pgtap rls question one?'), g
  from (values ('aaaaaaaa-0000-4000-8000-00000000000a'::uuid, 'aaaaaaaa-1111-4000-8000-00000000000a'::uuid),
               ('bbbbbbbb-0000-4000-8000-00000000000b'::uuid, 'bbbbbbbb-1111-4000-8000-00000000000b'::uuid)) v(u, g);

-- ───────── RLS switched on everywhere ─────────
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0, 'RLS is enabled on every table in the public schema');
select is(
  (select string_agg(permissive || ':' || qual, ',') from pg_policies where schemaname = 'public' and tablename = 'questions'),
  'RESTRICTIVE:false', 'questions has only the restrictive deny-all policy (no direct reads by design)');

-- ───────── anon (not signed in) ─────────
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok('select count(*) from public.profiles',       '42501', null, 'anon cannot read profiles');
select throws_ok('select count(*) from public.games',          '42501', null, 'anon cannot read games');
select throws_ok('select count(*) from public.orders',         '42501', null, 'anon cannot read orders');
select throws_ok('select count(*) from public.seen_questions', '42501', null, 'anon cannot read seen_questions');
select throws_ok('select count(*) from public.questions',      '42501', null, 'anon cannot read questions');
select throws_ok($$insert into public.profiles (id) values ('cccccccc-0000-4000-8000-00000000000c')$$,
                 '42501', null, 'anon cannot create profiles');
select ok((select count(*) from public.categories) > 0, 'anon can read active categories');
select throws_ok($$update public.categories set name = 'x' where id = 'geo'$$, '42501', null, 'anon cannot change categories');

reset role;

-- ───────── user A ─────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}';

-- profiles
select results_eq('select id from public.profiles',
  $$values ('aaaaaaaa-0000-4000-8000-00000000000a'::uuid)$$, 'A sees only their own profile');
select lives_ok($$update public.profiles set display_name = 'pgtap A' where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  'A can change their own display name');
select is((select display_name from public.profiles), 'pgtap A', 'display name saved');
select lives_ok($$update public.profiles set display_name = 'hacked' where id = 'bbbbbbbb-0000-4000-8000-00000000000b'$$,
  'updating B''s profile runs but touches nothing (checked below)');
select throws_ok($$update public.profiles set games_credit = 99 where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$,
  '42501', null, 'A cannot change their own games_credit');
select throws_ok($$update public.profiles set games_credit = games_credit + 1$$,
  '42501', null, 'A cannot add credit with a relative update');
select throws_ok($$insert into public.profiles (id) values ('cccccccc-0000-4000-8000-00000000000c')$$,
  '42501', null, 'A cannot insert profiles');
select throws_ok($$delete from public.profiles$$, '42501', null, 'A cannot delete profiles');

-- games
select results_eq('select id from public.games',
  $$values ('aaaaaaaa-1111-4000-8000-00000000000a'::uuid)$$, 'A sees only their own games');
select throws_ok($$insert into public.games (owner_id, team_names, team_mascots, categories)
                   values ('aaaaaaaa-0000-4000-8000-00000000000a', '{"x","y"}', '{"fox","cat"}', '{1,2,3,4,5,6,7,8}')$$,
  '42501', null, 'A cannot create games directly (must use start_game)');
select throws_ok($$update public.games set status = 'active', winner = 1$$, '42501', null, 'A cannot update games directly');
select throws_ok($$delete from public.games$$, '42501', null, 'A cannot delete games');

-- seen_questions
select results_eq('select user_id from public.seen_questions',
  $$values ('aaaaaaaa-0000-4000-8000-00000000000a'::uuid)$$, 'A sees only their own seen_questions');
select throws_ok($$delete from public.seen_questions$$, '42501', null, 'A cannot delete seen_questions (would allow repeats)');
select throws_ok($$insert into public.seen_questions (user_id, question_id)
                   values ('bbbbbbbb-0000-4000-8000-00000000000b', 1)$$,
  '42501', null, 'A cannot insert seen_questions');

-- orders
select results_eq('select id from public.orders',
  $$values ('aaaaaaaa-2222-4000-8000-00000000000a'::uuid)$$, 'A sees only their own orders');
select is((select amount_fils from public.orders), 1000, 'A can read the amount of their order');
select throws_ok('select invoice_id from public.orders', '42501', null, 'A cannot read invoice_id');
select throws_ok('select return_url from public.orders', '42501', null, 'A cannot read return_url');
select throws_ok($$insert into public.orders (owner_id, amount_fils, return_url)
                   values ('aaaaaaaa-0000-4000-8000-00000000000a', 1, 'x')$$,
  '42501', null, 'A cannot create orders directly (price is set on the server)');
select throws_ok($$update public.orders set status = 'paid'$$, '42501', null, 'A cannot mark orders paid');

-- questions & categories
select throws_ok('select * from public.questions', '42501', null, 'A cannot read questions directly');
select throws_ok('select answer from public.questions', '42501', null, 'A cannot read answers directly');
select throws_ok($$insert into public.categories (id, name, emoji, color) values ('zz', 'zz', 'z', '#000000')$$,
  '42501', null, 'A cannot add categories');

-- server-only functions that add credit or set prices
select throws_ok($$select public.mark_order_paid('aaaaaaaa-2222-4000-8000-00000000000a', 'pgtap-inv-a', 'p', 1000)$$,
  '42501', null, 'A cannot call mark_order_paid (adds credit)');
select throws_ok($$select * from public.create_order('aaaaaaaa-0000-4000-8000-00000000000a', 'jawla://payment')$$,
  '42501', null, 'A cannot call create_order');
select throws_ok($$select private.mark_order_paid('aaaaaaaa-2222-4000-8000-00000000000a', 'pgtap-inv-a', 'p', 1000)$$,
  '42501', null, 'A cannot call private.mark_order_paid');

reset role;

-- ───────── results checked as the owner ─────────
select is((select display_name from public.profiles where id = 'bbbbbbbb-0000-4000-8000-00000000000b'),
  null, 'B''s profile was not changed by A');
select is((select games_credit from public.profiles where id = 'aaaaaaaa-0000-4000-8000-00000000000a'),
  3, 'A''s credit is unchanged');
select is((select status from public.orders where id = 'aaaaaaaa-2222-4000-8000-00000000000a'),
  'pending', 'A''s order is still pending');

select * from finish();
rollback;
