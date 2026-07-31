-- Plated — demo notifications for @MoEats.
--
-- There are no notification-generation triggers yet, so a real account has an
-- empty Notifications screen and no way to see the layout. This seeds one of
-- every kind against real profile and order ids so taps route somewhere real.
--
-- DEMO DATA — safe to delete. Every row is tagged in `text` so the cleanup at
-- the bottom can find them without touching anything real.
--
--   supabase db query --linked -f supabase/seed/notifications_demo.sql
--
-- Re-running is safe: the delete runs first.

delete from public.notifications
 where user_id = 'c49d969c-b515-43c4-93f6-d416f33e441d'
   and text like '%[demo]';

insert into public.notifications (user_id, kind, actor_id, order_id, text, read, created_at) values
  -- Unread → these land in the "New" group at the top of the screen.
  ('c49d969c-b515-43c4-93f6-d416f33e441d', 'reorder',
   'a43111cf-881f-458e-8ea2-4dffa24fdb34', '1805880b-deed-4107-aae6-af3a3e16b51d',
   'Marcus Reed reordered your Tonkotsu Black [demo]', false, now() - interval '12 minutes'),

  ('c49d969c-b515-43c4-93f6-d416f33e441d', 'like',
   '2a387975-6d0f-40df-830b-016f5e73974e', 'c9787779-a3b2-4626-a715-d1e530f69e5e',
   'Olivia Chen liked your The Double Smash [demo]', false, now() - interval '1 hour'),

  ('c49d969c-b515-43c4-93f6-d416f33e441d', 'comment',
   '2a387975-6d0f-40df-830b-016f5e73974e', '29f014ce-2150-4bca-804f-119dbc820a68',
   'Olivia Chen commented: "adding this to my list" [demo]', false, now() - interval '5 hours'),

  -- Read → these fall into the category groups below "New".
  ('c49d969c-b515-43c4-93f6-d416f33e441d', 'follow',
   'a43111cf-881f-458e-8ea2-4dffa24fdb34', null,
   'Marcus Reed started following you [demo]', true, now() - interval '1 day'),

  ('c49d969c-b515-43c4-93f6-d416f33e441d', 'follow',
   'd86c5c19-e038-4312-8481-c9875d3e77aa', null,
   'Test Founder started following you [demo]', true, now() - interval '2 days'),

  ('c49d969c-b515-43c4-93f6-d416f33e441d', 'like',
   'a43111cf-881f-458e-8ea2-4dffa24fdb34', '98463528-25f4-48f3-8487-9f6e615917de',
   'Marcus Reed liked your Al Pastor Tacos [demo]', true, now() - interval '3 days'),

  ('c49d969c-b515-43c4-93f6-d416f33e441d', 'milestone',
   null, null,
   'Your Deep Dish Sausage passed 100 views [demo]', true, now() - interval '4 days'),

  ('c49d969c-b515-43c4-93f6-d416f33e441d', 'earnings',
   null, null,
   'You earned $12.40 from 3 attributed orders [demo]', true, now() - interval '6 days');

-- ─────────────────────────────────────────────────────────────────────────────
-- CLEANUP — removes every row this file created, nothing else:
--
--   supabase db query --linked "delete from public.notifications where text like '%[demo]';"
-- ─────────────────────────────────────────────────────────────────────────────
