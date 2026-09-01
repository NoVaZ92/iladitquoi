alter table public.profiles
add column if not exists public_slug text;

update public.profiles
set public_slug = lower(encode(gen_random_bytes(9), 'hex'))
where public_slug is null;

alter table public.profiles
alter column public_slug set default lower(encode(gen_random_bytes(9), 'hex')),
alter column public_slug set not null;

create unique index if not exists profiles_public_slug_idx
on public.profiles (public_slug);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_public_slug_format'
  ) then
    alter table public.profiles
    add constraint profiles_public_slug_format
    check (public_slug ~ '^[a-f0-9]{18}$');
  end if;
end;
$$;

alter table public.profiles
add column if not exists active_frame_key text;

alter table public.anecdotes
add column if not exists display_anonymously boolean not null default false;

update public.anecdotes
set display_anonymously = true
where lower(trim(author_label)) = 'anonyme';

create table if not exists public.badge_definitions (
  badge_key text primary key,
  label text not null,
  description text not null,
  icon text not null,
  award_mode text not null check (award_mode in ('automatic', 'manual', 'role')),
  metric text check (metric is null or metric in ('publications', 'xp')),
  threshold integer check (threshold is null or threshold > 0),
  frame_key text unique,
  sort_order integer not null default 0
);

insert into public.badge_definitions (
  badge_key, label, description, icon, award_mode, metric, threshold, frame_key, sort_order
)
values
  ('first-story', 'Première anecdote', 'Une première anecdote validée et publiée.', 'message-square-text', 'automatic', 'publications', 1, null, 10),
  ('regular-shift', 'Habitué de garde', 'Cinq anecdotes validées et publiées.', 'calendar-check', 'automatic', 'publications', 5, null, 20),
  ('care-writer', 'Plume du soin', 'Dix anecdotes validées et publiées.', 'feather', 'automatic', 'publications', 10, 'violet', 30),
  ('confirmed-chronicler', 'Chroniqueur confirmé', 'Vingt-cinq anecdotes validées et publiées.', 'library', 'automatic', 'publications', 25, null, 40),
  ('appreciated', 'Apprécié', 'Cent points d’expérience gagnés.', 'heart', 'automatic', 'xp', 100, null, 50),
  ('essential', 'Incontournable', 'Cinq cents points d’expérience gagnés.', 'star', 'automatic', 'xp', 500, 'green', 60),
  ('pioneer', 'Pionnier', 'Une distinction spéciale attribuée par iladitquoi.', 'flag', 'manual', null, null, 'amber', 70),
  ('admin', 'Admin', 'Administrateur et propriétaire d’iladitquoi.', 'shield-check', 'role', null, null, 'admin', 80)
on conflict (badge_key) do update
set label = excluded.label,
    description = excluded.description,
    icon = excluded.icon,
    award_mode = excluded.award_mode,
    metric = excluded.metric,
    threshold = excluded.threshold,
    frame_key = excluded.frame_key,
    sort_order = excluded.sort_order;

create table if not exists public.profile_badges (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  badge_key text not null references public.badge_definitions(badge_key) on delete restrict,
  source text not null check (source in ('automatic', 'manual', 'role')),
  awarded_by uuid references public.profiles(id) on delete set null,
  awarded_at timestamptz not null default now(),
  primary key (profile_id, badge_key)
);

create index if not exists profile_badges_profile_idx
on public.profile_badges (profile_id, awarded_at desc);

create table if not exists public.role_change_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  target_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('role_changed', 'badge_awarded', 'badge_removed')),
  previous_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create index if not exists role_change_audit_created_idx
on public.role_change_audit (created_at desc);

