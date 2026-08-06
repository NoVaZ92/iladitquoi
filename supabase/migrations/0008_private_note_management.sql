grant delete on table public.anecdotes to authenticated;

drop policy if exists "members delete their own private anecdotes" on public.anecdotes;
create policy "members delete their own private anecdotes"
on public.anecdotes
for delete
to authenticated
using (
  author_id = (select auth.uid())
  and visibility = 'private'
);

drop policy if exists "owners revoke private links" on public.private_share_links;
create policy "owners revoke active private links"
on public.private_share_links
for update
to authenticated
using (
  revoked_at is null
  and exists (
    select 1 from public.anecdotes
    where anecdotes.id = anecdote_id
      and anecdotes.author_id = (select auth.uid())
  )
)
with check (
  revoked_at is not null
  and exists (
    select 1 from public.anecdotes
    where anecdotes.id = anecdote_id
      and anecdotes.author_id = (select auth.uid())
  )
);
