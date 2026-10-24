-- A portrait that cannot be shown is skipped. Ratings, games, and faces stay.

alter table public.brush_images
  add column if not exists unreadable_at timestamptz;

comment on column public.brush_images.unreadable_at is
  'Set when the matchup could not load this portrait. Pairing skips it. Ratings are unchanged.';

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
    'volatility', image.volatility,
    'games', image.games,
    'wins', image.wins,
    'losses', image.losses,
    'close_wins', image.close_wins,
    'close_losses', image.close_losses,
    'trash_count', image.trash_count,
    'trashed', image.trashed_at is not null,
    'archived', image.archived_at is not null,
    'unreadable', image.unreadable_at is not null,
    'has_thumbnail', image.thumbnail_path is not null,
    'perceptual_hash', image.perceptual_hash,
    'face_box', image.face_box,
    'face_scanned', image.face_scanned
  );
$fn$;

revoke all on function private.brush_image_json(public.brush_images) from public, anon, authenticated;

create or replace function public.brush_flag_unreadable(lab_pin text, brush_pin text, image_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform private.brush_require(lab_pin, brush_pin);
  update public.brush_images
  set unreadable_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = image_id
    and archived_at is null;
  if not found then
    raise exception 'Image not found' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object('id', image_id);
end;
$fn$;

revoke all on function public.brush_flag_unreadable(text, text, uuid) from public;
grant execute on function public.brush_flag_unreadable(text, text, uuid) to anon, authenticated;
