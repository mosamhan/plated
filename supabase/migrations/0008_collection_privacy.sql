-- Plated — collections can be shared. Private by default.
-- Idempotent. Requires 0005_collections.sql.
--
-- 0005 made collections strictly owner-only ("unlike likes/saves, collections
-- are private, so reads are owner-scoped too"). That's now a per-list choice:
-- `is_private` defaults to true, so every existing list — and every list made
-- from here on — stays private until its owner deliberately shares it.
--
-- NOTE for client code: the select policy below no longer implies "mine".
-- Any query that wants only the signed-in user's lists must say so with
-- .eq('user_id', …), or it will also pull back other people's public lists.

alter table public.collections
  add column if not exists is_private boolean not null default true;

-- ─────────────────────────────────────────────────────────────────────────────
-- READS — your own lists always; other people's only once they're public.
-- Writes stay owner-only, exactly as 0005 defined them.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "own collections readable" on public.collections;
drop policy if exists "collections readable"     on public.collections;

create policy "collections readable" on public.collections for select using (
  auth.uid() = user_id or is_private = false
);

-- Items inherit their collection's visibility.
drop policy if exists "own collection items readable" on public.collection_items;
drop policy if exists "collection items readable"     on public.collection_items;

create policy "collection items readable" on public.collection_items for select using (
  exists (
    select 1 from public.collections c
    where c.id = collection_id
      and (c.user_id = auth.uid() or c.is_private = false)
  )
);
