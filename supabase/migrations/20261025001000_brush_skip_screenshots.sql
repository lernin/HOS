-- Screenshots stay out of Brush. Sync does not insert them or clear an archive.

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
    if v_name like 'Screenshot\_%' escape '\' then
      if run_id is not null and exists (
        select 1 from public.brush_images i
        where i.drive_file_id = v_drive and i.archived_at is null
      ) then
        insert into public.brush_sync_seen (run_id, drive_file_id) values (run_id, v_drive)
        on conflict do nothing;
      end if;
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

create or replace function public.brush_sync_finish(lab_pin text, brush_pin text, run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_seen integer;
  v_archived integer;
begin
  perform private.brush_require(lab_pin, brush_pin);
  if not exists (select 1 from public.brush_sync_runs r where r.id = run_id and r.finished_at is null) then
    raise exception 'Sync run is not open' using errcode = '22023';
  end if;

  select count(*) into v_seen from public.brush_sync_seen s where s.run_id = brush_sync_finish.run_id;

  update public.brush_images i
  set archived_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where i.archived_at is null
    and i.name not like 'Screenshot\_%' escape '\'
    and i.created_at < (select r.created_at from public.brush_sync_runs r where r.id = brush_sync_finish.run_id)
    and not exists (
      select 1 from public.brush_sync_seen s
      where s.run_id = brush_sync_finish.run_id and s.drive_file_id = i.drive_file_id
    );
  get diagnostics v_archived = row_count;

  update public.brush_sync_runs set finished_at = pg_catalog.now() where id = brush_sync_finish.run_id;
  return pg_catalog.jsonb_build_object('seen', v_seen, 'archived', v_archived);
end;
$fn$;
