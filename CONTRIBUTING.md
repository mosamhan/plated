# Contributing to Plated

This is an App Store– and Play Store–bound app with a live Supabase backend, real users' data
model, and a growing surface area. This doc is the process that keeps that shippable: how work
gets branched, committed, migrated, and documented. It formalizes what this repo has already been
doing (see `git log`), not a new invention.

## Branching

- **`main`** — what's been submitted to the App Store / Play Store, or is ready to be. Only
  release commits and hotfixes land here directly.
- **`develop`** — the integration branch. Everything lands here first. This is what `git checkout`
  gives you by default.
- **Feature work** gets its own branch off `develop`, named `type/short-description`:
  - `feat/group-invite-links`
  - `fix/keyboard-gap-on-composer`
  - `chore/eslint-flat-config`
  - `polish/micro-interactions-a11y`

  See the [commit types](#commit-messages) below — the branch prefix matches. Open a PR into
  `develop` when the branch is ready; merge (don't squash — the commit history inside a feature
  branch is often itself meaningful, see below) once it's reviewed and CI is green.

- **Solo/small changes** (a copy fix, a one-line bug fix, a config tweak) can commit straight to
  `develop` — branching every trivial change just adds ceremony without adding safety. Use
  judgment: if it touches a migration, an Edge Function, or anything a reviewer would want to see
  in isolation, it gets a branch.

- **`main` never gets force-pushed, and neither does `develop`** once anyone else may have based
  work on it. If a branch needs cleanup, `rebase`/`squash` on the *feature* branch before it merges
  — not after.

## Commit messages

Conventional-commit style, already the convention in this repo's history:

```
type(scope): short summary in imperative mood

Longer body explaining *why*, not just what — the diff already shows what changed.
Call out anything a reviewer needs to know that isn't obvious from the code: a
tradeoff you made, a bug you found and fixed along the way, a migration that
depends on another one, a thing you deliberately left out and why.
```

**Types:** `feat`, `fix`, `chore`, `polish`, `refactor`, `docs`. **Scope** is the feature area
(`messaging`, `discover`, `business`, `shared-infra`, …), not a file path.

- One commit per coherent unit of work, not one commit per file and not one giant commit for a
  week of changes. If you can't summarize a commit in one line without an "and", it's probably two
  commits.
- When a change surfaces a bug in *already-shipped* code (not the thing you're currently building),
  say so explicitly in the body — "confirmed live, not just inferred" is worth writing out. Silent
  bundled fixes are how a changelog stops being trustworthy.
- Every commit that touches a migration, an Edge Function, or a client entry point should pass
  `npx tsc --noEmit` and `npx eslint` on the touched files before it lands — not after, not "in a
  follow-up."

## Database migrations

Migrations live in `supabase/migrations/`, numbered sequentially (`00NN_description.sql`), and are
the actual source of truth for schema — never hand-edit the Supabase dashboard for anything that
should survive a fresh `supabase db push`. Every migration:

- Starts with a header comment: what it does, why, and which earlier migrations it requires
  (`-- Plated — <what>. Idempotent. Requires 0019_messaging.sql.`).
- Is **idempotent** — `create table if not exists`, `drop policy if exists` before
  `create policy`, `create or replace function`. Re-running an already-applied migration should be
  a no-op, not an error.
- Watch the **overload trap**: `create or replace function` only replaces a function whose
  *parameter list* matches exactly. Changing a function's signature without checking its *live*
  signature first (`pg_get_function_identity_arguments` against `pg_proc`, not just what an
  earlier migration file says) can silently leave two overloads behind — every call site with the
  old arg count then fails with "function is not unique." This has happened in this repo twice
  (`0064`, `0065` fixed real breakage from it). When touching a shared function, check what's
  actually live first.
- Gets applied with `supabase db push` and verified — a migration that only exists in the repo and
  was never pushed is not done.

## Documentation

Docs go stale silently unless updating them is part of the same change, not a follow-up task:

- **`README.md`** — update when a user-facing feature ships that changes what the app *is*
  (a new major surface, a backend going from mock-data to live, a roadmap item actually landing).
  Not every small feature needs a README mention — the "What makes it different" and tech-stack
  sections should stay a snapshot of the app's shape, not a changelog.
- **`DEPLOYMENT.md`** — update when something changes what's required before a store submission:
  a new compliance requirement met, a new key that needs rotating/restricting, a new known
  deferral.
- **`SUPABASE_SETUP.md`** — update if the setup steps themselves change (a new required secret, a
  new provider to configure) — this one drifts fastest because migration counts move every week;
  don't hardcode a specific migration range, point at the directory.
- **This file** — update when the *process* changes, not the product.

If you're not sure whether a change is "big enough" to need a docs update, ask: would someone
cloning this repo fresh, reading only the docs, be misled about what exists or how to set it up?
If yes, update the docs in the same PR/commit as the change, not after.

## Verification before merging

- `npx tsc --noEmit` clean.
- `npx eslint` clean on every touched file (pre-existing warnings elsewhere in the codebase are not
  yours to fix in an unrelated change, but don't add new ones).
- Live-verify UI changes in the Simulator (or on device) before calling a task done — a passing
  typecheck proves the code compiles, not that the feature works.
- For anything touching Edge Functions or migrations: verify against the actual live Supabase
  project (`supabase db query --linked`), not just that the SQL/TS looks right on paper. Several
  real bugs in this codebase's history were caught exactly this way and would have shipped broken
  otherwise.
