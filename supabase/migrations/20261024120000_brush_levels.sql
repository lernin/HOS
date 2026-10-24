-- Close-call wins and losses, so a record can show which results were close.

alter table public.brush_images
  add column if not exists close_wins integer not null default 0;

alter table public.brush_images
  add column if not exists close_losses integer not null default 0;

alter table public.brush_images
  drop constraint if exists brush_images_close_wins_check;

alter table public.brush_images
  add constraint brush_images_close_wins_check check (close_wins >= 0);

alter table public.brush_images
  drop constraint if exists brush_images_close_losses_check;

alter table public.brush_images
  add constraint brush_images_close_losses_check check (close_losses >= 0);

update public.brush_images i
set
  close_wins = (
    select count(*)::integer
    from public.brush_matches m
    where m.decision = 'pick' and m.margin = 'close' and m.winner_id = i.id
  ),
  close_losses = (
    select count(*)::integer
    from public.brush_matches m
    where m.decision = 'pick' and m.margin = 'close'
      and m.winner_id is not null
      and i.id in (m.left_id, m.right_id)
      and m.winner_id <> i.id
  );

create or replace function private.brush_tally_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.decision = 'pick' and new.margin = 'close' and new.winner_id is not null then
    update public.brush_images
    set close_wins = close_wins + 1
    where id = new.winner_id;
    update public.brush_images
    set close_losses = close_losses + 1
    where id in (new.left_id, new.right_id)
      and id is distinct from new.winner_id;
  end if;
  return new;
end;
$fn$;

revoke all on function private.brush_tally_close() from public, anon, authenticated;

drop trigger if exists brush_matches_close_tally on public.brush_matches;

create trigger brush_matches_close_tally
  after insert on public.brush_matches
  for each row
  execute function private.brush_tally_close();

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
    'close_wins', image.close_wins,
    'close_losses', image.close_losses,
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
