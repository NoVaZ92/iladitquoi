alter table public.moderation_decisions
  alter column moderator_id drop not null;

alter table public.moderation_decisions
  drop constraint if exists moderation_decisions_moderator_id_fkey;

alter table public.moderation_decisions
  add constraint moderation_decisions_moderator_id_fkey
  foreign key (moderator_id)
  references public.profiles(id)
  on delete set null;

create or replace function public.account_deletion_ready()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select true
$$;

revoke all on function public.account_deletion_ready() from public, anon, authenticated;
grant execute on function public.account_deletion_ready() to service_role;
