-- Plated — the settings a real account needs.
-- Idempotent. Requires 0001_init.sql and 0019_messaging.sql.
--
-- One row per user in `user_settings` rather than more columns on `profiles`:
-- profiles is read by everyone (it backs every avatar and handle in the app),
-- and someone's comment-audience preference is nobody else's business. Keeping
-- preferences in their own owner-only table means the read policy is simply
-- "it's yours", instead of trying to hide columns from a world-readable row.
--
-- The exceptions already live on `profiles` and stay there, because other
-- people's clients genuinely need them to render correctly:
--   message_privacy (0019) · show_activity / last_active_at (0023)

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles on delete cascade,

  -- Who can see your plates at all. A private account's posts are visible only
  -- to accepted followers.
  private_account boolean not null default false,

  -- Stories
  story_reply_audience text not null default 'followers'
    check (story_reply_audience in ('followers', 'friends', 'off')),
  story_share_audience text not null default 'public'
    check (story_share_audience in ('public', 'friends', 'close')),
  allow_story_resharing boolean not null default true,
  save_story_to_archive boolean not null default true,

  -- Interaction
  comment_audience text not null default 'everyone'
    check (comment_audience in ('everyone', 'followers', 'friends', 'off')),
  tag_audience text not null default 'everyone'
    check (tag_audience in ('everyone', 'followers', 'friends', 'off')),
  allow_resharing boolean not null default true,

  -- App & media. Kept server-side rather than on-device so they follow the
  -- account onto a new phone.
  upload_hd boolean not null default false,
  reduce_motion boolean not null default false,

  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "own settings readable" on public.user_settings;
drop policy if exists "insert own settings"   on public.user_settings;
drop policy if exists "update own settings"   on public.user_settings;

create policy "own settings readable" on public.user_settings for select using (auth.uid() = user_id);
create policy "insert own settings"   on public.user_settings for insert with check (auth.uid() = user_id);
create policy "update own settings"   on public.user_settings for update using (auth.uid() = user_id);

-- Every profile gets a settings row, so the client can always upsert against
-- one instead of branching on "does it exist yet".
create or replace function public.seed_user_settings()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists seed_user_settings on public.profiles;
create trigger seed_user_settings
  after insert on public.profiles
  for each row execute function public.seed_user_settings();

insert into public.user_settings (user_id)
select id from public.profiles on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- CLOSE FRIENDS — the smaller audience a story can be posted to.
-- Deliberately one-directional and private: the list is yours, and the people
-- on it are not told they're on it.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.close_friends (
  user_id uuid not null references public.profiles on delete cascade,
  friend_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

alter table public.close_friends enable row level security;

drop policy if exists "own close friends readable" on public.close_friends;
drop policy if exists "add close friend"           on public.close_friends;
drop policy if exists "remove close friend"        on public.close_friends;

create policy "own close friends readable" on public.close_friends for select using (auth.uid() = user_id);
create policy "add close friend"    on public.close_friends for insert with check (auth.uid() = user_id);
create policy "remove close friend" on public.close_friends for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- MUTED STORIES — stop seeing someone's stories without unfollowing them.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.story_mutes (
  user_id uuid not null references public.profiles on delete cascade,
  muted_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, muted_id)
);

alter table public.story_mutes enable row level security;

drop policy if exists "own story mutes readable" on public.story_mutes;
drop policy if exists "mute stories"             on public.story_mutes;
drop policy if exists "unmute stories"           on public.story_mutes;

create policy "own story mutes readable" on public.story_mutes for select using (auth.uid() = user_id);
create policy "mute stories"   on public.story_mutes for insert with check (auth.uid() = user_id);
create policy "unmute stories" on public.story_mutes for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- HIDDEN WORDS — comments containing any of these are filtered from your posts.
-- Stored as rows rather than an array so the list can be edited one word at a
-- time without read-modify-write races between devices.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.hidden_words (
  user_id uuid not null references public.profiles on delete cascade,
  word text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, word)
);

alter table public.hidden_words enable row level security;

drop policy if exists "own hidden words readable" on public.hidden_words;
drop policy if exists "add hidden word"           on public.hidden_words;
drop policy if exists "remove hidden word"        on public.hidden_words;

create policy "own hidden words readable" on public.hidden_words for select using (auth.uid() = user_id);
create policy "add hidden word"    on public.hidden_words for insert with check (auth.uid() = user_id);
create policy "remove hidden word" on public.hidden_words for delete using (auth.uid() = user_id);
