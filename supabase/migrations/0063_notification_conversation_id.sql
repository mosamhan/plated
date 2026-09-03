-- Plated — let a notification remember which conversation it's about.
-- Idempotent. Requires 0026_message_notification_text.sql.
--
-- `notify_and_push`'s `in_data` jsonb already carries `conversationId` for
-- 'message'/'reaction'/'mention' — it was only ever used for the push
-- payload and then dropped on the floor for the in-app row, which is fine
-- for 'message'/'reaction' (excluded from notifications.tsx, they live in
-- the inbox instead) but not for 'mention', which does need to open the
-- right thread when tapped. Same signature as before (the 0051 overload
-- trap), just persisting one more thing from a jsonb blob it already had.

alter table public.notifications add column if not exists conversation_id uuid references public.conversations on delete cascade;

create or replace function public.notify_and_push(
  recipients uuid[], actor uuid, in_kind text, in_title text, in_body text, in_data jsonb
) returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  cfg record;
  tokens text[];
  stored text;
  conv uuid;
begin
  if recipients is null or array_length(recipients, 1) is null then
    return;
  end if;

  stored := case
    when in_kind = 'message' and in_title is not null then in_title || ': ' || in_body
    else in_body
  end;
  conv := nullif(in_data->>'conversationId', '')::uuid;

  insert into public.notifications (user_id, kind, actor_id, text, conversation_id)
  select r, in_kind, actor, stored, conv from unnest(recipients) as r;

  select * into cfg from public.push_config where id;
  if cfg.function_url is null or cfg.service_key is null then
    return;
  end if;

  select array_agg(t.token) into tokens
    from public.push_tokens t
   where t.user_id = any(recipients);

  if tokens is null then
    return;
  end if;

  perform extensions.net.http_post(
    url := cfg.function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cfg.service_key
    ),
    body := jsonb_build_object('tokens', tokens, 'title', in_title, 'body', in_body, 'data', in_data)
  );
end $$;
