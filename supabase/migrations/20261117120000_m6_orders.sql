-- M6: orders (MyFatoorah payments). The price lives here on the server, never in the app.
-- Orders are created and confirmed only by edge functions (service role). Owners can read theirs.

create table public.orders (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  amount_fils  integer not null check (amount_fils > 0),
  games        smallint not null default 1 check (games between 1 and 10),
  status       text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  invoice_id   text unique,
  payment_id   text,
  return_url   text not null check (char_length(return_url) <= 300),
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);
create index orders_owner_idx on public.orders (owner_id, created_at desc);
alter table public.orders enable row level security;

create policy "orders: read own" on public.orders
  for select to authenticated using ((select auth.uid()) = owner_id);
revoke all on public.orders from anon, authenticated;
grant select (id, amount_fils, games, status, created_at, paid_at) on public.orders to authenticated;

-- ───────────────────────── price ─────────────────────────
-- One game = 1 KWD = 1000 fils.
create function private.game_price_fils() returns integer
language sql immutable set search_path = '' as $$ select 1000 $$;

-- ───────────────────────── create_order ─────────────────────────
-- Called by the create-payment edge function. Limits how many unpaid orders a user can open.
create function private.create_order(p_user uuid, p_return_url text)
returns table (order_id uuid, amount_fils integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent int;
begin
  if p_user is null then
    raise exception 'no user' using errcode = '42501';
  end if;
  select count(*) into v_recent from public.orders o
   where o.owner_id = p_user and o.status = 'pending' and o.created_at > now() - interval '10 minutes';
  if v_recent >= 5 then
    raise exception 'too many pending orders' using errcode = 'P0001', hint = 'rate_limited';
  end if;

  insert into public.orders (owner_id, amount_fils, games, return_url)
  values (p_user, private.game_price_fils(), 1, p_return_url)
  returning id, orders.amount_fils into order_id, amount_fils;
  return next;
end;
$$;

-- ───────────────────────── mark_order_paid ─────────────────────────
-- Called only after the edge function has asked MyFatoorah directly and the payment checks out.
-- Pending → paid happens once; only then is the credit added. Returns true if this call credited.
create function private.mark_order_paid(p_order uuid, p_invoice_id text, p_payment_id text, p_paid_fils integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_games smallint;
begin
  update public.orders o
     set status = 'paid', payment_id = p_payment_id, paid_at = now()
   where o.id = p_order
     and o.status = 'pending'
     and o.invoice_id = p_invoice_id
     and o.amount_fils = p_paid_fils
  returning o.owner_id, o.games into v_owner, v_games;

  if not found then
    return false; -- already paid, wrong invoice, or wrong amount: nothing happens
  end if;

  update public.profiles set games_credit = games_credit + v_games where id = v_owner;
  return true;
end;
$$;

create function private.mark_order_failed(p_order uuid)
returns void
language sql
security definer
set search_path = ''
as $$ update public.orders set status = 'failed' where id = p_order and status = 'pending'; $$;

create function private.set_order_invoice(p_order uuid, p_invoice_id text)
returns void
language sql
security definer
set search_path = ''
as $$ update public.orders set invoice_id = p_invoice_id where id = p_order and invoice_id is null; $$;

revoke execute on function private.game_price_fils() from public, anon, authenticated;
revoke execute on function private.create_order(uuid, text) from public, anon, authenticated;
revoke execute on function private.mark_order_paid(uuid, text, text, integer) from public, anon, authenticated;
revoke execute on function private.mark_order_failed(uuid) from public, anon, authenticated;
revoke execute on function private.set_order_invoice(uuid, text) from public, anon, authenticated;

grant usage on schema private to service_role;
grant execute on function private.game_price_fils() to service_role;
grant execute on function private.create_order(uuid, text) to service_role;
grant execute on function private.mark_order_paid(uuid, text, text, integer) to service_role;
grant execute on function private.mark_order_failed(uuid) to service_role;
grant execute on function private.set_order_invoice(uuid, text) to service_role;

-- Public wrappers so edge functions can call them through the API. Service role ONLY.
create function public.create_order(p_user uuid, p_return_url text)
returns table (order_id uuid, amount_fils integer)
language sql security invoker set search_path = ''
as $$ select * from private.create_order(p_user, p_return_url); $$;

create function public.mark_order_paid(p_order uuid, p_invoice_id text, p_payment_id text, p_paid_fils integer)
returns boolean
language sql security invoker set search_path = ''
as $$ select private.mark_order_paid(p_order, p_invoice_id, p_payment_id, p_paid_fils); $$;

create function public.mark_order_failed(p_order uuid)
returns void
language sql security invoker set search_path = ''
as $$ select private.mark_order_failed(p_order); $$;

create function public.set_order_invoice(p_order uuid, p_invoice_id text)
returns void
language sql security invoker set search_path = ''
as $$ select private.set_order_invoice(p_order, p_invoice_id); $$;

revoke execute on function public.create_order(uuid, text) from public, anon, authenticated;
revoke execute on function public.mark_order_paid(uuid, text, text, integer) from public, anon, authenticated;
revoke execute on function public.mark_order_failed(uuid) from public, anon, authenticated;
revoke execute on function public.set_order_invoice(uuid, text) from public, anon, authenticated;
grant execute on function public.create_order(uuid, text) to service_role;
grant execute on function public.mark_order_paid(uuid, text, text, integer) to service_role;
grant execute on function public.mark_order_failed(uuid) to service_role;
grant execute on function public.set_order_invoice(uuid, text) to service_role;
