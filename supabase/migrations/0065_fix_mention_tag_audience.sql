-- Plated — fixes a bug in 0062: `tag_audience` lives on `public.user_settings`
-- (one row per user, keyed by `user_id`), not on `public.profiles` — see
-- 0024_user_settings.sql's own header for why it's split out (profiles is
-- world-readable; a privacy preference isn't). `notify_message_mentions`
-- referenced `p.tag_audience` directly on the joined `profiles` row, which
-- doesn't exist there at all — confirmed live via `supabase db query
-- --linked` ("column p.tag_audience does not exist"), which meant *every*
-- message containing an "@" token failed to insert entirely, not just
-- mentions failing quietly.
--
-- Fix: left-join `user_settings` instead, and treat a user with no settings
-- row as the table's own default ('everyone') rather than excluding them —
-- matching what an unset preference actually means elsewhere in this schema.

create or replace function public.notify_message_mentions()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  handles text[];
  recipients uuid[];
  sender_name text;
begin
  select array_agg(distinct m[1]) into handles
  from regexp_matches(new.text, '@([a-zA-Z0-9_.]{2,30})', 'g') as m;
  if handles is null then
    return new;
  end if;

  select array_agg(distinct p.id) into recipients
  from public.profiles p
  join public.conversation_participants cp
    on cp.user_id = p.id
   and cp.conversation_id = new.conversation_id
   and cp.state = 'accepted'
  left join public.user_settings us on us.user_id = p.id
  where p.handle = any(handles)
    and p.id <> new.sender_id
    and coalesce(us.tag_audience, 'everyone') <> 'off';

  if recipients is null then
    return new;
  end if;

  sender_name := public.display_name(new.sender_id);
  perform public.notify_and_push(
    recipients,
    new.sender_id,
    'mention',
    sender_name,
    sender_name || ' mentioned you: ' || left(new.text, 120),
    jsonb_build_object('type', 'mention', 'conversationId', new.conversation_id)
  );
  return new;
end $$;
