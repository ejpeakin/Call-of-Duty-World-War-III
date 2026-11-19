-- =====================================================================
--  FortDay accounts, friends and party invites.
--  Run this whole file once in Supabase: SQL Editor → New query → paste → Run.
--  Running it again is safe: it only adds what is missing and replaces the functions.
--
--  Emails stay private: they live only in Supabase's own auth.users table. Players can see
--  each other's player names, never emails. All writes go through the functions below,
--  which check who is calling.
-- =====================================================================

-- ---------------------------------------------------------------- tables
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  email_notify boolean not null default true,   -- email me friend requests and party invites
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

-- a pending row is a friend request; an accepted row is a friendship (in either direction)
create table if not exists public.friend_requests (
  id bigint generated always as identity primary key,
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  emailed_at timestamptz,
  check (from_id <> to_id),
  unique (from_id, to_id)
);
create index if not exists friend_requests_to on public.friend_requests (to_id);

-- an invite to join a room (the 4-letter code); it lasts 30 minutes
create table if not exists public.party_invites (
  id bigint generated always as identity primary key,
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  code text not null check (code ~ '^[A-Z]{4}$'),
  created_at timestamptz not null default now(),
  emailed_at timestamptz
);
create index if not exists party_invites_to on public.party_invites (to_id, created_at desc);

-- ---------------------------------------------------------------- who can read what
alter table public.profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.party_invites enable row level security;

drop policy if exists "players can look up names" on public.profiles;
create policy "players can look up names" on public.profiles for select to authenticated using (true);
drop policy if exists "see your own requests" on public.friend_requests;
create policy "see your own requests" on public.friend_requests for select to authenticated using (auth.uid() in (from_id, to_id));
drop policy if exists "see your own invites" on public.party_invites;
create policy "see your own invites" on public.party_invites for select to authenticated using (auth.uid() in (from_id, to_id));
-- no insert / update / delete policies: changes only happen through the functions below
grant select on public.profiles, public.friend_requests, public.party_invites to authenticated;
revoke insert, update, delete on public.profiles, public.friend_requests, public.party_invites from anon, authenticated;
revoke all on public.profiles, public.friend_requests, public.party_invites from anon;
grant select, update on public.profiles, public.friend_requests, public.party_invites to service_role;   -- the email function

-- ---------------------------------------------------------------- new account → profile
-- the player name comes from the sign-up form (user metadata "username")
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username) values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- helpers
create or replace function public.username_available(name text) returns boolean
language sql stable security definer set search_path = public as $$
  select name ~ '^[A-Za-z0-9_]{3,16}$' and not exists (select 1 from profiles where lower(username) = lower(name));
$$;

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friend_requests where status = 'accepted' and ((from_id = a and to_id = b) or (from_id = b and to_id = a)));
$$;

-- everything the Friends card shows, in one call
create or replace function public.social_state() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'me', (select json_build_object('id', p.id, 'username', p.username, 'email_notify', p.email_notify) from profiles p where p.id = auth.uid()),
    'friends', coalesce((select json_agg(json_build_object('id', p.id, 'username', p.username) order by lower(p.username))
      from profiles p where p.id in (select case when r.from_id = auth.uid() then r.to_id else r.from_id end
        from friend_requests r where r.status = 'accepted' and auth.uid() in (r.from_id, r.to_id))), '[]'::json),
    'incoming', coalesce((select json_agg(json_build_object('id', r.id, 'from', p.id, 'username', p.username) order by r.created_at desc)
      from friend_requests r join profiles p on p.id = r.from_id where r.to_id = auth.uid() and r.status = 'pending'), '[]'::json),
    'outgoing', coalesce((select json_agg(json_build_object('id', r.id, 'to', p.id, 'username', p.username) order by r.created_at desc)
      from friend_requests r join profiles p on p.id = r.to_id where r.from_id = auth.uid() and r.status = 'pending'), '[]'::json),
    'invites', coalesce((select json_agg(json_build_object('id', i.id, 'from', p.id, 'username', p.username, 'code', i.code) order by i.created_at desc)
      from party_invites i join profiles p on p.id = i.from_id where i.to_id = auth.uid() and i.created_at > now() - interval '30 minutes'), '[]'::json)
  );
