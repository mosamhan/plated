-- Plato content controls — the same audience + archive model plates got in
-- 0016, applied to plato_videos. Real privacy boundary, enforced in the DB.

alter table public.plato_videos
  add column if not exists visibility text not null default 'public'
    check (visibility in ('public', 'friends', 'private')),
  add column if not exists archived boolean not null default false;

drop policy if exists "platos readable" on public.plato_videos;

create policy "platos visible" on public.plato_videos for select using (
  user_id = auth.uid()
  or (
    archived = false
    and (
      visibility = 'public'
      or (
        visibility = 'friends'
        and exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid() and f.following_id = plato_videos.user_id
        )
        and exists (
          select 1 from public.follows f
          where f.follower_id = plato_videos.user_id and f.following_id = auth.uid()
        )
      )
    )
  )
);
