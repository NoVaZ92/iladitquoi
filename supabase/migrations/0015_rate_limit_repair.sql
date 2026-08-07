-- Repairs and verifies the write-side anti-abuse limiter used by every API mutation.
-- This is intentionally idempotent so it can be applied to an existing project.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.rate_limit_buckets (
  action text not null,
  subject_hash text not null,
  request_count integer not null default 0 check (request_count >= 0),
  window_started_at timestamptz not null,
  expires_at timestamptz not null,
  primary key (action, subject_hash)
);

create index if not exists rate_limit_buckets_expiry_idx
on private.rate_limit_buckets (expires_at);

alter table private.rate_limit_buckets enable row level security;
grant select, insert, update, delete on table private.rate_limit_buckets to service_role;

create or replace function public.consume_rate_limit(
  p_action text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  current_time timestamptz := now();
  current_count integer;
  current_expiry timestamptz;
begin
  if p_action is null
    or p_subject_hash is null
    or p_limit is null
    or p_window_seconds is null
    or p_action !~ '^[a-z0-9_:-]{1,80}$'
    or p_subject_hash !~ '^[0-9a-f]{64}$'
    or p_limit not between 1 and 10000
    or p_window_seconds not between 1 and 604800 then
    raise exception 'invalid rate limit parameters' using errcode = '22023';
  end if;

  insert into private.rate_limit_buckets as bucket (
    action,
    subject_hash,
    request_count,
    window_started_at,
    expires_at
  )
  values (
    p_action,
    p_subject_hash,
    1,
    current_time,
    current_time + make_interval(secs => p_window_seconds)
  )
  on conflict (action, subject_hash) do update
  set request_count = case
        when bucket.expires_at <= current_time then 1
        else bucket.request_count + 1
      end,
      window_started_at = case
        when bucket.expires_at <= current_time then current_time
        else bucket.window_started_at
      end,
      expires_at = case
        when bucket.expires_at <= current_time then current_time + make_interval(secs => p_window_seconds)
        else bucket.expires_at
      end
  returning bucket.request_count, bucket.expires_at
  into current_count, current_expiry;

  allowed := current_count <= p_limit;
  retry_after_seconds := case
    when allowed then 0
    else greatest(1, ceil(extract(epoch from (current_expiry - current_time)))::integer)
  end;
  return next;
end;
$function$;

revoke all on function public.consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;

create or replace function public.rate_limit_ready()
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
  if to_regclass('private.rate_limit_buckets') is null
    or to_regprocedure('public.consume_rate_limit(text,text,integer,integer)') is null
    or not has_function_privilege(
      'service_role',
      'public.consume_rate_limit(text,text,integer,integer)',
      'execute'
    ) then
    return false;
  end if;

  perform 1 from private.rate_limit_buckets limit 1;
  return true;
exception
  when others then return false;
end;
$function$;

revoke all on function public.rate_limit_ready() from public, anon, authenticated;
grant execute on function public.rate_limit_ready() to service_role;
