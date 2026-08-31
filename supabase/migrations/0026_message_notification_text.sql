-- Plated — name the sender in message notification copy.
-- Idempotent. Requires 0025_push_notifications.sql.
--
-- `notify_and_push` was writing the push body straight into notifications.text,
-- so a row read "the dessert menu is unreal btw" while every other kind reads
-- "Liam liked your Plato…". On the push itself the sender is the *title*, so
-- the split works there — but the in-app row has no title, and next to six rows
-- that all name someone, an unattributed one looks like a bug.
--
-- The two now diverge on purpose: the push keeps title/body (that's the shape
-- iOS wants), and the stored row gets "Name: body".

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
begin
  if recipients is null or array_length(recipients, 1) is null then
    return;
  end if;

  -- Kinds whose body is the sender's own words rather than a sentence about
  -- them need the name prefixed; a reaction's body already reads as a sentence.
  stored := case
    when in_kind = 'message' and in_title is not null then in_title || ': ' || in_body
    else in_body
  end;

  insert into public.notifications (user_id, kind, actor_id, text)
  select r, in_kind, actor, stored from unnest(recipients) as r;

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
