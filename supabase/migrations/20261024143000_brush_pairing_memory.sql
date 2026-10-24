-- Remember the last 10 matchups so a new visit can avoid repeating them.

create or replace function public.brush_contest_get(lab_pin text, brush_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_row public.brush_contest%rowtype;
  v_recent jsonb;
begin
  perform private.brush_require(lab_pin, brush_pin);
  select * into v_row from public.brush_contest where id = 1;
  select coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(recent_matches.left_id, recent_matches.right_id)
      order by recent_matches.created_at
    )
    from (
      select left_id, right_id, created_at
      from public.brush_matches
      order by created_at desc
      limit 10
    ) recent_matches
  ), '[]'::jsonb) into v_recent;
  return pg_catalog.jsonb_build_object(
    'phase', coalesce(v_row.phase, 'qualifying'),
    'rounds', coalesce(v_row.rounds, '[]'::jsonb),
    'champion_id', v_row.champion_id,
    'recent', v_recent
  );
end;
$fn$;

revoke all on function public.brush_contest_get(text, text) from public;
grant execute on function public.brush_contest_get(text, text) to anon, authenticated;
