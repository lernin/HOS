-- Faces still waiting for a box, so sync and upload can fill them at ingest.

create or replace function public.brush_face_queue(
  lab_pin text,
  brush_pin text,
  drive_ids text[] default null,
  batch_limit integer default 8
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_limit integer;
begin
  perform private.brush_require(lab_pin, brush_pin);
  v_limit := least(greatest(coalesce(batch_limit, 8), 1), 24);
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', queued.id,
      'drive_file_id', queued.drive_file_id
    ))
    from (
      select i.id, i.drive_file_id
      from public.brush_images i
      where i.archived_at is null
        and i.face_scanned = false
        and i.drive_file_id is not null
        and (drive_ids is null or i.drive_file_id = any(drive_ids))
      order by i.created_at
      limit v_limit
    ) queued
  ), '[]'::jsonb);
end;
$fn$;

revoke all on function public.brush_face_queue(text, text, text[], integer) from public;
grant execute on function public.brush_face_queue(text, text, text[], integer) to anon, authenticated;
