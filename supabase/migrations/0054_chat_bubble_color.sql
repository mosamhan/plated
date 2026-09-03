-- Plated — "Chat bubble" color, the last of the previously-deferred 1:1 menu
-- rows (alert tones stays deferred — no bundled audio to pick from yet).
-- Per-participant and self-scoped, same convention as `muted`/`pinned`
-- (0022/0049): this is "how MY outgoing bubbles look in this one
-- conversation to ME", not synced to the other person, so it lives on
-- conversation_participants rather than conversations.
alter table public.conversation_participants add column if not exists bubble_color text;
