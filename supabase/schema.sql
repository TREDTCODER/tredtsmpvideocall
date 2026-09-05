-- TREDT SMP Gameplay Conference database
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  minecraft_username text not null unique,
  email text not null,
  is_admin boolean not null default false,
  is_banned boolean not null default false,
  is_deleted boolean not null default false,
  ban_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z]{3}-[a-z]{3}-[a-z]{3}$'),
  topic text not null,
  passcode text check (passcode is null or passcode ~ '^[0-9]{5}$'),
  scheduled_for timestamptz not null,
  created_by uuid not null references public.profiles(id),
  status text not null default 'active' check(status in ('active','ended','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.meeting_members (
  meeting_id uuid references public.meetings(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key(meeting_id,user_id)
);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  target_user uuid not null references public.profiles(id),
  admin_user uuid not null references public.profiles(id),
  action text not null check(action in ('ban','delete')),
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_members enable row level security;
alter table public.moderation_actions enable row level security;

create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=uid and is_admin=true and is_banned=false and is_deleted=false); $$;

drop policy if exists "profiles read authenticated" on public.profiles;
create policy "profiles read authenticated" on public.profiles for select to authenticated using (true);

drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert" on public.profiles for insert to authenticated with check (id=auth.uid());

drop policy if exists "profiles self update or admin" on public.profiles;
create policy "profiles self update or admin" on public.profiles for update to authenticated using (id=auth.uid() or public.is_admin(auth.uid())) with check (id=auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "meetings read" on public.meetings;
create policy "meetings read" on public.meetings for select to authenticated using (true);

drop policy if exists "meetings create" on public.meetings;
create policy "meetings create" on public.meetings for insert to authenticated with check (created_by=auth.uid());

drop policy if exists "meetings update host" on public.meetings;
create policy "meetings update host" on public.meetings for update to authenticated using (created_by=auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "members read" on public.meeting_members;
create policy "members read" on public.meeting_members for select to authenticated using (true);

drop policy if exists "members join self" on public.meeting_members;
create policy "members join self" on public.meeting_members for insert to authenticated with check (user_id=auth.uid());

drop policy if exists "members leave self" on public.meeting_members;
create policy "members leave self" on public.meeting_members for delete to authenticated using (user_id=auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "moderation admin only" on public.moderation_actions;
create policy "moderation admin only" on public.moderation_actions for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Automatically create a profile after signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.profiles(id,minecraft_username,email)
  values(new.id, coalesce(new.raw_user_meta_data->>'minecraft_username','Player'), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Realtime is used for WebRTC signaling, chat and presence.
alter table public.meeting_members replica identity full;


-- Hard limit: no meeting may have more than 7 members.
create or replace function public.enforce_max_meeting_members()
returns trigger language plpgsql security definer set search_path=public
as $$
declare n integer;
begin
  select count(*) into n from public.meeting_members where meeting_id=new.meeting_id;
  if n >= 7 and not exists(
    select 1 from public.meeting_members
    where meeting_id=new.meeting_id and user_id=new.user_id
  ) then
    raise exception 'MEETING_FULL';
  end if;
  return new;
end;
$$;

drop trigger if exists meeting_member_limit on public.meeting_members;
create trigger meeting_member_limit
before insert on public.meeting_members
for each row execute function public.enforce_max_meeting_members();

-- Admin bootstrap: after creating the requested admin account in Supabase Auth,
-- set is_admin=true for that account in the profiles table. Never put the admin
-- password/access key in browser code or the repository.