create or replace function public.refresh_profile_badges(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  publication_count integer;
  profile_xp integer;
begin
  select count(*)::integer
  into publication_count
  from public.anecdotes
  where author_id = p_profile_id
    and visibility = 'public'
    and moderation_status = 'published'
    and display_anonymously = false;

  select coalesce(xp, 0)
  into profile_xp
  from public.profiles
  where id = p_profile_id;

  if not found then return; end if;

  insert into public.profile_badges (profile_id, badge_key, source)
  select p_profile_id, badge_key, 'automatic'
  from public.badge_definitions
  where award_mode = 'automatic'
    and (
      (metric = 'publications' and publication_count >= threshold)
      or (metric = 'xp' and profile_xp >= threshold)
    )
  on conflict (profile_id, badge_key) do nothing;
end;
$$;

create or replace function public.sync_profile_badges_from_anecdote()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.author_id is not null then
    perform public.refresh_profile_badges(new.author_id);
  end if;
  if tg_op = 'UPDATE' and old.author_id is distinct from new.author_id and old.author_id is not null then
    perform public.refresh_profile_badges(old.author_id);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_profile_badges_from_anecdote on public.anecdotes;
create trigger sync_profile_badges_from_anecdote
after insert or update of author_id, visibility, moderation_status, display_anonymously
on public.anecdotes
for each row execute procedure public.sync_profile_badges_from_anecdote();

create or replace function public.sync_profile_badges_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.refresh_profile_badges(new.id);
  elsif new.xp is distinct from old.xp then
    perform public.refresh_profile_badges(new.id);
  end if;

  if new.role = 'admin' then
    insert into public.profile_badges (profile_id, badge_key, source)
    values (new.id, 'admin', 'role')
    on conflict (profile_id, badge_key) do nothing;
  elsif tg_op = 'UPDATE' then
    if old.role = 'admin' then
      delete from public.profile_badges where profile_id = new.id and badge_key = 'admin';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_profile_badges_from_profile on public.profiles;
create trigger sync_profile_badges_from_profile
after insert or update of xp, role
on public.profiles
for each row execute procedure public.sync_profile_badges_from_profile();

create or replace function public.validate_active_profile_frame()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.active_frame_key is null then return new; end if;
  if new.role = 'admin' and new.active_frame_key = 'admin' then return new; end if;

  if not exists (
    select 1
    from public.profile_badges pb
    join public.badge_definitions bd on bd.badge_key = pb.badge_key
    where pb.profile_id = new.id
      and pb.badge_key = new.active_frame_key
      and bd.frame_key is not null
      and bd.award_mode <> 'role'
  ) then
    raise exception 'frame_not_unlocked' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_active_profile_frame on public.profiles;
create trigger validate_active_profile_frame
before update of active_frame_key on public.profiles
for each row execute procedure public.validate_active_profile_frame();

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id
    and (
      new.role is distinct from old.role
      or new.xp is distinct from old.xp
      or new.public_slug is distinct from old.public_slug
    ) then
    raise exception 'role, xp and public slug cannot be changed from a member session';
  end if;
  return new;
end;
$$;

create or replace function public.admin_set_contributor(
  p_actor_id uuid,
  p_public_slug text,
  p_enabled boolean
)
returns table (public_slug text, pseudonym text, role public.user_role)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_profile public.profiles%rowtype;
  next_role public.user_role;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and profiles.role = 'admin') then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select * into target_profile from public.profiles where profiles.public_slug = p_public_slug for update;
  if not found then raise exception 'profile_not_found' using errcode = 'P0002'; end if;
  if target_profile.id = p_actor_id or target_profile.role = 'admin' then
    raise exception 'protected_admin_account' using errcode = '42501';
  end if;

  next_role := case when p_enabled then 'moderator'::public.user_role else 'member'::public.user_role end;
  if target_profile.role is distinct from next_role then
    update public.profiles set role = next_role where id = target_profile.id;
    insert into public.role_change_audit (actor_id, target_id, action, previous_value, new_value)
    values (p_actor_id, target_profile.id, 'role_changed', target_profile.role::text, next_role::text);
  end if;

  return query
  select profiles.public_slug, profiles.pseudonym, profiles.role
  from public.profiles where id = target_profile.id;
end;
$$;

