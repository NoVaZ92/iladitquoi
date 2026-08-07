alter table public.moderation_decisions
  drop constraint if exists moderation_decisions_status_check;

alter table public.moderation_decisions
  add constraint moderation_decisions_status_check
  check (status in ('published', 'refused', 'hidden'));

drop policy if exists "members delete their own refused anecdotes" on public.anecdotes;
create policy "members delete their own moderated anecdotes"
  on public.anecdotes for delete
  using (
    author_id = (select auth.uid())
    and visibility = 'public'
    and moderation_status in ('refused', 'hidden')
  );

create table public.account_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  anecdote_id uuid references public.anecdotes(id) on delete cascade,
  kind text not null check (kind in ('anecdote_published', 'anecdote_refused', 'anecdote_hidden')),
  message text not null check (char_length(message) between 3 and 500),
  created_at timestamptz not null default now()
);

create index account_notifications_user_created_idx
  on public.account_notifications (user_id, created_at desc);

alter table public.account_notifications enable row level security;

create policy "members see their own notifications"
  on public.account_notifications for select
  using (user_id = auth.uid());
