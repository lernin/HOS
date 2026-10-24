-- Quick picks: a clear choice keeps the full Elo step, a close call uses one third.
-- Qualifying avoids pairing the same model, series, folder, or near-duplicate preview.

alter table public.brush_images
  add column if not exists perceptual_hash text;

alter table public.brush_images
  drop constraint if exists brush_images_perceptual_hash_check;

alter table public.brush_images
  add constraint brush_images_perceptual_hash_check
  check (perceptual_hash is null or perceptual_hash ~ '^[0-9a-f]{16}$');

alter table public.brush_matches
  add column if not exists margin text not null default 'clear';

alter table public.brush_matches
  drop constraint if exists brush_matches_margin_check;

alter table public.brush_matches
  add constraint brush_matches_margin_check check (margin in ('clear', 'close'));

create table if not exists public.brush_contest (
  id integer primary key default 1,
  phase text not null default 'qualifying',
  rounds jsonb not null default '[]'::jsonb,
  champion_id uuid references public.brush_images (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint brush_contest_singleton check (id = 1),
  constraint brush_contest_phase check (phase in ('qualifying', 'finals', 'champion'))
);

insert into public.brush_contest (id) values (1) on conflict (id) do nothing;

alter table public.brush_contest enable row level security;
revoke all on table public.brush_contest from public, anon, authenticated;

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
    'perceptual_hash', image.perceptual_hash
  );
$fn$;

revoke all on function private.brush_image_json(public.brush_images) from public, anon, authenticated;

create or replace function private.brush_group_keys(image_name text, folder_path text, series text)
returns text[]
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  stem text;
  stripped text;
  parts text[];
  folder_parts text[];
  keys text[] := array[]::text[];
begin
  stem := lower(regexp_replace(coalesce(image_name, ''), '\.[^.]+$', ''));
  stem := regexp_replace(stem, '^.*/', '');
  stripped := regexp_replace(stem, '[_\s-]+[0-9]+$', '');
  if stripped <> '' then
    keys := keys || array['stem:' || stripped];
    parts := regexp_split_to_array(stripped, '[_\s-]+');
    if coalesce(parts[2], '') <> '' then
      keys := keys || array['family:' || parts[1] || '_' || parts[2]];
    elsif coalesce(parts[1], '') <> '' then
      keys := keys || array['family:' || parts[1]];
    end if;
  end if;
  if position('redo3' in stem) > 0 then
    keys := keys || array['series:redo3'];
  end if;
  if position('pony' in stem) > 0 then
    keys := keys || array['series:pony'];
  end if;
  select coalesce(array_agg(part order by ord), array[]::text[])
  into folder_parts
  from unnest(regexp_split_to_array(lower(coalesce(folder_path, '')), '/')) with ordinality as u(part, ord)
  where part <> '';
  if coalesce(array_length(folder_parts, 1), 0) >= 2 then
    keys := keys || array['folder:' || array_to_string(folder_parts, '/')];
  end if;
  if btrim(coalesce(series, '')) <> '' then
    keys := keys || array['label:' || lower(btrim(series))];
  end if;
  return keys;
end;
$fn$;

revoke all on function private.brush_group_keys(text, text, text) from public, anon, authenticated;

create or replace function private.brush_hash_distance(left_hash text, right_hash text)
returns integer
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  index integer;
  mixed integer;
  bits integer := 0;
  left_nibble integer;
  right_nibble integer;
begin
  if left_hash is null or right_hash is null or left_hash !~ '^[0-9a-f]{16}$' or right_hash !~ '^[0-9a-f]{16}$' then
    return 64;
  end if;
  for index in 1..16 loop
    left_nibble := get_byte(decode(substr(left_hash, index, 1) || '0', 'hex'), 0) / 16;
    right_nibble := get_byte(decode(substr(right_hash, index, 1) || '0', 'hex'), 0) / 16;
    mixed := left_nibble # right_nibble;
    bits := bits + (mixed & 1) + ((mixed >> 1) & 1) + ((mixed >> 2) & 1) + ((mixed >> 3) & 1);
  end loop;
  return bits;
end;
$fn$;

revoke all on function private.brush_hash_distance(text, text) from public, anon, authenticated;

create or replace function private.brush_key_clash(
  left_name text,
  left_folder text,
  left_series text,
  right_name text,
  right_folder text,
  right_series text
) returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select exists (
    select 1
    from unnest(private.brush_group_keys(left_name, left_folder, left_series)) as left_key
    join unnest(private.brush_group_keys(right_name, right_folder, right_series)) as right_key
      on left_key = right_key
  );
$fn$;

revoke all on function private.brush_key_clash(text, text, text, text, text, text) from public, anon, authenticated;

