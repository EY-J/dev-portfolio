-- Correct the draft media UUID matcher in the already-applied CMS media migration.
-- Review and apply manually; this migration is not applied automatically.
begin;

create or replace function private.published_media_url(value text, check_storage boolean)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  media_path text;
begin
  if value is null or value not like '/api/cms/media/%' then return value; end if;
  media_path := substring(value from
    '^/api/cms/media/((profile|projects|blog)/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp)$');
  if media_path is null then
    if check_storage then
      raise exception 'Invalid draft media reference.' using errcode = '22023';
    end if;
    return value;
  end if;
  if check_storage and not exists (
    select 1 from storage.objects
    where bucket_id = 'portfolio-public' and name = media_path
  ) then
    raise exception 'Draft media has not been promoted.' using errcode = '22023';
  end if;
  return '/api/media/' || media_path;
end;
$$;

commit;
