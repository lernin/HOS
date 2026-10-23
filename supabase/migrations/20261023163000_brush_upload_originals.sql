-- Phone uploads keep the full original in Drive and a small preview in Storage.
-- content_hash stops the same picture being added twice. New rows start at 0 games,
-- and pairing orders by games then newest, so an upload is in the contest on the next pair.

alter table public.brush_images
  add column if not exists content_hash text,
  add column if not exists thumbnail_path text,
  add column if not exists byte_size bigint;

alter table public.brush_images
  drop constraint if exists brush_images_byte_size_check;

alter table public.brush_images
  add constraint brush_images_byte_size_check check (byte_size is null or byte_size >= 0);

create unique index if not exists brush_images_content_hash_idx
  on public.brush_images (content_hash)
  where content_hash is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brush-thumbs', 'brush-thumbs', false, 2097152, array['image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.brush_image_json(image public.brush_images)
returns jsonb
language sql
immutable
set search_path = ''
as $fn$
  select pg_catalog.jsonb_build_object(
    'id', image.id,
    'drive_file_id', image.drive_file_id,
    'name', image.name,
    'country', image.country,
    'folder_path', image.folder_path,
    'series', image.series,
    'mime_type', image.mime_type,
    'source', image.source,
    'prompt_text', image.prompt_text,
    'prompt_source', image.prompt_source,
    'elo', image.elo,
    'sigma', image.sigma,
    'games', image.games,
    'wins', image.wins,
    'losses', image.losses,
    'trash_count', image.trash_count,
    'trashed', image.trashed_at is not null,
    'archived', image.archived_at is not null,
    'has_thumbnail', image.thumbnail_path is not null
  );
$fn$;

revoke all on function private.brush_image_json(public.brush_images) from public, anon, authenticated;

