create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_pseudonym text;
  final_pseudonym text;
begin
  requested_pseudonym := nullif(trim(new.raw_user_meta_data ->> 'pseudonym'), '');
  if requested_pseudonym is null or char_length(requested_pseudonym) not between 3 and 32 then
    final_pseudonym := 'Soignant-' || left(replace(new.id::text, '-', ''), 8);
  elsif exists (select 1 from public.profiles where pseudonym = requested_pseudonym) then
    final_pseudonym := left(requested_pseudonym, 23) || '-' || left(replace(new.id::text, '-', ''), 8);
  else
    final_pseudonym := requested_pseudonym;
  end if;

  insert into public.profiles (id, pseudonym, profession)
  values (
    new.id,
    final_pseudonym,
    nullif(left(trim(new.raw_user_meta_data ->> 'profession'), 80), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop policy if exists "members update their profile" on public.profiles;
create policy "members update their profile"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id and not public.is_moderator() then
    if new.role is distinct from old.role or new.xp is distinct from old.xp then
      raise exception 'role and xp cannot be changed by members';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges
before update on public.profiles
for each row execute procedure public.protect_profile_privileges();
