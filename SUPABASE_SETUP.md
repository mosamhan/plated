# Going live — backend setup (Supabase + Foursquare)

One-time setup to point Plated at a real backend. ~10 minutes. You'll end with three values
in a local `.env` file. **Never commit `.env`** — it's gitignored.

## 1. Supabase project

1. Go to **https://supabase.com** → sign in (GitHub login works) → **New project**.
2. Name it `plated`, pick a strong DB password (save it), choose the region closest to you,
   and create. Wait ~2 min for it to provision.
3. **Run the schema:** apply every file in [`supabase/migrations/`](supabase/migrations/) in
   numeric order (`0001_init.sql` → `0002_platos.sql` → … → `0005_collections.sql`). Two ways:
   - **SQL Editor** (simplest): sidebar → **SQL Editor** → **+ New query** → paste each file's
     contents in order → **Run** (expect "Success. No rows returned." each time). `0002`+ are
     idempotent, so re-running a file is safe.
   - **Supabase CLI** (if you use it): `supabase link` then `supabase db push`.
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
3. Store it as an Edge Function secret — **not** in `.env`:

```bash
supabase secrets set FOURSQUARE_KEY=your-service-key
supabase functions deploy places
```

> This key is billable, so it never goes in the app. Anything named `EXPO_PUBLIC_*` is inlined into
> the shipped JS bundle, where it can be read straight out of a downloaded build and spent. The
> client calls the `places` Edge Function (`supabase/functions/places/index.ts`) instead, which holds
> the key, requires a signed-in user, and builds the upstream request itself so a caller can't aim
> the key at arbitrary Foursquare endpoints.
>
> Note that `verify_jwt` alone would **not** be enough here: it only proves a token was signed by
> this project, and the public anon key is such a token. The function calls `getUser()` to tell a
> real user from the anon key.

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