create or replace function public.brush_next_pair(lab_pin text, brush_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_active integer;
  v_total integer;
  v_left public.brush_images%rowtype;
  v_right public.brush_images%rowtype;
  v_last_left uuid;
  v_last_right uuid;
  v_forbid uuid;
begin
  perform private.brush_require(lab_pin, brush_pin);

  select count(*) into v_total from public.brush_images where archived_at is null;
  select count(*) into v_active from public.brush_images where archived_at is null and trashed_at is null;
  if v_active < 2 then
    return pg_catalog.jsonb_build_object('ready', false, 'reason', 'need_images', 'active', v_active, 'total', v_total);
  end if;

  select m.left_id, m.right_id into v_last_left, v_last_right
  from public.brush_matches m
  order by m.created_at desc
  limit 1;

  -- Fewest games first, then the newest of those, so a fresh upload is paired next.
  select * into v_left
  from public.brush_images
  where archived_at is null and trashed_at is null
  order by games asc, created_at desc, sigma desc, random()
  limit 1;

  v_forbid := case
    when v_left.id = v_last_left then v_last_right
    when v_left.id = v_last_right then v_last_left
    else null
  end;

  if random() < 0.1 then
    select * into v_right
    from public.brush_images
    where archived_at is null and trashed_at is null and id <> v_left.id
    order by case when id = v_forbid then 1 else 0 end, games asc, random()
    limit 1;
  else
    select * into v_right
    from public.brush_images
    where archived_at is null and trashed_at is null and id <> v_left.id
    order by case when id = v_forbid then 1 else 0 end, games asc, abs(elo - v_left.elo), random()
    limit 1;
  end if;

  return pg_catalog.jsonb_build_object(
    'ready', true,
    'active', v_active,
    'total', v_total,
    'left', private.brush_image_json(v_left),
    'right', private.brush_image_json(v_right)
  );
end;
$fn$;

create or replace function public.brush_upload_claim(lab_pin text, brush_pin text, content_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_hash text;
  v_row public.brush_images%rowtype;
begin
  perform private.brush_require(lab_pin, brush_pin);
  v_hash := lower(btrim(coalesce(content_hash, '')));
  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Photo hash is not valid' using errcode = '22023';
  end if;

  select * into v_row from public.brush_images where brush_images.content_hash = v_hash;
  if v_row.id is not null and v_row.archived_at is null then
    return pg_catalog.jsonb_build_object('duplicate', true, 'id', v_row.id, 'name', v_row.name, 'trashed', v_row.trashed_at is not null);
  end if;
  return pg_catalog.jsonb_build_object('duplicate', false);
end;
$fn$;

create or replace function public.brush_register_upload(
  lab_pin text,
  brush_pin text,
  drive_file_id text,
  name text,
  content_hash text,
  mime_type text,
  byte_size bigint,
  thumbnail_path text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_hash text;
  v_drive text;
  v_name text;
  v_row public.brush_images%rowtype;
begin
  perform private.brush_require(lab_pin, brush_pin);
  v_hash := lower(btrim(coalesce(brush_register_upload.content_hash, '')));
  v_drive := btrim(coalesce(brush_register_upload.drive_file_id, ''));
  v_name := left(btrim(coalesce(brush_register_upload.name, '')), 300);
  if v_hash !~ '^[0-9a-f]{64}$' or v_drive = '' or v_name = '' then
    raise exception 'Upload is missing the file, the name, or the hash' using errcode = '22023';
  end if;
  if v_drive !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'Unexpected Drive id' using errcode = '22023';
  end if;
  if brush_register_upload.byte_size is null or brush_register_upload.byte_size < 1 then
    raise exception 'Upload is empty' using errcode = '22023';
  end if;

  select * into v_row from public.brush_images where brush_images.content_hash = v_hash;
  if v_row.id is not null and v_row.archived_at is null and v_row.drive_file_id is distinct from v_drive then
    return pg_catalog.jsonb_build_object('duplicate', true, 'id', v_row.id, 'name', v_row.name);
  end if;

  if v_row.id is not null then
    update public.brush_images
    set drive_file_id = v_drive,
        name = v_name,
        mime_type = left(coalesce(nullif(brush_register_upload.mime_type, ''), 'image/jpeg'), 80),
        byte_size = brush_register_upload.byte_size,
        thumbnail_path = coalesce(nullif(brush_register_upload.thumbnail_path, ''), public.brush_images.thumbnail_path),
        archived_at = null,
        source = 'upload',
        country = 'Uploads',
        folder_path = 'Brush Uploads',
        synced_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where id = v_row.id;
    return pg_catalog.jsonb_build_object('duplicate', false, 'id', v_row.id, 'restored', v_row.archived_at is not null);
  end if;

  insert into public.brush_images (
    drive_file_id, name, folder_path, country, mime_type, source, content_hash, thumbnail_path, byte_size, synced_at
  ) values (
    v_drive,
    v_name,
    'Brush Uploads',
    'Uploads',
    left(coalesce(nullif(brush_register_upload.mime_type, ''), 'image/jpeg'), 80),
    'upload',
    v_hash,
    nullif(brush_register_upload.thumbnail_path, ''),
    brush_register_upload.byte_size,
    pg_catalog.now()
  )
  returning * into v_row;

  return pg_catalog.jsonb_build_object('duplicate', false, 'id', v_row.id, 'restored', false);
exception
  when unique_violation then
    return pg_catalog.jsonb_build_object('duplicate', true);
end;
$fn$;

create or replace function public.brush_thumbnail_path(lab_pin text, brush_pin text, image_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_path text;
begin
  perform private.brush_require(lab_pin, brush_pin);
  select thumbnail_path into v_path from public.brush_images where id = image_id and archived_at is null;
  if v_path is null then
    raise exception 'No cached preview for that image' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object('path', v_path);
end;
$fn$;

-- Sync must not create a second row when Drive still has a spare copy of a hashed photo.
create or replace function public.brush_upsert_images(
  lab_pin text,
  brush_pin text,
  images jsonb,
  run_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  item jsonb;
  attr jsonb;
  v_drive text;
  v_name text;
  v_hash text;
  v_owner text;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_existed boolean;
begin
  perform private.brush_require(lab_pin, brush_pin);
  if run_id is not null and not exists (select 1 from public.brush_sync_runs r where r.id = run_id and r.finished_at is null) then
    raise exception 'Sync run is not open' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(images) <> 'array' then
    raise exception 'Images must be a list' using errcode = '22023';
  end if;

  for item in select value from pg_catalog.jsonb_array_elements(images) loop
    v_drive := btrim(coalesce(item->>'drive_file_id', ''));
    v_name := left(btrim(coalesce(item->>'name', '')), 300);
    v_hash := nullif(lower(btrim(coalesce(item->>'content_hash', ''))), '');
    if v_drive = '' or v_name = '' then
      continue;
    end if;
    if coalesce(item->>'source', 'drive') not in ('drive', 'upload') then
      continue;
    end if;
    if v_hash is not null and v_hash !~ '^[0-9a-f]{64}$' then
      v_hash := null;
    end if;

    if v_hash is not null then
      select i.drive_file_id into v_owner from public.brush_images i where i.content_hash = v_hash;
      if v_owner is not null and v_owner is distinct from v_drive then
        continue;
      end if;
    end if;

    v_existed := exists (select 1 from public.brush_images i where i.drive_file_id = v_drive);
    insert into public.brush_images (
      drive_file_id, name, folder_path, country, series, mime_type, source, prompt_text, prompt_source, content_hash, synced_at
    ) values (
      v_drive,
      v_name,
      left(coalesce(item->>'folder_path', ''), 500),
      left(coalesce(item->>'country', ''), 120),
      nullif(left(coalesce(item->>'series', ''), 120), ''),
      left(coalesce(nullif(item->>'mime_type', ''), 'image/jpeg'), 80),
      coalesce(item->>'source', 'drive'),
      nullif(item->>'prompt_text', ''),
      nullif(item->>'prompt_source', ''),
      v_hash,
      pg_catalog.now()
    )
    on conflict (drive_file_id) do update set
      name = excluded.name,
      folder_path = excluded.folder_path,
      country = excluded.country,
      series = coalesce(excluded.series, public.brush_images.series),
      mime_type = excluded.mime_type,
      content_hash = coalesce(public.brush_images.content_hash, excluded.content_hash),
      archived_at = null,
      synced_at = pg_catalog.now(),
      prompt_text = coalesce(public.brush_images.prompt_text, excluded.prompt_text),
      prompt_source = case
        when public.brush_images.prompt_text is null then excluded.prompt_source
        else public.brush_images.prompt_source
      end,
      updated_at = pg_catalog.now();

    if v_existed then v_updated := v_updated + 1; else v_inserted := v_inserted + 1; end if;

    if run_id is not null then
      insert into public.brush_sync_seen (run_id, drive_file_id) values (run_id, v_drive)
      on conflict do nothing;
    end if;

    if pg_catalog.jsonb_typeof(item->'attributes') = 'array' then
      for attr in select value from pg_catalog.jsonb_array_elements(item->'attributes') loop
        if btrim(coalesce(attr->>'trait', '')) = '' or btrim(coalesce(attr->>'value', '')) = '' then
          continue;
        end if;
        insert into public.brush_attributes (image_id, trait, value, source)
        select i.id, left(btrim(attr->>'trait'), 80), left(btrim(attr->>'value'), 160), 'filename'
        from public.brush_images i
        where i.drive_file_id = v_drive
        on conflict (image_id, trait, source) do nothing;
      end loop;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
end;
$fn$;

revoke all on function public.brush_upload_claim(text, text, text) from public;
revoke all on function public.brush_register_upload(text, text, text, text, text, text, bigint, text) from public;
revoke all on function public.brush_thumbnail_path(text, text, uuid) from public;

grant execute on function public.brush_upload_claim(text, text, text) to anon, authenticated;
grant execute on function public.brush_register_upload(text, text, text, text, text, text, bigint, text) to anon, authenticated;
grant execute on function public.brush_thumbnail_path(text, text, uuid) to anon, authenticated;
