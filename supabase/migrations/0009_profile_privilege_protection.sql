create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id
    and (new.role is distinct from old.role or new.xp is distinct from old.xp) then
    raise exception 'role and xp cannot be changed from a member session';
  end if;
  return new;
end;
$$;
