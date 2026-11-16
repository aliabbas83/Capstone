-- M5: start and finish real games on the server, and private team photos.
-- A game costs one credit. The credit is taken and the game created in one step,
-- so the device can never start a game for free.

-- ───────────────────────── start_game ─────────────────────────
create function private.start_game(
  p_team_names   text[],
  p_team_mascots text[],
  p_categories   text[],
  p_team_photos  text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_names  text[];
  v_photos text[];
  v_id     uuid;
  v_n      text;
  v_p      text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- Team names: two, trimmed, 1–20 characters, different from each other.
  if p_team_names is null or cardinality(p_team_names) <> 2 then
    raise exception 'need two team names' using errcode = '22023';
  end if;
  v_names := array[btrim(p_team_names[1]), btrim(p_team_names[2])];
  foreach v_n in array v_names loop
    if v_n is null or char_length(v_n) not between 1 and 20 then
      raise exception 'team name must be 1-20 characters' using errcode = '22023';
    end if;
  end loop;
  if lower(v_names[1]) = lower(v_names[2]) then
    raise exception 'team names must differ' using errcode = '22023';
  end if;

  -- Mascots: two short lowercase ids.
  if p_team_mascots is null or cardinality(p_team_mascots) <> 2
     or exists (select 1 from unnest(p_team_mascots) m where m is null or m !~ '^[a-z]{2,20}$') then
    raise exception 'invalid mascots' using errcode = '22023';
  end if;

  -- Categories: 8 different, active ones.
  if p_categories is null or cardinality(p_categories) <> 8
     or (select count(distinct c) from unnest(p_categories) c) <> 8
     or (select count(*) from public.categories c where c.id = any (p_categories) and c.active) <> 8 then
    raise exception 'need 8 different active categories' using errcode = '22023';
  end if;

  -- Photos: optional; each one must be a file in the caller's own folder.
  if p_team_photos is not null then
    if cardinality(p_team_photos) <> 2 then
      raise exception 'invalid photos' using errcode = '22023';
    end if;
    foreach v_p in array p_team_photos loop
      if v_p is not null and v_p !~ ('^' || v_uid::text || '/[A-Za-z0-9_-]{1,64}\.(jpg|png|webp)$') then
        raise exception 'invalid photo path' using errcode = '22023';
      end if;
    end loop;
    if p_team_photos[1] is not null or p_team_photos[2] is not null then
      v_photos := p_team_photos;
    end if;
  end if;

  -- Take one credit. The "> 0" check and the update happen together, so two taps can't both win.
  update public.profiles set games_credit = games_credit - 1
   where id = v_uid and games_credit > 0;
  if not found then
    raise exception 'no credit' using errcode = 'P0001', hint = 'no_credit';
  end if;

  insert into public.games (owner_id, team_names, team_mascots, team_photos, categories, lane_length)
  values (v_uid, v_names, p_team_mascots, v_photos, p_categories, 20)
  returning id into v_id;

  return v_id;
end;
$$;
revoke execute on function private.start_game(text[], text[], text[], text[]) from public, anon, authenticated;

-- ───────────────────────── finish_game ─────────────────────────
-- winner 0 or 1 → finished; null → abandoned. Only the owner, only an active game.
create function private.finish_game(p_game_id uuid, p_winner smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_winner is not null and p_winner not in (0, 1) then
    raise exception 'invalid winner' using errcode = '22023';
  end if;

  update public.games
     set status = case when p_winner is null then 'abandoned' else 'finished' end,
         winner = p_winner,
         finished_at = now()
   where id = p_game_id and owner_id = v_uid and status = 'active';
  if not found then
    raise exception 'game not found or already finished' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function private.finish_game(uuid, smallint) from public, anon, authenticated;

grant execute on function private.start_game(text[], text[], text[], text[]) to authenticated;
grant execute on function private.finish_game(uuid, smallint) to authenticated;

-- Public API wrappers (security invoker), signed-in users only.
create function public.start_game(
  p_team_names text[], p_team_mascots text[], p_categories text[], p_team_photos text[] default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.start_game(p_team_names, p_team_mascots, p_categories, p_team_photos); $$;

create function public.finish_game(p_game_id uuid, p_winner smallint default null)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.finish_game(p_game_id, p_winner); $$;

revoke execute on function public.start_game(text[], text[], text[], text[]) from public, anon;
revoke execute on function public.finish_game(uuid, smallint) from public, anon;
grant execute on function public.start_game(text[], text[], text[], text[]) to authenticated;
grant execute on function public.finish_game(uuid, smallint) to authenticated;

-- ───────────────────────── team photos (Storage) ─────────────────────────
-- Private bucket. Each account can only touch files in its own folder: "<user id>/<file>".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-photos', 'team-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "team-photos: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'team-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "team-photos: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'team-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "team-photos: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'team-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