drop function if exists public.brush_record(text, text, uuid, uuid, text, uuid, boolean, boolean, uuid[], integer);
drop function if exists private.brush_rate(double precision, double precision, integer, integer, double precision, double precision, boolean);

create or replace function private.brush_rate(
  elo_a double precision,
  elo_b double precision,
  games_a integer,
  games_b integer,
  sigma_a double precision,
  sigma_b double precision,
  a_won boolean,
  margin text default 'clear'
) returns jsonb
language sql
immutable
set search_path = ''
as $fn$
  with vars as (
    select
      (case when margin = 'close' then 1.0 / 3.0 else 1.0 end)
      * (case when (case when games_a < games_b then games_a else games_b end) < 8 then 48 else 24 end)::double precision as k,
      1.0 / (1.0 + pg_catalog.power(10::double precision, (elo_b - elo_a) / 400.0)) as expected_a
  )
  select pg_catalog.jsonb_build_object(
    'k', vars.k,
    'expected_a', vars.expected_a,
    'elo_a', elo_a + vars.k * ((case when a_won then 1 else 0 end) - vars.expected_a),
    'elo_b', elo_b + vars.k * ((case when a_won then 0 else 1 end) - (1.0 - vars.expected_a)),
    'sigma_a', case when sigma_a * 0.94 < 60 then 60::double precision else sigma_a * 0.94 end,
    'sigma_b', case when sigma_b * 0.94 < 60 then 60::double precision else sigma_b * 0.94 end
  )
  from vars;
$fn$;

revoke all on function private.brush_rate(double precision, double precision, integer, integer, double precision, double precision, boolean, text) from public, anon, authenticated;

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

  if random() < 0.7 then
    select * into v_left
    from public.brush_images
    where archived_at is null and trashed_at is null
      and games = (select min(games) from public.brush_images where archived_at is null and trashed_at is null)
    order by case when id = v_last_left or id = v_last_right then 1 else 0 end, random()
    limit 1;
  else
    select * into v_left
    from public.brush_images
    where archived_at is null and trashed_at is null
    order by case when id = v_last_left or id = v_last_right then 1 else 0 end, random()
    limit 1;
  end if;

  select * into v_right
  from public.brush_images opponent
  where opponent.archived_at is null and opponent.trashed_at is null and opponent.id <> v_left.id
  order by
    (case when private.brush_key_clash(v_left.name, v_left.folder_path, v_left.series, opponent.name, opponent.folder_path, opponent.series) then 2 else 0 end)
    + (case when private.brush_hash_distance(v_left.perceptual_hash, opponent.perceptual_hash) <= 8 then 2 else 0 end)
    + (case when opponent.id = v_last_left or opponent.id = v_last_right then 1 else 0 end)
    + (case when exists (
        select 1 from public.brush_matches prior
        where prior.created_at > pg_catalog.now() - interval '12 hours'
          and (
            (prior.left_id = v_left.id and prior.right_id = opponent.id)
            or (prior.right_id = v_left.id and prior.left_id = opponent.id)
          )
      ) then 1 else 0 end),
    opponent.games,
    random()
  limit 1;

  return pg_catalog.jsonb_build_object(
    'ready', true,
    'active', v_active,
    'total', v_total,
    'left', private.brush_image_json(v_left),
    'right', private.brush_image_json(v_right)
  );
end;
$fn$;

