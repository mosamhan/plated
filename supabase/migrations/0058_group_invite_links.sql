-- Plated — group invite links.
--
-- A shareable code that lets someone join a group without an existing
-- member adding them by hand first. Joining itself needs no new RLS: the
-- "add participant" policy (0019) already lets anyone insert their own
-- membership row into any conversation — a link is just how a non-member
-- learns which conversation id to insert against, something they can't
-- currently discover on their own (`"conversations readable"` requires
-- `in_conversation`, so a stranger can't just browse for the group).
--
-- Three RPCs, all SECURITY DEFINER since none of them can rely on the
-- caller already being a member:
--
--   get_or_create_invite_code — owner-only, mints a code if the group
--     doesn't have one yet (or a fresh one, when regenerate is true —
--     "Reset link" invalidates whatever's already circulating).
--   invite_preview             — anyone can look up a code's group name/
--     photo/member count before deciding to join, without being able to
--     read the conversation row directly yet.
--   join_via_invite            — resolves a code to a conversation and
--     inserts the caller's own membership row.

alter table public.conversations
  add column if not exists invite_code text unique;

create or replace function public.get_or_create_invite_code(cid uuid, regenerate boolean default false)
returns text
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  existing text;
  code text;
begin
  if not exists (
    select 1 from public.conversations
     where id = cid and is_group = true and created_by = auth.uid()
  ) then
    raise exception 'not the owner of this group';
  end if;

  select invite_code into existing from public.conversations where id = cid;
  if existing is not null and not regenerate then
    return existing;
  end if;

  loop
    code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      update public.conversations set invite_code = code where id = cid;
      exit;
    exception when unique_violation then
      -- Collision against another group's code — vanishingly unlikely at
      -- 8 base-16 characters, but loop rather than assume it can't happen.
    end;
  end loop;

  return code;
end $$;

revoke all on function public.get_or_create_invite_code(uuid, boolean) from public;
grant execute on function public.get_or_create_invite_code(uuid, boolean) to authenticated;

create or replace function public.invite_preview(code text)
returns table (conversation_id uuid, title text, avatar_url text, member_count bigint)
language sql stable
security definer set search_path = public
as $$
  select c.id, c.title, c.avatar_url, count(p.user_id)
    from public.conversations c
    join public.conversation_participants p on p.conversation_id = c.id
   where c.invite_code = code and c.is_group = true
   group by c.id, c.title, c.avatar_url
$$;

revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to authenticated;

create or replace function public.join_via_invite(code text)
returns uuid
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  cid uuid;
begin
  select id into cid from public.conversations where invite_code = code and is_group = true;
  if cid is null then
    raise exception 'invalid invite link';
  end if;

  insert into public.conversation_participants (conversation_id, user_id)
  values (cid, auth.uid())
  on conflict (conversation_id, user_id) do nothing;

  -- A deliberate self-join via a link you already hold is never a request
  -- to approve — gate_conversation_participant's default (friends-only
  -- privacy on the joiner's own profile downgrades a fresh row to
  -- 'request') exists for being added *by someone else*, not for choosing
  -- to join yourself.
  update public.conversation_participants
     set state = 'accepted'
   where conversation_id = cid and user_id = auth.uid();

  return cid;
end $$;

revoke all on function public.join_via_invite(text) from public;
grant execute on function public.join_via_invite(text) to authenticated;
