-- Face boxes: one normalized box per picture, saved once and reused for hold-to-zoom.

alter table public.brush_images
  add column if not exists face_box jsonb;

alter table public.brush_images
  add column if not exists face_scanned boolean not null default false;

create or replace function private.brush_face_box_ok(box jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  x numeric;
  y numeric;
  w numeric;
  h numeric;
begin
  if box is null or pg_catalog.jsonb_typeof(box) = 'null' then
    return true;
  end if;
  if pg_catalog.jsonb_typeof(box) <> 'object' then
    return false;
  end if;
  if pg_catalog.jsonb_typeof(box -> 'x') <> 'number'
     or pg_catalog.jsonb_typeof(box -> 'y') <> 'number'
     or pg_catalog.jsonb_typeof(box -> 'w') <> 'number'
     or pg_catalog.jsonb_typeof(box -> 'h') <> 'number' then
    return false;
  end if;
  x := (box ->> 'x')::numeric;
  y := (box ->> 'y')::numeric;
  w := (box ->> 'w')::numeric;
  h := (box ->> 'h')::numeric;
  return x >= 0 and y >= 0 and w > 0 and h > 0
    and x <= 1 and y <= 1 and w <= 1 and h <= 1
    and x + w <= 1.001 and y + h <= 1.001;
exception
  when others then
    return false;
end;
$fn$;

revoke all on function private.brush_face_box_ok(jsonb) from public, anon, authenticated;

alter table public.brush_images
  drop constraint if exists brush_images_face_box_check;

alter table public.brush_images
  add constraint brush_images_face_box_check
  check (private.brush_face_box_ok(face_box));

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
    'has_thumbnail', image.thumbnail_path is not null,
    'perceptual_hash', image.perceptual_hash,
    'face_box', image.face_box,
    'face_scanned', image.face_scanned
  );
$fn$;

revoke all on function private.brush_image_json(public.brush_images) from public, anon, authenticated;

create or replace function public.brush_set_face_box(
  lab_pin text,
  brush_pin text,
  image_id uuid,
  face_box jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform private.brush_require(lab_pin, brush_pin);
  if pg_catalog.jsonb_typeof(face_box) = 'null' then
    face_box := null;
  end if;
  if not private.brush_face_box_ok(face_box) then
    raise exception 'Face box is not valid' using errcode = '22023';
  end if;
  update public.brush_images
  set face_box = brush_set_face_box.face_box,
      face_scanned = true,
      updated_at = pg_catalog.now()
  where id = image_id and archived_at is null;
  if not found then
    raise exception 'Image not found' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object('id', image_id);
end;
$fn$;

revoke all on function public.brush_set_face_box(text, text, uuid, jsonb) from public;
grant execute on function public.brush_set_face_box(text, text, uuid, jsonb) to anon, authenticated;
