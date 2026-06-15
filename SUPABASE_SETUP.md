# Going live — backend setup (Supabase + Foursquare)

One-time setup to point Plated at a real backend. ~10 minutes. You'll end with three values
in a local `.env` file. **Never commit `.env`** — it's gitignored.

## 1. Supabase project

1. Go to **https://supabase.com** → sign in (GitHub login works) → **New project**.
2. Name it `plated`, pick a strong DB password (save it), choose the region closest to you,
   and create. Wait ~2 min for it to provision.
3. **Run the schema:** left sidebar → **SQL Editor** → **+ New query** → paste the entire contents
   of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → **Run**.
   You should see "Success. No rows returned."
4. **Get your keys:** sidebar → **Project Settings** → **API**. Copy:
   - **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
   - **anon public** key → `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - (The `service_role` key is secret — do **not** put it in the app.)
5. **Auth (optional but recommended):** Authentication → Providers → keep **Email** on. For
   "Sign in with Apple/Google," enable those providers here later (Apple sign-in is required by
   the App Store if you offer any other social login).

## 2. Foursquare Places key

1. Go to **https://foursquare.com/developers** → sign up / log in.
2. Create a **new project** → generate a **Service Key** (the new Places API key).
3. Copy it → `EXPO_PUBLIC_FOURSQUARE_KEY`.

> The free tier is generous for development. The key is currently read in the client; before public
> launch we'll move `searchPlaces` behind a Supabase Edge Function so the key stays server-side.

## 3. Wire it up

Create a `.env` file in the project root (copy `.env.example`) and paste your three values:

```bash
cp .env.example .env
# then edit .env with your real values
```

Restart Expo so it picks up the env vars:

```bash
npx expo start --clear
```

The app detects the keys automatically (`isSupabaseConfigured`) and switches from mock data to the
real backend. Until keys are present, it keeps running on the seeded mock data so development never
blocks.

## 4. Seed your launch city (optional)

To avoid a cold-start empty feed, we can seed a handful of real restaurants + sample plates in one
city. Ask and I'll generate a seed script you run once in the SQL Editor.
