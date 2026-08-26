-- ============================================================================
-- Adhyayan Parevartan — Supabase live-sync migration
-- Run this ONCE in Supabase Dashboard > SQL Editor (after supabase_schema.sql).
--
-- What this does:
--   1. Gives the public anon key read/write access to every app table
--      (this MVP performs admin operations with the anon key, so permissive
--      policies are required — same pattern as competitive_exam_schema_fix.sql).
--   2. Creates the public storage bucket `learning_materials` used by
--      core/db.js uploadMaterialFile().
--   3. Lets the anon key upload/read/delete files in that bucket.
--
-- After running this, every file uploaded from the Admin panel is stored in
-- Supabase Storage + its row in learning_materials / competitive_exam_materials,
-- and instantly appears in the app for all users (pages fetch live on open).
-- ============================================================================

-- 1. TABLE POLICIES ------------------------------------------------------------

-- helper: apply "allow everything to public" policy to a table
-- (RLS stays enabled; anon + authenticated roles get full access)

alter table if exists public.roles                    enable row level security;
alter table if exists public.users                    enable row level security;
alter table if exists public.subjects                 enable row level security;
alter table if exists public.content_formats          enable row level security;
alter table if exists public.learning_materials       enable row level security;
alter table if exists public.quizzes                  enable row level security;
alter table if exists public.competitive_exam_materials enable row level security;
alter table if exists public.notifications            enable row level security;
alter table if exists public.site_content             enable row level security;

drop policy if exists "roles_public_all"                    on public.roles;
drop policy if exists "users_public_all"                    on public.users;
drop policy if exists "subjects_public_all"                 on public.subjects;
drop policy if exists "content_formats_public_all"          on public.content_formats;
drop policy if exists "learning_materials_public_all"       on public.learning_materials;
drop policy if exists "quizzes_public_all"                  on public.quizzes;
drop policy if exists "competitive_exam_materials_public_all" on public.competitive_exam_materials;
drop policy if exists "notifications_public_all"            on public.notifications;
drop policy if exists "site_content_public_all"             on public.site_content;

create policy "roles_public_all"                    on public.roles                    for all using (true) with check (true);
create policy "users_public_all"                    on public.users                    for all using (true) with check (true);
create policy "subjects_public_all"                 on public.subjects                 for all using (true) with check (true);
create policy "content_formats_public_all"          on public.content_formats          for all using (true) with check (true);
create policy "learning_materials_public_all"       on public.learning_materials       for all using (true) with check (true);
create policy "quizzes_public_all"                  on public.quizzes                  for all using (true) with check (true);
create policy "competitive_exam_materials_public_all" on public.competitive_exam_materials for all using (true) with check (true);
create policy "notifications_public_all"            on public.notifications            for all using (true) with check (true);
create policy "site_content_public_all"             on public.site_content             for all using (true) with check (true);

-- 2. STORAGE BUCKET ------------------------------------------------------------
-- Public bucket so uploaded files get a public URL the app can open/download.

insert into storage.buckets (id, name, public)
values ('learning_materials', 'learning_materials', true)
on conflict (id) do update set public = true;

-- 3. STORAGE POLICIES ----------------------------------------------------------

drop policy if exists "learning_materials_public_read"   on storage.objects;
drop policy if exists "learning_materials_public_insert" on storage.objects;
drop policy if exists "learning_materials_public_update" on storage.objects;
drop policy if exists "learning_materials_public_delete" on storage.objects;

create policy "learning_materials_public_read"
on storage.objects for select
using (bucket_id = 'learning_materials');

create policy "learning_materials_public_insert"
on storage.objects for insert
with check (bucket_id = 'learning_materials');

create policy "learning_materials_public_update"
on storage.objects for update
using (bucket_id = 'learning_materials');

create policy "learning_materials_public_delete"
on storage.objects for delete
using (bucket_id = 'learning_materials');

-- 4. VERIFY --------------------------------------------------------------------
-- After running, these should return rows / succeed:
--   select * from public.learning_materials order by created_at desc limit 10;
--   select * from storage.buckets where id = 'learning_materials';
