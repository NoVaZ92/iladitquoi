alter table public.profiles
add column if not exists avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 4194304, array['image/jpeg', 'image/png', 'image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public avatar read" on storage.objects;
drop policy if exists "members upload their avatar" on storage.objects;
drop policy if exists "members update their avatar" on storage.objects;
drop policy if exists "members delete their avatar" on storage.objects;

create policy "public avatar read"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "members upload their avatar"
on storage.objects for insert
to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "members update their avatar"
on storage.objects for update
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "members delete their avatar"
on storage.objects for delete
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
