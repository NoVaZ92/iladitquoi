drop policy if exists "members delete their own moderated anecdotes" on public.anecdotes;

create policy "members delete their own public anecdotes"
  on public.anecdotes for delete
  to authenticated
  using (
    author_id = (select auth.uid())
    and visibility = 'public'
    and moderation_status in ('published', 'refused', 'hidden')
  );
