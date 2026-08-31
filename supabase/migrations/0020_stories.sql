-- Plated — stories: a dish moment that expires after 24 hours.
-- Idempotent. Requires 0001_init.sql and 0019_messaging.sql (are_friends).
--
-- A story is deliberately thinner than a plate: no rating, no menu items, no
-- feed placement. It's "I'm eating this right now", and it's gone tomorrow.
-- What it can carry is a pointer back to the real thing — the restaurant it
-- happened at, or a plate already posted — so a story is a way into the app's
-- durable content rather than a dead end.
--
-- Expiry is enforced in the SELECT policy, not by a cleanup job: an expired
-- story stops being readable the moment it expires, whether or not anything has
-- swept the table yet. Rows are deleted lazily (see reap_expired_stories).

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  media_url text not null,
  media_type text not null default 'image' check (media_type in ('image', 'clip')),
  caption text not null default '',
  -- Optional anchors back into durable content.
  restaurant_id uuid references public.restaurants on delete set null,
  order_id uuid references public.orders on delete set null,
  -- Same audience vocabulary as posts (0016), minus 'private' — a story only
  -- you can see isn't a story.
  visibility text not null default 'public' check (visibility in ('public', 'friends')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists stories_user_idx on public.stories (user_id, created_at desc);
create index if not exists stories_expires_idx on public.stories (expires_at);

-- Who has seen it. The author reads this as the viewer list; a viewer only ever
-- sees their own row, so nobody can enumerate who watched someone else's story.
create table if not exists public.story_views (
  story_id uuid not null references public.stories on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, user_id)
);
create index if not exists story_views_story_idx on public.story_views (story_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.stories     enable row level security;
alter table public.story_views enable row level security;

drop policy if exists "stories visible" on public.stories;
drop policy if exists "post own story"  on public.stories;
drop policy if exists "delete own story" on public.stories;

create policy "stories visible" on public.stories for select using (
  -- Authors keep seeing their own after expiry (the archive on their profile).
  user_id = auth.uid()
  or (
    expires_at > now()
    and (
      visibility = 'public'
      or (visibility = 'friends' and public.are_friends(auth.uid(), stories.user_id))
    )
    -- A block hides the story in both directions.
    and not exists (
      select 1 from public.blocks b
       where (b.blocker_id = auth.uid() and b.blocked_id = stories.user_id)
          or (b.blocker_id = stories.user_id and b.blocked_id = auth.uid())
    )
  )
);
create policy "post own story"   on public.stories for insert with check (auth.uid() = user_id);
create policy "delete own story" on public.stories for delete using (auth.uid() = user_id);

drop policy if exists "story views readable" on public.story_views;
drop policy if exists "mark story seen"      on public.story_views;

create policy "story views readable" on public.story_views for select using (
  auth.uid() = user_id
  or exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid())
);
-- You can only record that *you* saw it, and only for a story you can read —
-- the nested select runs under the caller's own RLS, so an invisible story
-- can't be marked seen.
create policy "mark story seen" on public.story_views for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.stories s where s.id = story_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- REAPER — expired rows are already unreadable; this is housekeeping so the
-- table and its Storage objects don't grow forever. Called opportunistically by
-- the client on story creation; safe to schedule with pg_cron instead.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.reap_expired_stories()
returns void
language sql
security definer set search_path = public
as $$
  -- A day of grace past expiry so the author's own archive isn't yanked out
  -- from under a screen they're looking at.
  delete from public.stories where expires_at < now() - interval '1 day';
$$;

revoke all on function public.reap_expired_stories() from public;
grant execute on function public.reap_expired_stories() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- STORAGE — public-read bucket, users write only into their own folder
-- (identical to the plates/avatars/platos buckets).
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('stories', 'stories', true)
  on conflict do nothing;

drop policy if exists "story media readable" on storage.objects;
drop policy if exists "upload own story"     on storage.objects;

create policy "story media readable" on storage.objects for select using (bucket_id = 'stories');
create policy "upload own story" on storage.objects for insert
  with check (bucket_id = 'stories' and auth.uid()::text = (storage.foldername(name))[1]);
