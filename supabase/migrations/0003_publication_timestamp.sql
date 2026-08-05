create or replace function public.set_anecdote_publication_timestamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.moderation_status = 'published' and old.moderation_status is distinct from 'published' then
    new.published_at = coalesce(new.published_at, now());
  elsif new.moderation_status <> 'published' then
    new.published_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists anecdotes_publication_timestamp on public.anecdotes;
create trigger anecdotes_publication_timestamp
before update on public.anecdotes
for each row execute procedure public.set_anecdote_publication_timestamp();

update public.anecdotes
set published_at = coalesce(published_at, updated_at, submitted_at, now())
where moderation_status = 'published' and published_at is null;
