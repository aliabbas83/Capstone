-- Orders: the price is set on the server, only the service role (edge functions)
-- can create or confirm orders, and credit is added once, only when invoice +
-- order + amount match. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- ───────── fixtures ─────────
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'pgtap-a@test.jawla.invalid', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'pgtap-b@test.jawla.invalid', 'authenticated', 'authenticated');

create temp table t_orders (name text primary key, id uuid, amount integer);
grant all on t_orders to public;

-- ───────── function shape: the app can never send a price ─────────
select is((select count(*)::int from pg_proc where proname = 'create_order' and pronamespace = 'public'::regnamespace),
  1, 'only one public.create_order exists');
select has_function('public', 'create_order', array['uuid', 'text'], 'create_order takes only (user, return_url), no amount');
select is(private.game_price_fils(), 1000, 'price is 1000 fils (1 KWD) on the server');

-- ───────── anon / signed-in users cannot touch order functions ─────────
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select * from public.create_order('aaaaaaaa-0000-4000-8000-00000000000a', 'jawla://payment')$$,
  '42501', null, 'anon cannot create orders');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}';
select throws_ok($$select * from public.create_order('aaaaaaaa-0000-4000-8000-00000000000a', 'jawla://payment')$$,
  '42501', null, 'a user cannot call create_order');
select throws_ok($$select public.set_order_invoice(gen_random_uuid(), 'x')$$,
  '42501', null, 'a user cannot call set_order_invoice');
select throws_ok($$select public.mark_order_paid(gen_random_uuid(), 'x', 'y', 1000)$$,
  '42501', null, 'a user cannot call mark_order_paid');
select throws_ok($$select public.mark_order_failed(gen_random_uuid())$$,
  '42501', null, 'a user cannot call mark_order_failed');
select throws_ok($$select private.create_order('aaaaaaaa-0000-4000-8000-00000000000a', 'jawla://payment')$$,
  '42501', null, 'a user cannot call private.create_order');
reset role;

-- ───────── service role (what the edge functions use) ─────────
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

insert into t_orders select 'a1', order_id, amount_fils
  from public.create_order('aaaaaaaa-0000-4000-8000-00000000000a', 'jawla://payment');
select is((select amount from t_orders where name = 'a1'), 1000, 'create_order returns the server price');
select results_eq($$select owner_id, amount_fils, games, status from public.orders where id = (select id from t_orders where name = 'a1')$$,
  $$values ('aaaaaaaa-0000-4000-8000-00000000000a'::uuid, 1000, 1::smallint, 'pending'::text)$$,
  'order saved as pending, 1 game, 1000 fils');

select lives_ok($$select public.set_order_invoice((select id from t_orders where name = 'a1'), 'pgtap-inv-1')$$, 'invoice id attached');
select lives_ok($$select public.set_order_invoice((select id from t_orders where name = 'a1'), 'pgtap-inv-other')$$, 'second attach runs');
select is((select invoice_id from public.orders where id = (select id from t_orders where name = 'a1')),
  'pgtap-inv-1', 'invoice id cannot be replaced once set');

select is(public.mark_order_paid((select id from t_orders where name = 'a1'), 'pgtap-inv-1', 'pay-1', 1),
  false, 'paid amount lower than the price: not credited');
select is(public.mark_order_paid((select id from t_orders where name = 'a1'), 'pgtap-inv-wrong', 'pay-1', 1000),
  false, 'wrong invoice id: not credited');
select is((select games_credit from public.profiles where id = 'aaaaaaaa-0000-4000-8000-00000000000a'),
  0, 'credit unchanged after bad confirmations');

select is(public.mark_order_paid((select id from t_orders where name = 'a1'), 'pgtap-inv-1', 'pay-1', 1000),
  true, 'matching invoice + amount: credited');
select is((select games_credit from public.profiles where id = 'aaaaaaaa-0000-4000-8000-00000000000a'),
  1, 'credit went up by exactly 1');
select is(public.mark_order_paid((select id from t_orders where name = 'a1'), 'pgtap-inv-1', 'pay-1', 1000),
  false, 'confirming the same order again does nothing');
select is((select games_credit from public.profiles where id = 'aaaaaaaa-0000-4000-8000-00000000000a'),
  1, 'credit still 1 after the repeat');
select lives_ok($$select public.mark_order_failed((select id from t_orders where name = 'a1'))$$, 'mark_order_failed on a paid order runs');
select is((select status from public.orders where id = (select id from t_orders where name = 'a1')),
  'paid', 'a paid order cannot be turned into failed');

-- A failed order can never be paid.
insert into t_orders select 'a2', order_id, amount_fils
  from public.create_order('aaaaaaaa-0000-4000-8000-00000000000a', 'jawla://payment');
do $$
begin
  perform public.set_order_invoice((select id from t_orders where name = 'a2'), 'pgtap-inv-2');
  perform public.mark_order_failed((select id from t_orders where name = 'a2'));
end $$;
select is(public.mark_order_paid((select id from t_orders where name = 'a2'), 'pgtap-inv-2', 'pay-2', 1000),
  false, 'a failed order cannot be credited');

-- Rate limit: 5 pending orders per 10 minutes.
do $$
begin
  for i in 1..5 loop
    insert into t_orders select 'b' || i, order_id, amount_fils
      from public.create_order('bbbbbbbb-0000-4000-8000-00000000000b', 'jawla://payment');
  end loop;
end $$;
select is((select count(*)::int from public.orders where owner_id = 'bbbbbbbb-0000-4000-8000-00000000000b' and status = 'pending'),
  5, '5 pending orders allowed');
select throws_ok($$select * from public.create_order('bbbbbbbb-0000-4000-8000-00000000000b', 'jawla://payment')$$,
  'P0001', 'too many pending orders', 'the 6th pending order within 10 minutes is refused');
reset role;

-- ───────── users only see their own orders ─────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}';
select is((select count(*)::int from public.orders), 5, 'B sees only their own 5 orders');
select is((select count(*)::int from public.orders where id in (select id from t_orders where name like 'a%')),
  0, 'B cannot see A''s orders');
reset role;

select * from finish();
rollback;