create or replace function public.brush_record(
  lab_pin text,
  brush_pin text,
  left_id uuid,
  right_id uuid,
  decision text,
  winner_id uuid default null,
  trash_left boolean default false,
  trash_right boolean default false,
  tag_ids uuid[] default '{}',
  decided_ms integer default null,
  margin text default 'clear'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_left public.brush_images%rowtype;
  v_right public.brush_images%rowtype;
  v_rated jsonb;
  v_match uuid;
  v_tag uuid;
  v_margin text;
begin
  perform private.brush_require(lab_pin, brush_pin);

  if left_id is null or right_id is null or left_id = right_id then
    raise exception 'Pick two different images' using errcode = '22023';
  end if;
  if decision not in ('pick', 'trash') then
    raise exception 'Unknown decision' using errcode = '22023';
  end if;
  v_margin := case when margin = 'close' then 'close' else 'clear' end;
  if decision = 'pick' and winner_id is distinct from left_id and winner_id is distinct from right_id then
    raise exception 'Choose one of the two images' using errcode = '22023';
  end if;
  if decision = 'trash' and not coalesce(trash_left, false) and not coalesce(trash_right, false) then
    raise exception 'Choose an image to trash' using errcode = '22023';
  end if;

  perform 1
  from public.brush_images
  where id in (left_id, right_id)
  order by id
  for update;

  select * into v_left from public.brush_images where id = left_id;
  select * into v_right from public.brush_images where id = right_id;

  if v_left.id is null or v_right.id is null then
    raise exception 'Image not found' using errcode = 'P0002';
  end if;
  if v_left.archived_at is not null or v_right.archived_at is not null
     or v_left.trashed_at is not null or v_right.trashed_at is not null then
    raise exception 'That pair is no longer in the contest' using errcode = '22023';
  end if;

  if decision = 'pick' then
    v_rated := private.brush_rate(
      v_left.elo, v_right.elo, v_left.games, v_right.games, v_left.sigma, v_right.sigma, winner_id = left_id, v_margin
    );
    update public.brush_images
    set elo = (v_rated->>'elo_a')::double precision,
        sigma = (v_rated->>'sigma_a')::double precision,
        games = games + 1,
        wins = wins + case when id = winner_id then 1 else 0 end,
        losses = losses + case when id = winner_id then 0 else 1 end,
        updated_at = pg_catalog.now()
    where id = left_id;
    update public.brush_images
    set elo = (v_rated->>'elo_b')::double precision,
        sigma = (v_rated->>'sigma_b')::double precision,
        games = games + 1,
        wins = wins + case when id = winner_id then 1 else 0 end,
        losses = losses + case when id = winner_id then 0 else 1 end,
        updated_at = pg_catalog.now()
    where id = right_id;
  else
    if coalesce(trash_left, false) then
      update public.brush_images
      set trashed_at = pg_catalog.now(), trash_count = trash_count + 1, updated_at = pg_catalog.now()
      where id = left_id;
    end if;
    if coalesce(trash_right, false) then
      update public.brush_images
      set trashed_at = pg_catalog.now(), trash_count = trash_count + 1, updated_at = pg_catalog.now()
      where id = right_id;
    end if;
  end if;

  insert into public.brush_matches (left_id, right_id, winner_id, decision, left_trashed, right_trashed, decided_ms, margin)
  values (
    left_id,
    right_id,
    case when decision = 'pick' then winner_id else null end,
    decision,
    decision = 'trash' and coalesce(trash_left, false),
    decision = 'trash' and coalesce(trash_right, false),
    decided_ms,
    case when decision = 'pick' then v_margin else 'clear' end
  )
  returning id into v_match;

  if tag_ids is not null then
    foreach v_tag in array tag_ids loop
      if decision = 'pick' then
        insert into public.brush_match_tags (match_id, tag_id, image_id, polarity)
        select v_match, t.id, winner_id, 'like'
        from public.brush_tags t
        where t.id = v_tag and t.status = 'live'
        on conflict do nothing;
        insert into public.brush_image_tags (image_id, tag_id, polarity, origin)
        select winner_id, t.id, 'like', 'match'
        from public.brush_tags t
        where t.id = v_tag and t.status = 'live'
        on conflict do nothing;
      else
        if coalesce(trash_left, false) then
          insert into public.brush_match_tags (match_id, tag_id, image_id, polarity)
          select v_match, t.id, left_id, 'bad'
          from public.brush_tags t
          where t.id = v_tag and t.status = 'live'
          on conflict do nothing;
          insert into public.brush_image_tags (image_id, tag_id, polarity, origin)
          select left_id, t.id, 'bad', 'match'
          from public.brush_tags t
          where t.id = v_tag and t.status = 'live'
          on conflict do nothing;
        end if;
        if coalesce(trash_right, false) then
          insert into public.brush_match_tags (match_id, tag_id, image_id, polarity)
          select v_match, t.id, right_id, 'bad'
          from public.brush_tags t
          where t.id = v_tag and t.status = 'live'
          on conflict do nothing;
          insert into public.brush_image_tags (image_id, tag_id, polarity, origin)
          select right_id, t.id, 'bad', 'match'
          from public.brush_tags t
          where t.id = v_tag and t.status = 'live'
          on conflict do nothing;
        end if;
      end if;
    end loop;
  end if;

  return pg_catalog.jsonb_build_object('match_id', v_match, 'rated', v_rated);
end;
$fn$;

create or replace function public.brush_annotate(
  lab_pin text,
  brush_pin text,
  match_id uuid,
  tag_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_match public.brush_matches%rowtype;
  v_tag uuid;
begin
  perform private.brush_require(lab_pin, brush_pin);
  select * into v_match from public.brush_matches where id = match_id;
  if v_match.id is null then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if tag_ids is null then
    return pg_catalog.jsonb_build_object('match_id', match_id, 'tagged', 0);
  end if;
  foreach v_tag in array tag_ids loop
    if v_match.decision = 'pick' then
      insert into public.brush_match_tags (match_id, tag_id, image_id, polarity)
      select v_match.id, t.id, v_match.winner_id, 'like'
      from public.brush_tags t
      where t.id = v_tag and t.status = 'live'
      on conflict do nothing;
      insert into public.brush_image_tags (image_id, tag_id, polarity, origin)
      select v_match.winner_id, t.id, 'like', 'match'
      from public.brush_tags t
      where t.id = v_tag and t.status = 'live'
      on conflict do nothing;
    else
      if v_match.left_trashed then
        insert into public.brush_match_tags (match_id, tag_id, image_id, polarity)
        select v_match.id, t.id, v_match.left_id, 'bad'
        from public.brush_tags t
        where t.id = v_tag and t.status = 'live'
        on conflict do nothing;
        insert into public.brush_image_tags (image_id, tag_id, polarity, origin)
        select v_match.left_id, t.id, 'bad', 'match'
        from public.brush_tags t
        where t.id = v_tag and t.status = 'live'
        on conflict do nothing;
      end if;
      if v_match.right_trashed then
        insert into public.brush_match_tags (match_id, tag_id, image_id, polarity)
        select v_match.id, t.id, v_match.right_id, 'bad'
        from public.brush_tags t
        where t.id = v_tag and t.status = 'live'
        on conflict do nothing;
        insert into public.brush_image_tags (image_id, tag_id, polarity, origin)
        select v_match.right_id, t.id, 'bad', 'match'
        from public.brush_tags t
        where t.id = v_tag and t.status = 'live'
        on conflict do nothing;
      end if;
    end if;
  end loop;
  return pg_catalog.jsonb_build_object('match_id', match_id);
end;
$fn$;

create or replace function public.brush_set_phash(
  lab_pin text,
  brush_pin text,
  image_id uuid,
  perceptual_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform private.brush_require(lab_pin, brush_pin);
  if perceptual_hash !~ '^[0-9a-f]{16}$' then
    raise exception 'Preview hash is not valid' using errcode = '22023';
  end if;
  update public.brush_images
  set perceptual_hash = brush_set_phash.perceptual_hash,
      updated_at = pg_catalog.now()
  where id = image_id and archived_at is null;
  if not found then
    raise exception 'Image not found' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object('id', image_id);
end;
$fn$;

create or replace function public.brush_contest_get(lab_pin text, brush_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_row public.brush_contest%rowtype;
begin
  perform private.brush_require(lab_pin, brush_pin);
  select * into v_row from public.brush_contest where id = 1;
  return pg_catalog.jsonb_build_object(
    'phase', coalesce(v_row.phase, 'qualifying'),
    'rounds', coalesce(v_row.rounds, '[]'::jsonb),
    'champion_id', v_row.champion_id
  );
end;
$fn$;

create or replace function public.brush_contest_put(
  lab_pin text,
  brush_pin text,
  phase text,
  rounds jsonb,
  champion_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform private.brush_require(lab_pin, brush_pin);
  if phase not in ('qualifying', 'finals', 'champion') then
    raise exception 'Unknown contest phase' using errcode = '22023';
  end if;
  if champion_id is not null and not exists (select 1 from public.brush_images where id = champion_id) then
    raise exception 'Champion not found' using errcode = 'P0002';
  end if;
  update public.brush_contest
  set phase = brush_contest_put.phase,
      rounds = coalesce(brush_contest_put.rounds, '[]'::jsonb),
      champion_id = brush_contest_put.champion_id,
      updated_at = pg_catalog.now()
  where id = 1;
  return public.brush_contest_get(lab_pin, brush_pin);
end;
$fn$;

revoke all on function public.brush_record(text, text, uuid, uuid, text, uuid, boolean, boolean, uuid[], integer, text) from public;
revoke all on function public.brush_annotate(text, text, uuid, uuid[]) from public;
revoke all on function public.brush_set_phash(text, text, uuid, text) from public;
revoke all on function public.brush_contest_get(text, text) from public;
revoke all on function public.brush_contest_put(text, text, text, jsonb, uuid) from public;

grant execute on function public.brush_record(text, text, uuid, uuid, text, uuid, boolean, boolean, uuid[], integer, text) to anon, authenticated;
grant execute on function public.brush_annotate(text, text, uuid, uuid[]) to anon, authenticated;
grant execute on function public.brush_set_phash(text, text, uuid, text) to anon, authenticated;
grant execute on function public.brush_contest_get(text, text) to anon, authenticated;
grant execute on function public.brush_contest_put(text, text, text, jsonb, uuid) to anon, authenticated;
