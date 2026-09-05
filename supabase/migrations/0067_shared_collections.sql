-- Plated — shared collections, owned by a conversation instead of one person.
-- Idempotent. Requires 0008_collection_privacy.sql, 0019_messaging.sql.
--
-- A shared collection is an ordinary row in `collections` with `conversation_id`
-- set — created by one member (who stays `user_id`, the row's creator/owner for
-- rename/delete/privacy purposes) but writable by any member of that
-- conversation, group or 1:1. `is_private` keeps its existing meaning: a shared
-- collection is visible only to the conversation's members until the creator
-- flips it public, at which point 0008's existing "is_private = false" clause
-- already exposes it on their profile like any other public list — no new
-- visibility column needed.

alter table public.collections
  add column if not exists conversation_id uuid references public.conversations on delete cascade;
create index if not exists collections_conversation_id_idx on public.collections (conversation_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- READS — your own lists, public lists, or a shared list for any conversation
-- you belong to.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "collections readable" on public.collections;
create policy "collections readable" on public.collections for select using (
  auth.uid() = user_id
  or is_private = false
  or (conversation_id is not null and public.in_conversation(conversation_id, auth.uid()))
);

-- Rename/delete/privacy stay creator-only — 0005's existing update/delete
-- policies already check `auth.uid() = user_id` and need no change. Insert
-- likewise: creating a shared collection is still "insert a collections row
-- where I am the user_id", just with conversation_id also set.

-- ─────────────────────────────────────────────────────────────────────────────
-- ITEMS — any conversation member may add/remove items from a shared
-- collection, the same as the app already lets them add to their own lists.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "collection items readable" on public.collection_items;
drop policy if exists "insert into own collection" on public.collection_items;
drop policy if exists "insert into collection" on public.collection_items;
drop policy if exists "delete from own collection" on public.collection_items;
drop policy if exists "delete from collection" on public.collection_items;

create policy "collection items readable" on public.collection_items for select using (
  exists (
    select 1 from public.collections c
    where c.id = collection_id
      and (
        c.user_id = auth.uid()
        or c.is_private = false
        or (c.conversation_id is not null and public.in_conversation(c.conversation_id, auth.uid()))
      )
  )
);
create policy "insert into collection" on public.collection_items for insert with check (
  exists (
    select 1 from public.collections c
    where c.id = collection_id
      and (
        c.user_id = auth.uid()
        or (c.conversation_id is not null and public.in_conversation(c.conversation_id, auth.uid()))
      )
  )
);
create policy "delete from collection" on public.collection_items for delete using (
  exists (
    select 1 from public.collections c
    where c.id = collection_id
      and (
        c.user_id = auth.uid()
        or (c.conversation_id is not null and public.in_conversation(c.conversation_id, auth.uid()))
      )
  )
);
