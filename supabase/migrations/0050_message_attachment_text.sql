-- Plated — `messages.attachment_id` was declared `uuid` in 0019, but two kinds
-- that already exist store a full storage URL there, not a uuid: `voice`
-- (VoiceComposer's onRecorded uploads to the `voice` bucket and passes the
-- public URL) and the new `image` kind (0049, same pattern). Every insert of
-- either kind has been failing outright with "invalid input syntax for type
-- uuid" — this was never a working path, just never noticed until image
-- sending surfaced it. `plate`/`plato`/`story_reply` still store a real uuid
-- (an id in another table) — widening to `text` is fully backward compatible
-- with those, since every uuid is already a valid string.
alter table public.messages alter column attachment_id type text;