$$;

-- player names that start with what you typed (not you)
create or replace function public.search_players(q text) returns table (id uuid, username text)
language plpgsql stable security definer set search_path = public as $$
declare clean text := regexp_replace(coalesce(q, ''), '[^A-Za-z0-9_]', '', 'g');
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if length(clean) < 2 then return; end if;
  return query select p.id, p.username from profiles p
    where lower(p.username) like replace(lower(clean), '_', '\_') || '%' and p.id <> auth.uid()
    order by length(p.username), lower(p.username) limit 8;
end $$;

-- ---------------------------------------------------------------- friend requests
-- returns {result: 'sent' | 'accepted' | 'already' | 'friends', id}
create or replace function public.send_friend_request(target uuid) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r friend_requests;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if target = me then raise exception 'That''s you!'; end if;
  if not exists (select 1 from profiles where id = target) then raise exception 'No player with that name'; end if;
  select * into r from friend_requests where (from_id = me and to_id = target) or (from_id = target and to_id = me) order by status limit 1;
  if found then
    if r.status = 'accepted' then return json_build_object('result', 'friends', 'id', r.id); end if;
    if r.from_id = target then   -- they already asked you, so now you're friends
      update friend_requests set status = 'accepted' where id = r.id;
      return json_build_object('result', 'accepted', 'id', r.id);
    end if;
    return json_build_object('result', 'already', 'id', r.id);
  end if;
  if (select count(*) from friend_requests where from_id = me and status = 'pending') >= 50 then
    raise exception 'You have 50 friend requests waiting. Cancel some first.';
  end if;
  insert into friend_requests (from_id, to_id) values (me, target) returning * into r;
  return json_build_object('result', 'sent', 'id', r.id);
end $$;

create or replace function public.respond_friend_request(req bigint, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if accept then update friend_requests set status = 'accepted' where id = req and to_id = auth.uid() and status = 'pending';
  else delete from friend_requests where id = req and to_id = auth.uid() and status = 'pending'; end if;
  if not found then raise exception 'That friend request is gone'; end if;
end $$;

create or replace function public.cancel_friend_request(req bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  delete from friend_requests where id = req and from_id = auth.uid() and status = 'pending';
end $$;

create or replace function public.remove_friend(other uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  delete from friend_requests where status = 'accepted' and ((from_id = auth.uid() and to_id = other) or (from_id = other and to_id = auth.uid()));
end $$;

create or replace function public.set_email_notify(want boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  update profiles set email_notify = want where id = auth.uid();
end $$;

-- ---------------------------------------------------------------- party invites
-- returns {result: 'sent' | 'already', id}
create or replace function public.send_party_invite(target uuid, room text) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); new_id bigint;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if room is null or room !~ '^[A-Z]{4}$' then raise exception 'That room code isn''t right'; end if;
  if not public.are_friends(me, target) then raise exception 'You can only invite friends'; end if;
  if exists (select 1 from party_invites where from_id = me and to_id = target and code = room and created_at > now() - interval '1 minute') then
    return json_build_object('result', 'already');
  end if;
  delete from party_invites where created_at < now() - interval '1 day';   -- tidy up old invites
  insert into party_invites (from_id, to_id, code) values (me, target, room) returning id into new_id;
  return json_build_object('result', 'sent', 'id', new_id);
end $$;

create or replace function public.dismiss_party_invite(inv bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  delete from party_invites where id = inv and to_id = auth.uid();
end $$;

-- ---------------------------------------------------------------- who may call what
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.are_friends(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['social_state()', 'search_players(text)', 'send_friend_request(uuid)', 'respond_friend_request(bigint, boolean)',
    'cancel_friend_request(bigint)', 'remove_friend(uuid)', 'set_email_notify(boolean)', 'send_party_invite(uuid, text)', 'dismiss_party_invite(bigint)'] loop
    execute 'revoke execute on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end $$;

-- ---------------------------------------------------------------- live updates in the game
-- the game listens for new requests and invites addressed to the signed-in player
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'friend_requests') then
    alter publication supabase_realtime add table public.friend_requests;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'party_invites') then
    alter publication supabase_realtime add table public.party_invites;
  end if;
end $$;
