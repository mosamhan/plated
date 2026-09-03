-- Plated — which photo of an album a reply points at.
--
-- `reply_to` (0022) already names the message a reply answers, but an
-- `image` message can carry a whole album (0052) — replying to it alone
-- can't say *which* photo you were looking at when you hit Reply. Mirrors
-- `attachment_index` (0019, "which plate of a multi-plate post"): same
-- idea, one hop over, for the message doing the replying rather than the
-- one being shared.

alter table public.messages
  add column if not exists reply_to_index integer;
