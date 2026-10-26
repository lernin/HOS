-- Contest champions and the field they were crowned from.
-- Existing ratings, matches, and contest phases are left as they are.

create table if not exists public.brush_champions (
  id uuid primary key default gen_random_uuid(),
  category text not null references public.brush_categories (id),
  image_id uuid not null references public.brush_images (id) on delete cascade,
  crowned_at timestamptz not null default pg_catalog.now()
);

create index if not exists brush_champions_category_crowned_idx
  on public.brush_champions (category, crowned_at desc);

alter table public.brush_champions enable row level security;
revoke all on table public.brush_champions from public, anon, authenticated;

alter table public.brush_contest
  add column if not exists field jsonb not null default '[]'::jsonb;

alter table public.brush_contest
  add column if not exists archive jsonb not null default '[]'::jsonb;

create or replace function public.brush_contest_get(lab_pin text, brush_pin text, category text default 'overall')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_row public.brush_contest%rowtype;
  v_recent jsonb;
  v_category text;
  v_champions jsonb;
begin
  perform private.brush_require(lab_pin, brush_pin);
  v_category := coalesce(nullif(brush_contest_get.category, ''), 'overall');
  select * into v_row from public.brush_contest where brush_contest.category = v_category;
  select coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(recent_matches.left_id, recent_matches.right_id)
      order by recent_matches.created_at
    )
    from (
      select left_id, right_id, created_at
      from public.brush_matches
      where brush_matches.category = v_category
      order by created_at desc
      limit 800
    ) recent_matches
  ), '[]'::jsonb) into v_recent;
  select coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', champions.id,
        'category', champions.category,
        'image_id', champions.image_id,
        'crowned_at', champions.crowned_at
      )
      order by champions.crowned_at desc
    )
    from public.brush_champions champions
    where champions.category = v_category
  ), '[]'::jsonb) into v_champions;
  return pg_catalog.jsonb_build_object(
    'phase', coalesce(v_row.phase, 'qualifying'),
    'rounds', coalesce(v_row.rounds, '[]'::jsonb),
    'champion_id', v_row.champion_id,
    'field', coalesce(v_row.field, '[]'::jsonb),
    'champions', v_champions,
    'recent', v_recent
  );
end;
$fn$;

create or replace function public.brush_contest_note(
  lab_pin text,
  brush_pin text,
  category text,
  note text,
  image_id uuid default null,
  field jsonb default '[]'::jsonb,
  rounds jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_category text;
  v_note text;
  v_existing public.brush_champions%rowtype;
  v_id uuid;
  v_crowned timestamptz;
begin
  perform private.brush_require(lab_pin, brush_pin);
  v_category := coalesce(nullif(brush_contest_note.category, ''), 'overall');
  v_note := brush_contest_note.note;
  if not exists (select 1 from public.brush_categories where id = v_category) then
    raise exception 'Unknown category' using errcode = '22023';
  end if;

  if v_note = 'crown' then
    if brush_contest_note.image_id is null then
      raise exception 'Champion not found' using errcode = 'P0002';
    end if;
    if not exists (select 1 from public.brush_images where id = brush_contest_note.image_id) then
      raise exception 'Champion not found' using errcode = 'P0002';
    end if;
    select * into v_existing
    from public.brush_champions champions
    where champions.category = v_category
      and champions.image_id = brush_contest_note.image_id
    order by champions.crowned_at desc
    limit 1;
    if v_existing.id is not null and v_existing.crowned_at > pg_catalog.now() - interval '2 minutes' then
      v_id := v_existing.id;
      v_crowned := v_existing.crowned_at;
    else
      insert into public.brush_champions (category, image_id)
      values (v_category, brush_contest_note.image_id)
      returning id, crowned_at into v_id, v_crowned;
    end if;
    update public.brush_contest
    set field = coalesce(brush_contest_note.field, '[]'::jsonb),
        updated_at = pg_catalog.now()
    where brush_contest.category = v_category;
    return pg_catalog.jsonb_build_object(
      'id', v_id,
      'category', v_category,
      'image_id', brush_contest_note.image_id,
      'crowned_at', v_crowned
    );
  end if;

  if v_note = 'uncrown' then
    delete from public.brush_champions champions
    where champions.id = (
      select latest.id
      from public.brush_champions latest
      where latest.category = v_category
        and latest.image_id = brush_contest_note.image_id
      order by latest.crowned_at desc
      limit 1
    );
    return pg_catalog.jsonb_build_object('category', v_category);
  end if;

  if v_note = 'park' then
    update public.brush_contest
    set archive = (
      select coalesce(pg_catalog.jsonb_agg(kept.item order by kept.ord), '[]'::jsonb)
      from (
        select item, ord
        from pg_catalog.jsonb_array_elements(
          coalesce(brush_contest.archive, '[]'::jsonb) || pg_catalog.jsonb_build_array(coalesce(brush_contest_note.rounds, '[]'::jsonb))
        ) with ordinality as listed(item, ord)
        order by ord desc
        limit 8
      ) kept
    ),
    updated_at = pg_catalog.now()
    where brush_contest.category = v_category;
    return pg_catalog.jsonb_build_object('category', v_category);
  end if;

  raise exception 'Unknown contest note' using errcode = '22023';
end;
$fn$;

revoke all on function public.brush_contest_note(text, text, text, text, uuid, jsonb, jsonb) from public;
grant execute on function public.brush_contest_note(text, text, text, text, uuid, jsonb, jsonb) to anon, authenticated;
