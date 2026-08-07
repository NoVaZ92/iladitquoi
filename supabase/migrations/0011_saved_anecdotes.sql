create table public.saved_anecdotes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  anecdote_id uuid not null references public.anecdotes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, anecdote_id)
);

create index saved_anecdotes_user_idx
on public.saved_anecdotes (user_id, created_at desc);

alter table public.saved_anecdotes enable row level security;

create policy "members see their saved anecdotes"
on public.saved_anecdotes
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "members save published anecdotes"
on public.saved_anecdotes
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.anecdotes
    where anecdotes.id = anecdote_id
      and anecdotes.visibility = 'public'
      and anecdotes.moderation_status = 'published'
  )
);

create policy "members remove their saved anecdotes"
on public.saved_anecdotes
for delete
to authenticated
using (user_id = (select auth.uid()));
