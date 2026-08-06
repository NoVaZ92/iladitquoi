create or replace function public.cast_anecdote_vote(p_anecdote_id uuid, p_value smallint)
returns table (vote_score integer, user_vote smallint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_vote smallint;
  next_vote smallint;
  score_delta integer;
  target_author_id uuid;
  updated_score integer;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_value not in (-1, 1) then
    raise exception 'invalid_vote' using errcode = '22023';
  end if;

  select author_id into target_author_id
  from public.anecdotes
  where id = p_anecdote_id
    and visibility = 'public'
    and moderation_status = 'published'
  for update;

  if not found then
    raise exception 'anecdote_not_found' using errcode = 'P0002';
  end if;
  if target_author_id = auth.uid() then
    raise exception 'cannot_vote_own_anecdote' using errcode = '42501';
  end if;

  select value into current_vote
  from public.votes
  where anecdote_id = p_anecdote_id and user_id = auth.uid();

  if current_vote = p_value then
    delete from public.votes where anecdote_id = p_anecdote_id and user_id = auth.uid();
    next_vote := null;
    score_delta := -p_value;
  else
    insert into public.votes (anecdote_id, user_id, value)
    values (p_anecdote_id, auth.uid(), p_value)
    on conflict (anecdote_id, user_id) do update set value = excluded.value;
    next_vote := p_value;
    score_delta := p_value - coalesce(current_vote, 0);
  end if;

  update public.anecdotes
  set vote_score = vote_score + score_delta
  where id = p_anecdote_id
  returning vote_score into updated_score;

  if target_author_id is not null then
    update public.profiles
    set xp = greatest(0, xp + score_delta * 10)
    where id = target_author_id;
  end if;

  return query select updated_score, next_vote;
end;
$$;

revoke all on function public.cast_anecdote_vote(uuid, smallint) from public;
grant execute on function public.cast_anecdote_vote(uuid, smallint) to authenticated;