create or replace function public.admin_set_special_badge(
  p_actor_id uuid,
  p_public_slug text,
  p_badge_key text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_id uuid;
  changed_rows integer;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and profiles.role = 'admin') then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.badge_definitions where badge_key = p_badge_key and award_mode = 'manual') then
    raise exception 'manual_badge_required' using errcode = '22023';
  end if;

  select id into target_id from public.profiles where public_slug = p_public_slug for update;
  if target_id is null then raise exception 'profile_not_found' using errcode = 'P0002'; end if;

  if p_enabled then
    insert into public.profile_badges (profile_id, badge_key, source, awarded_by)
    values (target_id, p_badge_key, 'manual', p_actor_id)
    on conflict (profile_id, badge_key) do nothing;
    get diagnostics changed_rows = row_count;
    if changed_rows > 0 then
      insert into public.role_change_audit (actor_id, target_id, action, new_value)
      values (p_actor_id, target_id, 'badge_awarded', p_badge_key);
    end if;
  else
    update public.profiles set active_frame_key = null
    where id = target_id and active_frame_key = p_badge_key;
    delete from public.profile_badges
    where profile_id = target_id and badge_key = p_badge_key and source = 'manual';
    get diagnostics changed_rows = row_count;
    if changed_rows > 0 then
      insert into public.role_change_audit (actor_id, target_id, action, previous_value)
      values (p_actor_id, target_id, 'badge_removed', p_badge_key);
    end if;
  end if;
end;
$$;

create or replace function public.admin_search_users(
  p_actor_id uuid,
  p_query text
)
returns table (
  public_slug text,
  pseudonym text,
  profession text,
  role public.user_role,
  email text,
  avatar_url text,
  has_pioneer_badge boolean
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  normalized_query text := left(trim(coalesce(p_query, '')), 80);
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and profiles.role = 'admin') then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if char_length(normalized_query) < 2 then return; end if;

  return query
  select p.public_slug, p.pseudonym, p.profession, p.role, u.email, p.avatar_url,
    exists (select 1 from public.profile_badges pb where pb.profile_id = p.id and pb.badge_key = 'pioneer')
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.pseudonym ilike '%' || normalized_query || '%'
     or u.email ilike '%' || normalized_query || '%'
  order by case when lower(p.pseudonym) = lower(normalized_query) then 0 else 1 end, p.created_at desc
  limit 25;
end;
$$;

revoke all on function public.refresh_profile_badges(uuid) from public;
revoke all on function public.admin_set_contributor(uuid, text, boolean) from public;
revoke all on function public.admin_set_special_badge(uuid, text, text, boolean) from public;
revoke all on function public.admin_search_users(uuid, text) from public;
grant execute on function public.admin_set_contributor(uuid, text, boolean) to service_role;
grant execute on function public.admin_set_special_badge(uuid, text, text, boolean) to service_role;
grant execute on function public.admin_search_users(uuid, text) to service_role;

alter table public.badge_definitions enable row level security;
alter table public.profile_badges enable row level security;
alter table public.role_change_audit enable row level security;

revoke all on table public.badge_definitions from anon, authenticated;
revoke all on table public.profile_badges from anon, authenticated;
revoke all on table public.role_change_audit from anon, authenticated;
grant select on table public.badge_definitions to anon, authenticated, service_role;
grant select on table public.profile_badges to authenticated, service_role;
grant select on table public.role_change_audit to service_role;

drop policy if exists "profiles are readable" on public.profiles;
drop policy if exists "members read their profile" on public.profiles;
create policy "members read their profile"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy "badge catalog is readable"
on public.badge_definitions for select
using (true);

create policy "members read their badges"
on public.profile_badges for select to authenticated
using (profile_id = (select auth.uid()));

do $$
declare
  profile_record record;
begin
  for profile_record in select id, role from public.profiles loop
    perform public.refresh_profile_badges(profile_record.id);
    if profile_record.role = 'admin' then
      insert into public.profile_badges (profile_id, badge_key, source)
      values (profile_record.id, 'admin', 'role')
      on conflict (profile_id, badge_key) do nothing;
    end if;
  end loop;
end;
$$;
