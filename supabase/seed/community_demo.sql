-- Plated — a demo community: ~100 users, a follow graph, Platos and plates.
--
-- What an empty database can't show you is how anything *reads* at scale: a
-- creator with 60 followers instead of 0, a reel with a real view count, a feed
-- with more than five plates in it. This seeds that.
--
-- DEMO DATA — every account is `demo.N@plated.test`, so deleting those auth
-- users cascades the whole thing away (profiles → follows, platos, likes,
-- views, comments, orders). Cleanup is the single delete at the top.
--
--   supabase db query --linked -f supabase/seed/community_demo.sql
--
-- Re-running is safe: it clears the previous run first.

-- ─────────────────────────────────────────────────────────────────────────────
-- Reset
-- ─────────────────────────────────────────────────────────────────────────────
delete from auth.users where email like 'demo.%@plated.test';

-- Deterministic: the same "random" community every run, so screenshots and bug
-- reports stay comparable.
select setseed(0.42);

-- The real account everything is arranged around.
create temporary table me (id uuid) on commit drop;
insert into me values ('c49d969c-b515-43c4-93f6-d416f33e441d');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. People. The profile row is created by the on_auth_user_created trigger,
--    which reads name/handle/avatar out of raw_user_meta_data.
-- ─────────────────────────────────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data)
select
  gen_random_uuid(),
  'demo.' || i || '@plated.test',
  jsonb_build_object(
    'name', n.fn || ' ' || n.ln,
    'handle', lower(n.fn) || lower(left(n.ln, 1)) || i,
    'avatar_url', 'https://i.pravatar.cc/300?img=' || (1 + (i % 70))
  )
from generate_series(1, 100) i
cross join lateral (
  select
    (array['Ava','Liam','Mia','Noah','Zoe','Kai','Ivy','Leo','Nina','Omar',
           'Sofia','Ravi','Elena','Jonah','Priya','Marco','Yuki','Dante','Freya','Andre'])[1 + (i % 20)] as fn,
    (array['Nguyen','Patel','Rivera','Okafor','Kim','Rossi','Haddad','Silva','Chen','Meyer',
           'Torres','Novak','Aziz','Brooks','Lindqvist','Ferrari','Yamada','Costa','Byrne','Diallo'])[1 + ((i / 5) % 20)] as ln
) n;

-- Bios, and who counts as a creator. 1–12 are creators (verified); 1–8 clear the
-- compensation bar, so the commission labelling has something to render.
with du as (
  select id, (split_part(split_part(email, '@', 1), '.', 2))::int as n
    from auth.users where email like 'demo.%@plated.test'
)
update public.profiles p set
  bio = (array[
    'Chasing the perfect bite, one plate at a time.',
    'Ramen first, questions later.',
    'I photograph what I eat. Sorry in advance.',
    'Neighbourhood spots > hype spots.',
    'Coffee in the morning, tacos at night.',
    'Will queue for good bread.',
    'Eating my way through the boroughs.',
    'Dessert is a separate stomach.'
  ])[1 + (du.n % 8)],
  verified = du.n <= 12,
  compensation_eligible = du.n <= 8
from du where p.id = du.id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The follow graph.
--    Notification triggers are off for the bulk: 600 follows would mean 600
--    notification rows nobody will ever read. A handful of interactions aimed at
--    the real account are replayed at the end with triggers back on, so that
--    feed fills up the way it actually would.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.follows disable trigger follows_notify;
alter table public.plato_likes disable trigger plato_likes_notify;
alter table public.plato_comments disable trigger plato_comments_notify;
alter table public.likes disable trigger likes_notify;

-- Creators pick up most of the following.
with du as (
  select id, (split_part(split_part(email, '@', 1), '.', 2))::int as n
    from auth.users where email like 'demo.%@plated.test'
)
insert into public.follows (follower_id, following_id)
select f.id, c.id
  from du f cross join du c
 where c.n <= 12 and f.id <> c.id and random() < 0.55
on conflict do nothing;

-- Plus a thinner mesh between everyone else, so nobody sits at zero.
with du as (
  select id, (split_part(split_part(email, '@', 1), '.', 2))::int as n
    from auth.users where email like 'demo.%@plated.test'
)
insert into public.follows (follower_id, following_id)
select f.id, t.id
  from du f cross join du t
 where t.n > 12 and f.id <> t.id and random() < 0.06
on conflict do nothing;

-- The real account: a believable following, and following the creators back.
with du as (
  select id, (split_part(split_part(email, '@', 1), '.', 2))::int as n
    from auth.users where email like 'demo.%@plated.test'
)
insert into public.follows (follower_id, following_id)
select f.id, (select id from me) from du f where random() < 0.62
on conflict do nothing;

