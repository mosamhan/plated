-- Plated — collection items must hold non-uuid ids too.
-- Idempotent. Requires 0005_collections.sql.
--
-- `item_id` was declared uuid, but a collection is polymorphic and legitimately
-- holds ids that are not database uuids:
--   • the demo Platos the app falls back to whenever `plato_videos` is empty
--     (see seedFromDemo in src/store/PlatosContext.tsx) — ids like 'p1'
--   • places that so far only exist in Foursquare, not yet in `restaurants`
-- Postgres rejected those inserts outright (22P02), and because the client adds
-- optimistically and reverts on error, the save silently undid itself — you'd
-- tick a list, close the sheet, and the item was simply gone.
--
-- There was never an FK on this column (item_type decides which table it points
-- at), so text is the honest type. Integrity stays where 0005 put it: app code
-- plus RLS. The primary key (collection_id, item_type, item_id) is unaffected
-- beyond an index rebuild, and uuid → text preserves every existing row.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'collection_items'
      and column_name  = 'item_id'
      and data_type    = 'uuid'
  ) then
    alter table public.collection_items
      alter column item_id type text using item_id::text;
  end if;
end $$;
