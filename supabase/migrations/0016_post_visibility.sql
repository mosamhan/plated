-- Creator content controls: per-post audience + archive.
--
-- visibility: 'public' (everyone), 'friends' (mutual follows only), 'private'
--             (author only). archived posts are hidden from everyone but the
--             author, who can restore them.
--
-- This is a real privacy boundary, enforced in the database — not just hidden
-- in the client. The old "orders readable using(true)" SELECT policy is
-- replaced so the API itself won't hand a friends/private/archived row to
-- someone who shouldn't see it.

alter table public.orders
  add column if not exists visibility text not null default 'public'
    check (visibility in ('public', 'friends', 'private')),
  add column if not exists archived boolean not null default false;

drop policy if exists "orders readable" on public.orders;

create policy "orders visible" on public.orders for select using (
  -- Authors always see their own posts, including archived and private ones.
  user_id = auth.uid()
  or (
    archived = false
    and (
      visibility = 'public'
      -- Friends = a mutual follow in both directions.
      or (
        visibility = 'friends'
        and exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid() and f.following_id = orders.user_id
        )
        and exists (
          select 1 from public.follows f
          where f.follower_id = orders.user_id and f.following_id = auth.uid()
        )
      )
    )
  )
);