with du as (
  select id, (split_part(split_part(email, '@', 1), '.', 2))::int as n
    from auth.users where email like 'demo.%@plated.test'
)
insert into public.follows (follower_id, following_id)
select (select id from me), c.id from du c where c.n <= 12
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Platos — two per creator, on the real restaurants, using the same demo
--    clips the app falls back to so they actually play.
-- ─────────────────────────────────────────────────────────────────────────────
with du as (
  select id, (split_part(split_part(email, '@', 1), '.', 2))::int as n
    from auth.users where email like 'demo.%@plated.test'
),
menu as (
  select r.id as restaurant_id, r.name as restaurant_name, d.dish, row_number() over (order by r.name, d.dish) as k
    from public.restaurants r
    join (values
      ('Ippudo', 'Akamaru Modern'), ('Ippudo', 'Pork Buns'),
      ('Sushi Yasuda', 'Chef''s Omakase'), ('Sushi Yasuda', 'Toro Nigiri'),
      ('Los Tacos No. 1', 'Adobada Taco'), ('Los Tacos No. 1', 'Nopal Quesadilla'),
      ('5 Napkin Burger', 'Original 5 Napkin'), ('5 Napkin Burger', 'Truffle Fries'),
      ('Tappo', 'Burrata Pizza'), ('Tappo', 'Cacio e Pepe'),
      ('Match 65 Brasserie', 'Steak Frites'), ('Match 65 Brasserie', 'Onion Soup'),
      ('Hafız Mustafa', 'Pistachio Baklava'), ('Hafız Mustafa', 'Turkish Coffee'),
      ('Ipsento 606', 'Cortado'), ('Ipsento 606', 'Miso Latte'),
      ('3 Arts Club Cafe at RH Chicago', 'Truffled Egg Toast'), ('3 Arts Club Cafe at RH Chicago', 'Rosé Spritz')
    ) as d(rname, dish) on d.rname = r.name
),
creators as (
  select id, n, row_number() over (order by n) as c from du where n <= 12
),
picks as (
  select c.id as user_id, c.c, g.j, m.restaurant_id, m.restaurant_name, m.dish,
         ((c.c * 2 + g.j) % 4) as clip
    from creators c
    cross join generate_series(0, 1) g(j)
    join menu m on m.k = 1 + (((c.c - 1) * 2 + g.j) % 18)
)
insert into public.plato_videos (user_id, restaurant_id, restaurant_name, video_url, dish_name, rating, caption)
select
  p.user_id, p.restaurant_id, p.restaurant_name,
  'https://assets.mixkit.co/videos/' ||
    (array['44001/44001-1080.mp4', '3537/3537-1080.mp4', '12171/12171-1080.mp4', '2442/2442-1080.mp4'])[1 + p.clip],
  p.dish,
  round((7.9 + random() * 2.0)::numeric, 1),
  (array[
    'Genuinely one of the best things I''ve eaten this month. 🔥',
    'Go early, the queue is real by 7.',
    'Split it if you''re not starving — it''s bigger than it looks.',
    'Been back three times. Not sorry.',
    'The kind of place you tell two people about and no more.',
    'Worth the detour. Ask for the corner table.'
  ])[1 + ((p.c * 2 + p.j) % 6)]
from picks p;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Engagement. Views drive view_count through the 0009 trigger, so the reels
--    show real numbers rather than invented ones.
-- ─────────────────────────────────────────────────────────────────────────────
with du as (select id from auth.users where email like 'demo.%@plated.test')
insert into public.plato_likes (plato_id, user_id)
select v.id, u.id from public.plato_videos v cross join du u where random() < 0.38
on conflict do nothing;

with du as (select id from auth.users where email like 'demo.%@plated.test')
insert into public.plato_views (plato_id, user_id)
select v.id, u.id from public.plato_videos v cross join du u where random() < 0.72
on conflict do nothing;

with du as (
  select id, (split_part(split_part(email, '@', 1), '.', 2))::int as n
    from auth.users where email like 'demo.%@plated.test'
)
insert into public.plato_comments (plato_id, user_id, text)
select v.id, u.id,
  (array[
    'okay this just went on the list',
    'the crust though 😮‍💨',
    'went last week — completely agree',
    'is it still this good on weekends?',
    'adding to my Want to try',
    'best in the city imo'
  ])[1 + (u.n % 6)]
