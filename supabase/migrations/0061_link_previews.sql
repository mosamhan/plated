-- Plated — a small cache for link-preview metadata (title/description/image
-- scraped from a pasted URL's Open Graph tags). Idempotent.
--
-- Public-read, no user-scoping: this is just metadata about a URL, the same
-- shape whether you or anyone else pasted it, so there's nothing to gate by
-- `auth.uid()`. No insert/update policy at all — only the `link-preview`
-- edge function writes here, via its service-role client, which bypasses RLS
-- entirely. A client with only the anon/authenticated key can read, never write.

create table if not exists public.link_previews (
  url text primary key,
  title text,
  description text,
  image_url text,
  fetched_at timestamptz not null default now()
);

alter table public.link_previews enable row level security;

drop policy if exists "link previews are public" on public.link_previews;
create policy "link previews are public" on public.link_previews for select using (true);
