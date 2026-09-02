create or replace function public.validate_active_profile_frame()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.active_frame_key is null then return new; end if;

  if new.role = 'admin' then
    if not exists (
      select 1
      from public.badge_definitions bd
      where bd.badge_key = new.active_frame_key
        and bd.frame_key is not null
    ) then
      raise exception 'frame_not_in_catalog' using errcode = '42501';
    end if;
    return new;
  end if;

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

update public.profiles
set active_frame_key = 'admin'
where role = 'admin'
  and active_frame_key is null;