from public.plato_videos v cross join du u where random() < 0.05;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Plates, so the feed and the rankings aren't carried by five posts.
--    photo_url stays null on purpose — the app fills it with a varied stock
--    photo derived from the row id.
-- ─────────────────────────────────────────────────────────────────────────────
with du as (
  select id, (split_part(split_part(email, '@', 1), '.', 2))::int as n
    from auth.users where email like 'demo.%@plated.test'
),
menu as (
  select r.id as restaurant_id, d.dish, row_number() over (order by r.name, d.dish) as k
    from public.restaurants r
    join (values
      ('Ippudo', 'Akamaru Modern'), ('Ippudo', 'Shoyu Ramen'),
      ('Sushi Yasuda', 'Omakase Set'), ('Sushi Yasuda', 'Uni Nigiri'),
      ('Los Tacos No. 1', 'Al Pastor Taco'), ('Los Tacos No. 1', 'Carne Asada'),
      ('5 Napkin Burger', 'The Double Smash'), ('5 Napkin Burger', 'Buttermilk Chicken'),
      ('Tappo', 'Margherita DOP'), ('Tappo', 'Rigatoni Vodka'),
      ('Match 65 Brasserie', 'Croque Madame'), ('Match 65 Brasserie', 'Duck Confit'),
      ('Hafız Mustafa', 'Kunefe'), ('Hafız Mustafa', 'Lokum Selection'),
      ('Ipsento 606', 'Flat White'), ('Ipsento 606', 'Nitro Cold Brew'),
      ('3 Arts Club Cafe at RH Chicago', 'Avocado Toast'), ('3 Arts Club Cafe at RH Chicago', 'Lobster Roll')
    ) as d(rname, dish) on d.rname = r.name
)
insert into public.orders (user_id, restaurant_id, dish_name, description, rating, tags, created_at)
select
  u.id, m.restaurant_id, m.dish,
  (array[
    'Exactly what I wanted it to be.',
    'Rich without being heavy — I''d order it again tomorrow.',
    'Good, not life-changing, but I''d go back.',
    'Portion is generous. Come hungry.',
    'The sauce is the whole point.',
    'Solid every single time.'
  ])[1 + ((u.n + m.k) % 6)],
  round((6.8 + random() * 3.0)::numeric, 1),
  -- Explore's default filter matches on the 'Trending' tag, so tagging
  -- everything 'Nearby' would hide all of this behind a chip nobody taps first.
  case when random() < 0.55 then array['Trending', 'Nearby'] else array['Nearby'] end,
  now() - (random() * interval '45 days')
from du u
join menu m on m.k = 1 + ((u.n * 7) % 18)
where random() < 0.62;

with du as (select id from auth.users where email like 'demo.%@plated.test')
insert into public.likes (order_id, user_id)
select o.id, u.id from public.orders o cross join du u where random() < 0.14
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Triggers back on, then a few interactions aimed at the real account — so
--    its notification feed is generated the same way a live one would be.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.follows enable trigger follows_notify;
alter table public.plato_likes enable trigger plato_likes_notify;
alter table public.plato_comments enable trigger plato_comments_notify;
alter table public.likes enable trigger likes_notify;

-- Three fresh follows (these were excluded above by the on-conflict no-op only
-- if they already existed, so pick people who don't follow yet).
with du as (
  select id, (split_part(split_part(email, '@', 1), '.', 2))::int as n
    from auth.users where email like 'demo.%@plated.test'
),
fresh as (
  select d.id from du d
   where not exists (
     select 1 from public.follows f where f.follower_id = d.id and f.following_id = (select id from me)
   )
   order by d.n limit 3
)
insert into public.follows (follower_id, following_id)
select f.id, (select id from me) from fresh f
on conflict do nothing;

-- And some love for the real account's own Plato, if it has one.
with du as (
  select id, (split_part(split_part(email, '@', 1), '.', 2))::int as n
    from auth.users where email like 'demo.%@plated.test'
),
mine as (select id from public.plato_videos where user_id = (select id from me) limit 1)
insert into public.plato_likes (plato_id, user_id)
select m.id, d.id from mine m cross join (select id from du order by n limit 4) d
on conflict do nothing;

with du as (
  select id, (split_part(split_part(email, '@', 1), '.', 2))::int as n
    from auth.users where email like 'demo.%@plated.test'
),
mine as (select id from public.plato_videos where user_id = (select id from me) limit 1)
insert into public.plato_comments (plato_id, user_id, text)
select m.id, d.id, 'this is the one that made me want to go'
  from mine m cross join (select id from du order by n limit 1) d;

-- ─────────────────────────────────────────────────────────────────────────────
-- CLEANUP — removes every account this file created and, by cascade, all of
-- their follows, platos, likes, views, comments, plates and notifications:
--
--   supabase db query --linked "delete from auth.users where email like 'demo.%@plated.test';"
-- ─────────────────────────────────────────────────────────────────────────────
