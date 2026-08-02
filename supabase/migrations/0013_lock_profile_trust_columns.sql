-- Plated — stop users from granting themselves trust.
-- Idempotent. Requires 0001_init.sql.
--
-- `update own profile` was written as `using (auth.uid() = id)` and nothing else,
-- which reads like "you may edit your own row" but actually means "you may write
-- any column of your own row". Two of those columns are not the user's to set:
--
--   verified              — the badge the whole app treats as "this is really them"
--   compensation_eligible — the gate on creator payouts
--
-- So any signed-in user could `update profiles set verified = true` and mint
-- themselves a checkmark. Under 16 CFR 465 a self-minted badge next to a
-- commission label is exactly the kind of thing that gets a review app in
-- trouble, so this is worth closing at the privilege layer rather than trusting
-- the client to keep asking nicely.
--
-- The fix is column-level grants, not a policy tweak: a policy can only accept or
-- reject a whole row, so expressing "these two columns are off limits" in RLS
-- means re-reading the old row and comparing. Postgres already has the right
-- primitive. Revoking table-wide UPDATE and granting it back per column makes an
-- offending write fail with `permission denied for column verified` before any
-- policy runs.
--
-- Both columns stay writable by `service_role` and `postgres`, which is where
-- verification and payout eligibility belong — an admin action or an Edge
-- Function, never the client.

-- ─────────────────────────────────────────────────────────────────────────────
-- Column-level UPDATE
-- ─────────────────────────────────────────────────────────────────────────────
revoke update on public.profiles from authenticated, anon;

-- Everything a user legitimately owns about their own presentation. `handle` is
-- not editable in the app today, but it is theirs and the unique index already
-- guards collisions, so it is granted now rather than becoming a confusing
-- permission error the day an edit-username screen ships.
grant update (name, handle, avatar_url, bio, socials) on public.profiles to authenticated;

-- `id` and `created_at` are deliberately absent: identity and age of an account
-- are not editable by anyone through this path.

-- ─────────────────────────────────────────────────────────────────────────────
-- The policy itself
-- ─────────────────────────────────────────────────────────────────────────────
-- The missing `with check` is a second, independent hole: `using` decides which
-- rows may be *targeted*, while `with check` decides what the row may look like
-- *after* the write. Without it the resulting row is never re-tested against the
-- policy. Column grants make `id` unwritable anyway, but a policy that only says
-- half of what it means is worth finishing.
drop policy if exists "update own profile" on public.profiles;

create policy "update own profile" on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Note: the signup path is unaffected. `handle_new_user()` is `security definer`,
-- so it inserts as the function owner and never consults these grants.
