-- M10: the 14 categories, picture questions (flags / map outlines) and their bucket.
-- Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- ───────── categories ─────────
select is((select count(*)::int from public.categories where active), 14, '14 active categories');
select is((select array_agg(id order by id) from public.categories where not active),
  array['food', 'science', 'sports'], 'science, sports and food are retired (hidden, not deleted)');
select is((select name from public.categories where id = 'flags'), 'أعلام', 'flags category exists');
select ok((select count(*) from public.questions where category_id = 'football' and source = 'manual') >= 13,
  'football questions moved from sports');

-- ───────── answer key ─────────
select is(private.answer_key('اليابان', 'flags', true), 'flags:img:يابان', 'picture answers are per category');
select isnt(private.answer_key('اليابان', 'flags', true), private.answer_key('اليابان', 'geo', true),
  'the flag and the map of a country are different answers');
select isnt(private.answer_key('اليابان', 'flags', true), private.answer_key('اليابان', 'geo', false),
  'a picture answer does not block a text answer');

-- ───────── table rules ─────────
select throws_ok($$ insert into public.questions (category_id, points, question, answer, source)
                    values ('geo', 2, 'pgtap picture without image?', 'x', 'picture') $$,
  '23514', null, 'a picture question needs a picture');
select throws_ok($$ insert into public.questions (category_id, points, question, answer, source, image_path)
                    values ('geo', 2, 'pgtap bad name?', 'x', 'picture', 'kuwait.png') $$,
  '23514', null, 'picture names must be random hex (never the answer)');

-- ───────── fixtures ─────────
insert into auth.users (id, email, aud, role) values
  ('dddddddd-0000-4000-8000-00000000000d', 'pgtap-d@test.jawla.invalid', 'authenticated', 'authenticated');
insert into public.categories (id, name, emoji, color, sort_order)
values ('pgtap_pics', 'pgtap pics', '?', '#000000', 997);

set local role service_role;
create temp table t_add on commit drop as
select public.add_questions(jsonb_build_array(
  jsonb_build_object('category_id', 'pgtap_pics', 'points', 2, 'question', 'pgtap whose flag?', 'answer', 'توفالو',
                     'source_ref', 'flag:PGTAP1', 'image_path', repeat('a', 32) || '.png'),
  jsonb_build_object('category_id', 'pgtap_pics', 'points', 4, 'question', 'pgtap whose flag?', 'answer', 'كندا',
                     'source_ref', 'flag:PGTAP2', 'image_path', repeat('b', 32) || '.png'),
  jsonb_build_object('category_id', 'pgtap_pics', 'points', 2, 'question', 'pgtap no picture?', 'answer', 'مصر',
                     'source_ref', 'flag:PGTAP3'),
  jsonb_build_object('category_id', 'pgtap_pics', 'points', 2, 'question', 'pgtap bad picture?', 'answer', 'تونس',
                     'source_ref', 'flag:PGTAP4', 'image_path', '../x.png')
), 'picture') as r;
create temp table t_text on commit drop as
select public.add_questions(jsonb_build_array(
  jsonb_build_object('category_id', 'pgtap_pics', 'points', 3, 'question', 'pgtap text about Tuvalu?', 'answer', 'توفالو'),
  jsonb_build_object('category_id', 'pgtap_pics', 'points', 3, 'question', 'pgtap text with picture?', 'answer', 'الهند',
                     'image_path', repeat('c', 32) || '.png')
), 'ai') as r;
reset role;

select is((select r -> 'added' from t_add), '2'::jsonb, 'two flags with the same question words are both saved');
select is((select r -> 'skipped' from t_add), '{"bad_image": 2}'::jsonb, 'picture without image, or a bad name, is refused');
select is((select r from t_text), '{"added": 1, "skipped": {"bad_image": 1}}'::jsonb,
  'a text question about Tuvalu is fine next to the flag of Tuvalu; text sources cannot add pictures');

insert into public.games (id, owner_id, team_names, team_mascots, categories)
values ('dddddddd-1111-4000-8000-000000000001', 'dddddddd-0000-4000-8000-00000000000d',
        '{"T1","T2"}', '{"fox","cat"}', array['pgtap_pics', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']);

-- ───────── draw (as D) ─────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-00000000000d","role":"authenticated"}';
create temp table t_d1 on commit drop as
select * from public.draw_question('dddddddd-1111-4000-8000-000000000001', 'pgtap_pics', 2::smallint);
select is((select count(*)::int from t_d1), 1, 'a picture question is drawn');
select matches((select image_path from t_d1), '^[0-9a-f]{32}\.png$', 'draw_question returns the picture name');
select is((select answer from public.draw_question('dddddddd-1111-4000-8000-000000000001', 'pgtap_pics', 3::smallint)),
  'توفالو', 'seeing a flag does not block the text question with the same country');
reset role;

-- ───────── bucket ─────────
select is((select public from storage.buckets where id = 'question-images'), true, 'question pictures are public to read');
select is((select allowed_mime_types from storage.buckets where id = 'question-images'),
  array['image/png', 'image/svg+xml'], 'only PNG and SVG pictures');
set local role anon;
select is((select count(*)::int from storage.objects where bucket_id = 'question-images'), 0,
  'nobody can list the picture names');
reset role;

-- ───────── live bank ─────────
select ok((select count(*) from public.questions where category_id = 'flags' and source = 'picture' and active) >= 190,
  'flags are in the bank');
select ok((select count(*) from public.questions where category_id = 'geo' and source = 'picture' and active) >= 150,
  'map outlines are in the bank');

select * from finish();
rollback;
