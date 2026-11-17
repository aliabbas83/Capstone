-- Storage bucket `team-photos`: private, 2 MB, images only, and each account
-- can only add, see and delete files in its own folder "<user id>/...".
-- Rolled back at the end, so no real files are touched.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- ───────── fixtures ─────────
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'pgtap-a@test.jawla.invalid', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'pgtap-b@test.jawla.invalid', 'authenticated', 'authenticated');

-- Direct deletes from storage tables are blocked by a Supabase trigger unless
-- this setting is on; turn it on so the delete policy itself is tested.
set local storage.allow_delete_query = 'true';

-- ───────── bucket settings ─────────
select results_eq($$select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'team-photos'$$,
  $$values (false, 2097152::bigint, array['image/jpeg', 'image/png', 'image/webp'])$$,
  'team-photos is private, 2 MB max, jpg/png/webp only');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
            and policyname like 'team-photos:%' and cmd = 'UPDATE'), 0,
  'no update policy: files cannot be overwritten or moved');

-- ───────── user A ─────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}';
select lives_ok($$insert into storage.objects (bucket_id, name) values ('team-photos', 'aaaaaaaa-0000-4000-8000-00000000000a/pgtap_a.jpg')$$,
  'A can upload into their own folder');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('team-photos', 'bbbbbbbb-0000-4000-8000-00000000000b/pgtap_evil.jpg')$$,
  '42501', null, 'A cannot upload into B''s folder');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('team-photos', 'pgtap_root.jpg')$$,
  '42501', null, 'A cannot upload outside any folder');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('team-photos', 'pgtap/aaaaaaaa-0000-4000-8000-00000000000a/x.jpg')$$,
  '42501', null, 'A cannot upload into a folder that only contains their id deeper down');
reset role;

-- ───────── user B ─────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}';
select lives_ok($$insert into storage.objects (bucket_id, name) values ('team-photos', 'bbbbbbbb-0000-4000-8000-00000000000b/pgtap_b.png')$$,
  'B can upload into their own folder');
select results_eq($$select name from storage.objects where bucket_id = 'team-photos' and name like '%pgtap%'$$,
  $$values ('bbbbbbbb-0000-4000-8000-00000000000b/pgtap_b.png'::text)$$, 'B only sees their own file');
select lives_ok($$update storage.objects set name = 'bbbbbbbb-0000-4000-8000-00000000000b/stolen.jpg'
                  where name = 'aaaaaaaa-0000-4000-8000-00000000000a/pgtap_a.jpg'$$,
  'B''s update of A''s file runs but touches nothing (checked below)');
select lives_ok($$delete from storage.objects where name = 'aaaaaaaa-0000-4000-8000-00000000000a/pgtap_a.jpg'$$,
  'B''s delete of A''s file runs but touches nothing (checked below)');
reset role;

-- ───────── user A again ─────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}';
select results_eq($$select name from storage.objects where bucket_id = 'team-photos' and name like '%pgtap%'$$,
  $$values ('aaaaaaaa-0000-4000-8000-00000000000a/pgtap_a.jpg'::text)$$, 'A''s file is still there and A sees only it');
select lives_ok($$update storage.objects set name = 'aaaaaaaa-0000-4000-8000-00000000000a/renamed.jpg'
                  where name = 'aaaaaaaa-0000-4000-8000-00000000000a/pgtap_a.jpg'$$,
  'A''s own update runs but touches nothing (no update policy)');
select is((select count(*)::int from storage.objects where name = 'aaaaaaaa-0000-4000-8000-00000000000a/pgtap_a.jpg'),
  1, 'A''s file was not renamed');
select lives_ok($$delete from storage.objects where name = 'aaaaaaaa-0000-4000-8000-00000000000a/pgtap_a.jpg'$$,
  'A can delete their own file');
reset role;

-- ───────── anon ─────────
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select count(*)::int from storage.objects where bucket_id = 'team-photos'), 0, 'anon sees no team photos');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('team-photos', 'aaaaaaaa-0000-4000-8000-00000000000a/anon.jpg')$$,
  '42501', null, 'anon cannot upload');
reset role;

-- ───────── checks as the owner ─────────
select is((select count(*)::int from storage.objects where name = 'aaaaaaaa-0000-4000-8000-00000000000a/pgtap_a.jpg'),
  0, 'A''s own delete worked');
select is((select count(*)::int from storage.objects where name = 'bbbbbbbb-0000-4000-8000-00000000000b/pgtap_b.png'),
  1, 'B''s file is untouched');
select is((select count(*)::int from storage.objects where name like '%/stolen.jpg' or name like '%/renamed.jpg' or name like '%pgtap_evil%'),
  0, 'no file was moved, renamed or planted in another folder');

select * from finish();
rollback;
