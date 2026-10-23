-- Parameter names match brush_images columns. Qualify them so restoring an
-- archived photo can update that same row.

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

revoke all on function public.brush_register_upload(text, text, text, text, text, text, bigint, text) from public;
grant execute on function public.brush_register_upload(text, text, text, text, text, text, bigint, text) to anon, authenticated;
