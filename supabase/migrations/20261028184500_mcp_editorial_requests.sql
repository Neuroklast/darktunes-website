-- Editorial changes may only be submitted through the application server.
-- ChatGPT cannot directly publish, delete records, access finance or bypass RBAC.
create table if not exists public.mcp_editorial_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  collection text not null check (collection in ('news_posts','artists','releases','concerts')),
  target_id uuid not null,
  changes jsonb not null check (jsonb_typeof(changes) = 'object'),
  base_updated_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);
create index if not exists mcp_editorial_requests_pending_idx
  on public.mcp_editorial_requests (status, created_at desc);
alter table public.mcp_editorial_requests enable row level security;
revoke all on public.mcp_editorial_requests from public, anon, authenticated;
grant select, insert, update on public.mcp_editorial_requests to service_role;

-- Runs as one transaction: lock the proposal, reject stale versions,
-- atomically apply only allowed text fields and mark the proposal reviewed.
create or replace function public.mcp_review_editorial_request(
  p_id uuid, p_reviewer uuid, p_approve boolean
) returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  p public.mcp_editorial_requests%rowtype;
  rows_changed integer;
  key text;
begin
  -- This RPC is inaccessible to client / authenticated / anonymous roles.
  select * into p from public.mcp_editorial_requests where id = p_id for update;
  if not found or p.status <> 'pending' then raise exception 'Proposal missing or already reviewed'; end if;
  if not exists (select 1 from public.users where id = p_reviewer and role = 'admin') then
    raise exception 'Admin approval required';
  end if;
  if p_approve then
    for key in select jsonb_object_keys(p.changes) loop
      if not (
        (p.collection = 'news_posts' and key = any(array['title','excerpt','content'])) or
        (p.collection = 'artists' and key = any(array['name','bio','spotify_url','instagram_url','website_url'])) or
        (p.collection = 'releases' and key = any(array['title','spotify_url','apple_music_url','youtube_url','bandcamp_url','smartlink_url'])) or
        (p.collection = 'concerts' and key = any(array['event_name','venue_name','venue_city','venue_country','ticket_url']))
      ) then raise exception 'Disallowed field in proposal'; end if;
    end loop;
    case p.collection
      when 'news_posts' then
        update public.news_posts set
          title = coalesce(p.changes->>'title', title),
          excerpt = coalesce(p.changes->>'excerpt', excerpt),
          content = coalesce(p.changes->>'content', content),
          updated_at = now()
        where id = p.target_id and updated_at = p.base_updated_at;
      when 'artists' then
        update public.artists set
          name = coalesce(p.changes->>'name', name),
          bio = coalesce(p.changes->>'bio', bio),
          spotify_url = coalesce(p.changes->>'spotify_url', spotify_url),
          instagram_url = coalesce(p.changes->>'instagram_url', instagram_url),
          website_url = coalesce(p.changes->>'website_url', website_url),
          updated_at = now()
        where id = p.target_id and updated_at = p.base_updated_at;
      when 'releases' then
        update public.releases set
          title = coalesce(p.changes->>'title', title),
          spotify_url = coalesce(p.changes->>'spotify_url', spotify_url),
          apple_music_url = coalesce(p.changes->>'apple_music_url', apple_music_url),
          youtube_url = coalesce(p.changes->>'youtube_url', youtube_url),
          bandcamp_url = coalesce(p.changes->>'bandcamp_url', bandcamp_url),
          smartlink_url = coalesce(p.changes->>'smartlink_url', smartlink_url),
          updated_at = now()
        where id = p.target_id and updated_at = p.base_updated_at;
      when 'concerts' then
        update public.concerts set
          event_name = coalesce(p.changes->>'event_name', event_name),
          venue_name = coalesce(p.changes->>'venue_name', venue_name),
          venue_city = coalesce(p.changes->>'venue_city', venue_city),
          venue_country = coalesce(p.changes->>'venue_country', venue_country),
          ticket_url = coalesce(p.changes->>'ticket_url', ticket_url),
          updated_at = now()
        where id = p.target_id and updated_at = p.base_updated_at;
      else raise exception 'Unsupported collection';
    end case;
    get diagnostics rows_changed = ROW_COUNT;
    if rows_changed <> 1 then raise exception 'Editorial record changed since proposal was created'; end if;
  end if;
  update public.mcp_editorial_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        reviewed_at = now(), reviewed_by = p_reviewer
    where id = p_id;
  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;
revoke all on function public.mcp_review_editorial_request(uuid,uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.mcp_review_editorial_request(uuid,uuid,boolean)
  to service_role;
