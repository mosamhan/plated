-- Plated — actually produce the 'earnings' notification.
-- Idempotent. Requires 0026_message_notification_text.sql and 0027_creator_earnings.sql.
--
-- `earnings` has been a valid NotificationKind since 0001 and the client's
-- notifications screen has always known how to render one — but nothing ever
-- inserted a row of that kind. 0027 gives the database something to notify
-- about: this migration wires a creator's earning confirming into the existing
-- notify_and_push() pipeline, the same fan-out messages and reactions use.
--
-- notify_and_push gains a trailing `in_order_id` parameter so the notification
-- can deep-link to the plate that earned it. It defaults to null, so the
-- existing message/reaction call sites in 0025/0026 are unaffected.

create or replace function public.notify_and_push(
  recipients uuid[], actor uuid, in_kind text, in_title text, in_body text, in_data jsonb,
  in_order_id uuid default null
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

  stored := case
    when in_kind = 'message' and in_title is not null then in_title || ': ' || in_body
    else in_body
  end;

  insert into public.notifications (user_id, kind, actor_id, order_id, text)
  select r, in_kind, actor, in_order_id, stored from unnest(recipients) as r;

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

-- ─────────────────────────────────────────────────────────────────────────────
-- Earning confirms → notify the creator. Fires only on the pending→confirmed
-- transition (the affiliate-postback function's second, later call) so nobody
-- gets pinged the moment they merely link a click.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_earning_confirmed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    perform public.notify_and_push(
      array[new.creator_id],
      null,
      'earnings',
      'You earned $' || to_char(new.amount_cents / 100.0, 'FM999999990.00'),
      'A plate you posted just confirmed an order — check your dashboard.',
      jsonb_build_object('type', 'earnings', 'earningId', new.id),
      new.order_id
    );
  end if;
  return new;
end $$;

drop trigger if exists creator_earnings_notify on public.creator_earnings;
create trigger creator_earnings_notify after update on public.creator_earnings
  for each row execute function public.notify_earning_confirmed();
