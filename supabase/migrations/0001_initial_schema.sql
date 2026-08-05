create extension if not exists pgcrypto;

create type public.user_role as enum ('member', 'moderator', 'admin');
create type public.anecdote_visibility as enum ('public', 'private');
create type public.moderation_status as enum ('pending', 'published', 'refused');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  pseudonym text not null unique check (char_length(pseudonym) between 3 and 32),
  profession text,
  role public.user_role not null default 'member',
  xp integer not null default 0 check (xp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.anecdotes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete set null,
  author_label text not null default 'Anonyme',
  profession text not null,
  theme text not null default 'leger',
  body text not null check (char_length(body) between 1 and 355),
  visibility public.anecdote_visibility not null default 'public',
  moderation_status public.moderation_status not null default 'pending',
  moderation_reason text,
  vote_score integer not null default 0,
  submitted_at timestamptz not null default now(),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((visibility = 'private' and moderation_status = 'published') or visibility = 'public')
);

create index anecdotes_feed_idx on public.anecdotes (moderation_status, visibility, vote_score desc, published_at desc);
create index anecdotes_author_idx on public.anecdotes (author_id, submitted_at desc);

create table public.votes (
  anecdote_id uuid not null references public.anecdotes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (anecdote_id, user_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  anecdote_id uuid not null references public.anecdotes(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

create table public.moderation_decisions (
  id uuid primary key default gen_random_uuid(),
  anecdote_id uuid not null references public.anecdotes(id) on delete cascade,
  moderator_id uuid not null references public.profiles(id) on delete restrict,
  status public.moderation_status not null check (status in ('published', 'refused')),
  internal_note text,
  author_message text,
  created_at timestamptz not null default now()
);

create table public.private_share_links (
  id uuid primary key default gen_random_uuid(),
  anecdote_id uuid not null references public.anecdotes(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_opened_at timestamptz
);

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('moderator', 'admin')
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, pseudonym, profession)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'pseudonym', ''), 'Soignant-' || left(new.id::text, 6)),
    nullif(new.raw_user_meta_data ->> 'profession', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

create trigger anecdotes_updated_at before update on public.anecdotes
for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.anecdotes enable row level security;
alter table public.votes enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_decisions enable row level security;
alter table public.private_share_links enable row level security;

create policy "profiles are readable" on public.profiles for select using (true);
create policy "members update their profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

create policy "published anecdotes are public" on public.anecdotes for select using (visibility = 'public' and moderation_status = 'published');
create policy "members see their own anecdotes" on public.anecdotes for select using (author_id = auth.uid());
create policy "moderators see moderation queue" on public.anecdotes for select using (public.is_moderator());
create policy "members create their own private anecdotes" on public.anecdotes for insert with check (author_id = auth.uid() and visibility = 'private' and moderation_status = 'published');
create policy "members update own private anecdotes" on public.anecdotes for update using (author_id = auth.uid() and visibility = 'private') with check (author_id = auth.uid() and visibility = 'private');
create policy "moderators update anecdotes" on public.anecdotes for update using (public.is_moderator()) with check (public.is_moderator());

create policy "members see their votes" on public.votes for select using (user_id = auth.uid());
create policy "members manage their votes" on public.votes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "members submit reports" on public.reports for insert with check (reporter_id = auth.uid());
create policy "members see their reports" on public.reports for select using (reporter_id = auth.uid() or public.is_moderator());
create policy "moderators manage reports" on public.reports for update using (public.is_moderator()) with check (public.is_moderator());
create policy "moderators view decisions" on public.moderation_decisions for select using (public.is_moderator());
create policy "moderators create decisions" on public.moderation_decisions for insert with check (public.is_moderator() and moderator_id = auth.uid());
create policy "owners see private links" on public.private_share_links for select using (
  exists (select 1 from public.anecdotes where anecdotes.id = anecdote_id and anecdotes.author_id = auth.uid())
);
create policy "owners create private links" on public.private_share_links for insert with check (
  exists (select 1 from public.anecdotes where anecdotes.id = anecdote_id and anecdotes.author_id = auth.uid())
);
create policy "owners revoke private links" on public.private_share_links for update using (
  exists (select 1 from public.anecdotes where anecdotes.id = anecdote_id and anecdotes.author_id = auth.uid())
);
