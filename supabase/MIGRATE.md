# Applying migrations with the Supabase CLI

Background: `0001_init.sql` was applied by hand in the SQL Editor, so the project has a
schema but **no migration history**. `supabase db push` would therefore try to re-run
`0001` and fail on `relation "profiles" already exists`. The fix is to tell the CLI that
`0001` is already applied, then push the rest.

`0002`–`0004` have been rewritten to be idempotent (`create table if not exists`,
`drop policy if exists` before each `create policy`, `add column if not exists`), so it
does not matter whether some of them were already run by hand — pushing them is safe
either way.

## Steps

```bash
cd ~/Desktop/Plated

# 1. Install the CLI if you don't have it
brew install supabase/tap/supabase
supabase --version

# 2. Log in (opens a browser) and link to the project
supabase login
supabase link --project-ref lfsrbkrqdvzilfkphgpq
#    ^ prompts for the database password you set when creating the project

# 3. See what the CLI thinks is applied — expect all 4 Local, none Remote
supabase migration list

# 4. Mark 0001 as already applied so push skips it
supabase migration repair --status applied 0001

# 5. Push 0002–0004
supabase db push

# 6. Confirm
supabase migration list
```

After step 5, `migration list` should show all four versions in both the Local and
Remote columns.

## Verify the schema landed

Run this in the SQL Editor (read-only). All five rows should come back `true`:

```sql
select 'plato_videos'        as object, to_regclass('public.plato_videos')        is not null as ok
union all select 'plato_likes',         to_regclass('public.plato_likes')         is not null
union all select 'plato_comments',      to_regclass('public.plato_comments')      is not null
union all select 'plato_comment_likes', to_regclass('public.plato_comment_likes') is not null
union all select 'plato_comments.parent_id', exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='plato_comments' and column_name='parent_id');
```

And check the storage bucket exists:

```sql
select id, public from storage.buckets where id = 'platos';
```

## If `db push` rejects the version numbers

The CLI normally generates timestamped filenames (`20260718...._name.sql`). Ours use
`0001`–`0004`. That's usually accepted, but if push complains about an invalid migration
version, rename the files to timestamps in the same order and re-run steps 4–5 using the
new version strings:

```bash
cd supabase/migrations
mv 0001_init.sql                  20260101000001_init.sql
mv 0002_platos.sql                20260101000002_platos.sql
mv 0003_plato_comment_likes.sql   20260101000003_plato_comment_likes.sql
mv 0004_plato_comment_replies.sql 20260101000004_plato_comment_replies.sql
```

## What this unblocks

`src/store/PlatosContext.tsx` queries `plato_videos`, `plato_likes`, `plato_comments`,
`plato_comment_likes` and `plato_comments.parent_id`, and relies on the auto-generated FK
names `plato_videos_user_id_fkey` and `plato_comments_user_id_fkey` for its embedded
`profiles` selects. All of these were verified against the migrations on a real Postgres
instance — the schema and the client code agree.
