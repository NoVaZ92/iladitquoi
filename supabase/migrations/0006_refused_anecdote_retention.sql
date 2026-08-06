create index if not exists anecdotes_refused_cleanup_idx
on public.anecdotes (updated_at)
where moderation_status = 'refused';

grant delete on table public.anecdotes to authenticated;

drop policy if exists "members delete their own refused anecdotes" on public.anecdotes;
create policy "members delete their own refused anecdotes"
on public.anecdotes
for delete
to authenticated
using (
  author_id = (select auth.uid())
  and visibility = 'public'
  and moderation_status = 'refused'
);

create extension if not exists pg_cron with schema extensions;

-- The moderation transition updates updated_at, which becomes the retention start.
select cron.schedule(
  'purge-refused-anecdotes-after-30-days',
  '17 3 * * *',
  $$
    delete from public.anecdotes
    where visibility = 'public'
      and moderation_status = 'refused'
      and updated_at < now() - interval '30 days'
  $$
);
