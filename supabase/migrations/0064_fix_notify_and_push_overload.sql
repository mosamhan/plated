-- Plated — fixes a bug introduced by 0063: `notify_and_push`'s *live* schema
-- already had a 7th parameter (`in_order_id uuid default null`, added by
-- some migration between 0026 and 0058 that predates this session's
-- exploration of the codebase) that 0063's `create or replace function`
-- didn't know about. Postgres treats a differing parameter list as a new
-- overload rather than a replacement (the exact 0051 gotcha, recurring) —
-- so 0063 left TWO versions of `notify_and_push` behind, and every call
-- site passing exactly 6 args (every existing trigger) became ambiguous
-- between them: "function public.notify_and_push(...) is not unique",
-- which rolled back every single message insert. Confirmed live via
-- `supabase db query --linked` against `pg_proc`.
--
-- Fix: drop the stray 6-arg overload 0063 created, and re-create the
-- function with its actual full 7-arg signature — this time really
-- replacing it — with the `conversation_id` column write from 0063 kept.

drop function if exists public.notify_and_push(uuid[], uuid, text, text, text, jsonb);

create or replace function public.notify_and_push(
  recipients uuid[], actor uuid, in_kind text, in_title text, in_body text, in_data jsonb,
  in_order_id uuid default null::uuid
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

  insert into public.notifications (user_id, kind, actor_id, order_id, conversation_id, text)
  select r, in_kind, actor, in_order_id, conv, stored from unnest(recipients) as r;

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
