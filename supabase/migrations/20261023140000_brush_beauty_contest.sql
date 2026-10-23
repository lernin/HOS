-- Brush: head-to-head portrait contest.
-- Reads and writes go through PIN-checked functions, same pattern as the other Lab RPCs.
-- The Lab PIN is checked with private.check_lab_reader_pin.
-- The Brush PIN is not in source. It is a bcrypt hash in brush_access, set with brush_set_pin.

create table public.brush_access (
  id integer primary key default 1 check (id = 1),
  pin_hash text,
  updated_at timestamptz not null default now()
);

insert into public.brush_access (id) values (1);

comment on table public.brush_access is
  'Single-row Brush PIN. pin_hash is bcrypt from extensions.crypt. Null until Ashley sets it.';

create table public.brush_images (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text not null unique,
  name text not null,
  folder_path text not null default '',
  country text not null default '',
  series text,
  mime_type text not null default 'image/jpeg',
  source text not null default 'drive' check (source in ('drive', 'upload')),
  prompt_text text,
  prompt_source text check (prompt_source in ('filename', 'sidecar', 'manual', 'none') or prompt_source is null),
  elo double precision not null default 1500,
  sigma double precision not null default 350,
  games integer not null default 0 check (games >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  trash_count integer not null default 0 check (trash_count >= 0),
  trashed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz
);

create index brush_images_active_idx
  on public.brush_images (games, elo)
  where archived_at is null and trashed_at is null;

create table public.brush_attributes (
  id uuid primary key default gen_random_uuid(),
  image_id uuid not null references public.brush_images (id) on delete cascade,
  trait text not null,
  value text not null,
  source text not null check (source in ('filename', 'prompt', 'vision', 'manual')),
  confidence double precision,
  created_at timestamptz not null default now(),
  unique (image_id, trait, source)
);

create table public.brush_tags (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  label text not null,
  status text not null default 'live' check (status in ('live', 'suggested', 'rejected')),
  source text not null default 'seed' check (source in ('seed', 'ai', 'admin', 'scout')),
  sort integer not null default 1000,
  created_at timestamptz not null default now(),
  unique (category, label)
);

create table public.brush_matches (
  id uuid primary key default gen_random_uuid(),
  left_id uuid not null references public.brush_images (id),
  right_id uuid not null references public.brush_images (id),
  winner_id uuid references public.brush_images (id),
  decision text not null check (decision in ('pick', 'trash')),
  left_trashed boolean not null default false,
  right_trashed boolean not null default false,
  decided_ms integer,
  created_at timestamptz not null default now(),
  check (left_id <> right_id),
  check (decision <> 'pick' or winner_id = left_id or winner_id = right_id),
  check (decision <> 'trash' or left_trashed or right_trashed)
);

create index brush_matches_created_idx on public.brush_matches (created_at desc);

create table public.brush_match_tags (
  match_id uuid not null references public.brush_matches (id) on delete cascade,
  tag_id uuid not null references public.brush_tags (id),
  image_id uuid not null references public.brush_images (id),
  polarity text not null check (polarity in ('like', 'bad')),
  primary key (match_id, tag_id, image_id)
);

-- Standing reasons on an image. Trash never removes the Drive file; these rows are the research record.
create table public.brush_image_tags (
  image_id uuid not null references public.brush_images (id) on delete cascade,
  tag_id uuid not null references public.brush_tags (id),
  polarity text not null check (polarity in ('like', 'bad')),
  origin text not null check (origin in ('match', 'review')),
  created_at timestamptz not null default now(),
  primary key (image_id, tag_id, polarity, origin)
);

create index brush_image_tags_bad_idx
  on public.brush_image_tags (tag_id)
  where polarity = 'bad';

create table public.brush_recipes (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  basis jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.brush_sync_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.brush_sync_seen (
  run_id uuid not null references public.brush_sync_runs (id) on delete cascade,
  drive_file_id text not null,
  primary key (run_id, drive_file_id)
);

insert into public.brush_tags (category, label, status, source, sort) values
  ('Hair', 'hair quality', 'live', 'seed', 1),
  ('Hair', 'hair softness/silkiness', 'live', 'seed', 2),
  ('Hair', 'hair shine', 'live', 'seed', 3),
  ('Hair', 'hair thickness', 'live', 'seed', 4),
  ('Hair', 'hair length', 'live', 'seed', 5),
  ('Hair', 'hair ends/blunt hem', 'live', 'seed', 6),
  ('Hair', 'thickness of hair at ends', 'live', 'seed', 7),
  ('Hair', 'bangs (none/blunt/curtain)', 'live', 'seed', 8),
  ('Hair', 'bangs thickness', 'live', 'seed', 9),
  ('Face', 'eye shape', 'live', 'seed', 10),
  ('Face', 'eye makeup', 'live', 'seed', 11),
  ('Face', 'lips/lip shape', 'live', 'seed', 12),
  ('Face', 'cheekbones/face', 'live', 'seed', 13),
  ('Face', 'expression', 'live', 'seed', 14),
  ('Face', 'apparent age', 'live', 'seed', 15),
  ('Face', 'skin', 'live', 'seed', 16),
  ('Styling', 'clothes/dress colour', 'live', 'seed', 17),
  ('Styling', 'pose/posture', 'live', 'seed', 18),
  ('Camera', 'camera angle (eye level/bird''s-eye/worm''s-eye)', 'live', 'seed', 19),
  ('Camera', 'framing/scope (close-up to full body)', 'live', 'seed', 20),
  ('Scene', 'setting/background', 'live', 'seed', 21),
  ('Scene', 'lighting', 'live', 'seed', 22),
  ('Scene', 'colour palette', 'live', 'seed', 23),
  ('Scene', 'composition', 'live', 'seed', 24),
  ('Scene', 'image quality/realism', 'live', 'seed', 25);

alter table public.brush_access enable row level security;
alter table public.brush_images enable row level security;
alter table public.brush_attributes enable row level security;
alter table public.brush_tags enable row level security;
alter table public.brush_matches enable row level security;
alter table public.brush_match_tags enable row level security;
alter table public.brush_image_tags enable row level security;
alter table public.brush_recipes enable row level security;
alter table public.brush_sync_runs enable row level security;
alter table public.brush_sync_seen enable row level security;

revoke all on table public.brush_access from public, anon, authenticated;
revoke all on table public.brush_images from public, anon, authenticated;
revoke all on table public.brush_attributes from public, anon, authenticated;
revoke all on table public.brush_tags from public, anon, authenticated;
revoke all on table public.brush_matches from public, anon, authenticated;
revoke all on table public.brush_match_tags from public, anon, authenticated;
revoke all on table public.brush_image_tags from public, anon, authenticated;
revoke all on table public.brush_recipes from public, anon, authenticated;
revoke all on table public.brush_sync_runs from public, anon, authenticated;
revoke all on table public.brush_sync_seen from public, anon, authenticated;

-- Live Elo step. K is 48 while either image has fewer than 8 games, then 24.
-- 1500 vs 1500, fewer than 8 games, A wins -> 1524 / 1476. Sigma shrinks by 0.94, floor 60.
create or replace function private.brush_rate(
  elo_a double precision,
  elo_b double precision,
  games_a integer,
  games_b integer,
  sigma_a double precision,
  sigma_b double precision,
  a_won boolean
) returns jsonb
language sql
immutable
set search_path = ''
as $fn$
  with vars as (
    select
      case when (case when games_a < games_b then games_a else games_b end) < 8 then 48 else 24 end::double precision as k,
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

revoke all on function private.brush_rate(double precision, double precision, integer, integer, double precision, double precision, boolean) from public, anon, authenticated;

create or replace function private.brush_require(lab_pin text, brush_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  stored text;
begin
  if not private.check_lab_reader_pin(lab_pin) then
    raise exception 'Wrong Lab password' using errcode = '28000';
  end if;

  select pin_hash into stored
  from public.brush_access
  where id = 1;

  if stored is null
     or brush_pin is null
     or extensions.crypt(brush_pin, stored) is distinct from stored then
    raise exception 'Wrong Brush PIN' using errcode = '28000';
  end if;
end;
$fn$;

revoke all on function private.brush_require(text, text) from public, anon, authenticated;

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
    'archived', image.archived_at is not null
  );
$fn$;

revoke all on function private.brush_image_json(public.brush_images) from public, anon, authenticated;

create or replace function public.brush_status(lab_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  stored text;
begin
  if not private.check_lab_reader_pin(lab_pin) then
    raise exception 'Wrong Lab password' using errcode = '28000';
  end if;
  select pin_hash into stored from public.brush_access where id = 1;
  return pg_catalog.jsonb_build_object('pin_set', stored is not null);
end;
$fn$;

create or replace function public.brush_set_pin(lab_pin text, current_pin text, new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  stored text;
begin
  if not private.check_lab_reader_pin(lab_pin) then
    raise exception 'Wrong Lab password' using errcode = '28000';
  end if;
  if new_pin is null or new_pin !~ '^[0-9]{4,8}$' then
    raise exception 'Brush PIN must be 4 to 8 digits' using errcode = '22023';
  end if;

  select pin_hash into stored from public.brush_access where id = 1 for update;
  if stored is not null
     and extensions.crypt(coalesce(current_pin, ''), stored) is distinct from stored then
    raise exception 'Wrong Brush PIN' using errcode = '28000';
  end if;

  update public.brush_access
  set pin_hash = extensions.crypt(new_pin, extensions.gen_salt('bf')),
      updated_at = pg_catalog.now()
  where id = 1;

  return pg_catalog.jsonb_build_object('pin_set', true);
end;
$fn$;

comment on function public.brush_set_pin(text, text, text) is
  'Sets the Brush PIN. First call: current_pin may be null. Later calls require the current Brush PIN. Hash only is stored.';

create or replace function public.brush_gate(lab_pin text, brush_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform private.brush_require(lab_pin, brush_pin);
  return pg_catalog.jsonb_build_object('ok', true);
end;
$fn$;

create or replace function public.brush_tags(lab_pin text, brush_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform private.brush_require(lab_pin, brush_pin);
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', t.id,
      'category', t.category,
      'label', t.label,
      'status', t.status,
      'source', t.source,
      'sort', t.sort,
      'likes', (select count(distinct it.image_id) from public.brush_image_tags it where it.tag_id = t.id and it.polarity = 'like'),
      'bads', (select count(distinct it.image_id) from public.brush_image_tags it where it.tag_id = t.id and it.polarity = 'bad')
    ) order by t.sort, t.label)
    from public.brush_tags t
    where t.status in ('live', 'suggested')
  ), '[]'::jsonb);
end;
$fn$;

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

  select * into v_left
  from public.brush_images
  where archived_at is null and trashed_at is null
  order by games asc, sigma desc, random()
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
    order by case when id = v_forbid then 1 else 0 end, random()
    limit 1;
  else
    select * into v_right
    from public.brush_images
    where archived_at is null and trashed_at is null and id <> v_left.id
    order by case when id = v_forbid then 1 else 0 end, abs(elo - v_left.elo), games asc, random()
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
  decided_ms integer default null
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
begin
  perform private.brush_require(lab_pin, brush_pin);

  if left_id is null or right_id is null or left_id = right_id then
    raise exception 'Pick two different images' using errcode = '22023';
  end if;
  if decision not in ('pick', 'trash') then
    raise exception 'Unknown decision' using errcode = '22023';
  end if;
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
      v_left.elo, v_right.elo, v_left.games, v_right.games, v_left.sigma, v_right.sigma, winner_id = left_id
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

  insert into public.brush_matches (left_id, right_id, winner_id, decision, left_trashed, right_trashed, decided_ms)
  values (
    left_id,
    right_id,
    case when decision = 'pick' then winner_id else null end,
    decision,
    decision = 'trash' and coalesce(trash_left, false),
    decision = 'trash' and coalesce(trash_right, false),
    decided_ms
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

create or replace function public.brush_leaderboard(lab_pin text, brush_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform private.brush_require(lab_pin, brush_pin);
  return coalesce((
    select pg_catalog.jsonb_agg(private.brush_image_json(i) order by i.elo desc, i.games desc, i.name)
    from public.brush_images i
    where i.archived_at is null
  ), '[]'::jsonb);
end;
$fn$;

create or replace function public.brush_library(lab_pin text, brush_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform private.brush_require(lab_pin, brush_pin);
  return coalesce((
    select pg_catalog.jsonb_agg(private.brush_image_json(i) order by i.created_at desc)
    from public.brush_images i
    where i.archived_at is null
  ), '[]'::jsonb);
end;
$fn$;

create or replace function public.brush_image_detail(lab_pin text, brush_pin text, image_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_row public.brush_images%rowtype;
begin
  perform private.brush_require(lab_pin, brush_pin);
  select * into v_row from public.brush_images where id = image_id;
  if v_row.id is null then
    raise exception 'Image not found' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object(
    'image', private.brush_image_json(v_row),
    'attributes', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'trait', a.trait,
        'value', a.value,
        'source', a.source,
        'confidence', a.confidence
      ) order by a.trait)
      from public.brush_attributes a
      where a.image_id = image_id
    ), '[]'::jsonb)
  );
end;
$fn$;

create or replace function public.brush_image_lookup(lab_pin text, brush_pin text, drive_file_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_row public.brush_images%rowtype;
begin
  perform private.brush_require(lab_pin, brush_pin);
  select * into v_row from public.brush_images where brush_images.drive_file_id = brush_image_lookup.drive_file_id;
  if v_row.id is null then
    raise exception 'Image not found' using errcode = 'P0002';
  end if;
  return private.brush_image_json(v_row);
end;
$fn$;

create or replace function public.brush_insights(lab_pin text, brush_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_tags jsonb;
  v_attrs jsonb;
  v_combos jsonb;
  v_recipe jsonb;
  v_turnoffs jsonb;
  v_trashed integer;
begin
  perform private.brush_require(lab_pin, brush_pin);

  v_tags := public.brush_tags(lab_pin, brush_pin);

  v_attrs := coalesce((
    select pg_catalog.jsonb_agg(row_to_json(s) order by s.wins desc, s.games desc)
    from (
      select a.trait, a.value,
             count(distinct a.image_id)::integer as images,
             coalesce(sum(i.wins), 0)::integer as wins,
             coalesce(sum(i.games), 0)::integer as games,
             coalesce(sum(i.trash_count), 0)::integer as trashes
      from public.brush_attributes a
      join public.brush_images i on i.id = a.image_id
      where i.archived_at is null
      group by a.trait, a.value
    ) s
  ), '[]'::jsonb);

  v_combos := coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'left', pair.left_label,
      'right', pair.right_label,
      'together', pair.together
    ) order by pair.together desc)
    from (
      select t1.label as left_label, t2.label as right_label, count(*)::integer as together
      from public.brush_match_tags m1
      join public.brush_match_tags m2
        on m1.match_id = m2.match_id
       and m1.image_id = m2.image_id
       and m1.tag_id < m2.tag_id
       and m1.polarity = 'like'
       and m2.polarity = 'like'
      join public.brush_tags t1 on t1.id = m1.tag_id
      join public.brush_tags t2 on t2.id = m2.tag_id
      group by t1.label, t2.label
      order by count(*) desc
      limit 12
    ) pair
  ), '[]'::jsonb);

  select pg_catalog.jsonb_build_object('body', r.body, 'created_at', r.created_at)
    into v_recipe
  from public.brush_recipes r
  order by r.created_at desc
  limit 1;

  select count(*) into v_trashed
  from public.brush_images
  where archived_at is null and trashed_at is not null;

  v_turnoffs := pg_catalog.jsonb_build_object(
    'trashed', v_trashed,
    'tags', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', s.id, 'category', s.category, 'label', s.label, 'images', s.images
      ) order by s.images desc, s.label)
      from (
        select t.id, t.category, t.label, count(distinct it.image_id)::integer as images
        from public.brush_image_tags it
        join public.brush_tags t on t.id = it.tag_id
        join public.brush_images i on i.id = it.image_id
        where it.polarity = 'bad'
          and i.trashed_at is not null
          and i.archived_at is null
          and t.status = 'live'
        group by t.id, t.category, t.label
        order by count(distinct it.image_id) desc, t.label
        limit 20
      ) s
    ), '[]'::jsonb)
  );

  return pg_catalog.jsonb_build_object(
    'images', (select count(*) from public.brush_images where archived_at is null),
    'active', (select count(*) from public.brush_images where archived_at is null and trashed_at is null),
    'trashed', v_trashed,
    'matches', (select count(*) from public.brush_matches),
    'tags', v_tags,
    'attributes', v_attrs,
    'combinations', v_combos,
    'turn_offs', v_turnoffs,
    'recipe', v_recipe
  );
end;
$fn$;

create or replace function public.brush_trashed(lab_pin text, brush_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform private.brush_require(lab_pin, brush_pin);
  return coalesce((
    select pg_catalog.jsonb_agg(
      private.brush_image_json(i) || pg_catalog.jsonb_build_object(
          'bad_tag_ids', coalesce((
          select pg_catalog.jsonb_agg(distinct it.tag_id)
          from public.brush_image_tags it
          where it.image_id = i.id and it.polarity = 'bad'
        ), '[]'::jsonb)
      )
      order by i.trashed_at desc nulls last, i.name
    )
    from public.brush_images i
    where i.archived_at is null and i.trashed_at is not null
  ), '[]'::jsonb);
end;
$fn$;

create or replace function public.brush_save_trash_tags(
  lab_pin text,
  brush_pin text,
  image_id uuid,
  tag_ids uuid[] default '{}'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_tag uuid;
  v_saved integer := 0;
begin
  perform private.brush_require(lab_pin, brush_pin);
  if not exists (
    select 1 from public.brush_images i
    where i.id = image_id and i.trashed_at is not null and i.archived_at is null
  ) then
    raise exception 'That image is not in trash review' using errcode = 'P0002';
  end if;

  delete from public.brush_image_tags it
  where it.image_id = brush_save_trash_tags.image_id
    and it.polarity = 'bad'
    and not (it.tag_id = any (coalesce(tag_ids, '{}'::uuid[])));

  if tag_ids is not null then
    foreach v_tag in array tag_ids loop
      insert into public.brush_image_tags (image_id, tag_id, polarity, origin)
      select image_id, t.id, 'bad', 'review'
      from public.brush_tags t
      where t.id = v_tag and t.status = 'live'
        and not exists (
          select 1 from public.brush_image_tags existing
          where existing.image_id = brush_save_trash_tags.image_id
            and existing.tag_id = t.id
            and existing.polarity = 'bad'
        );
      if found then v_saved := v_saved + 1; end if;
    end loop;
  end if;

  return pg_catalog.jsonb_build_object('image_id', image_id, 'saved', v_saved);
end;
$fn$;

comment on function public.brush_save_trash_tags(text, text, uuid, uuid[]) is
  'Tags a trashed image later. Does not delete or move the Drive file.';

create or replace function public.brush_restore(lab_pin text, brush_pin text, image_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform private.brush_require(lab_pin, brush_pin);
  update public.brush_images
  set trashed_at = null, updated_at = pg_catalog.now()
  where id = image_id and trashed_at is not null;
  if not found then
    raise exception 'That image is not flagged' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object('id', image_id, 'trashed', false);
end;
$fn$;

create or replace function public.brush_upsert_attribute(
  lab_pin text,
  brush_pin text,
  image_id uuid,
  trait text,
  value text,
  attribute_source text,
  confidence double precision default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform private.brush_require(lab_pin, brush_pin);
  if attribute_source not in ('filename', 'prompt', 'vision', 'manual') then
    raise exception 'Unknown attribute source' using errcode = '22023';
  end if;
  if not exists (select 1 from public.brush_images i where i.id = image_id) then
    raise exception 'Image not found' using errcode = 'P0002';
  end if;
  if btrim(coalesce(trait, '')) = '' or btrim(coalesce(value, '')) = '' then
    raise exception 'Attribute needs a trait and a value' using errcode = '22023';
  end if;

  insert into public.brush_attributes (image_id, trait, value, source, confidence)
  values (image_id, left(btrim(trait), 80), left(btrim(value), 160), attribute_source, confidence)
  on conflict (image_id, trait, source) do update
  set value = excluded.value, confidence = excluded.confidence;

  return pg_catalog.jsonb_build_object('image_id', image_id, 'trait', left(btrim(trait), 80));
end;
$fn$;

create or replace function public.brush_suggest_tag(
  lab_pin text,
  brush_pin text,
  category text,
  label text,
  tag_source text default 'admin'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_category text;
  v_label text;
  v_row public.brush_tags%rowtype;
begin
  perform private.brush_require(lab_pin, brush_pin);
  v_category := left(btrim(coalesce(category, '')), 40);
  v_label := left(btrim(coalesce(label, '')), 80);
  if v_category = '' or v_label = '' then
    raise exception 'A suggested tag needs a category and a label' using errcode = '22023';
  end if;
  if tag_source not in ('ai', 'admin', 'scout') then
    raise exception 'Unknown tag source' using errcode = '22023';
  end if;

  select * into v_row from public.brush_tags t
  where t.category = v_category and t.label = v_label;

  if v_row.id is not null then
    return pg_catalog.jsonb_build_object('id', v_row.id, 'status', v_row.status, 'created', false);
  end if;

  insert into public.brush_tags (category, label, status, source, sort)
  values (v_category, v_label, 'suggested', tag_source, 1000)
  returning * into v_row;

  return pg_catalog.jsonb_build_object('id', v_row.id, 'status', v_row.status, 'created', true);
end;
$fn$;

create or replace function public.brush_review_tag(
  lab_pin text,
  brush_pin text,
  tag_id uuid,
  tag_decision text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status text;
begin
  perform private.brush_require(lab_pin, brush_pin);
  if tag_decision = 'approve' then
    v_status := 'live';
  elsif tag_decision = 'reject' then
    v_status := 'rejected';
  else
    raise exception 'Approve or reject the tag' using errcode = '22023';
  end if;

  update public.brush_tags
  set status = v_status
  where id = tag_id and status = 'suggested';

  if not found then
    raise exception 'That tag is not waiting for approval' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object('id', tag_id, 'status', v_status);
end;
$fn$;

create or replace function public.brush_sync_begin(lab_pin text, brush_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id uuid;
begin
  perform private.brush_require(lab_pin, brush_pin);
  delete from public.brush_sync_runs
  where finished_at is null and created_at < pg_catalog.now() - interval '1 day';
  insert into public.brush_sync_runs (id) values (gen_random_uuid()) returning id into v_id;
  return pg_catalog.jsonb_build_object('run_id', v_id);
end;
$fn$;

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
    if v_drive = '' or v_name = '' then
      continue;
    end if;
    if coalesce(item->>'source', 'drive') not in ('drive', 'upload') then
      continue;
    end if;

    v_existed := exists (select 1 from public.brush_images i where i.drive_file_id = v_drive);
    insert into public.brush_images (
      drive_file_id, name, folder_path, country, series, mime_type, source, prompt_text, prompt_source, synced_at
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
      pg_catalog.now()
    )
    on conflict (drive_file_id) do update set
      name = excluded.name,
      folder_path = excluded.folder_path,
      country = excluded.country,
      series = coalesce(excluded.series, public.brush_images.series),
      mime_type = excluded.mime_type,
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

create or replace function public.brush_save_attributes(
  lab_pin text,
  brush_pin text,
  image_id uuid,
  attributes jsonb,
  attribute_source text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  item jsonb;
  v_count integer := 0;
begin
  perform private.brush_require(lab_pin, brush_pin);
  if attribute_source not in ('filename', 'prompt', 'vision', 'manual') then
    raise exception 'Unknown attribute source' using errcode = '22023';
  end if;
  if not exists (select 1 from public.brush_images i where i.id = image_id) then
    raise exception 'Image not found' using errcode = 'P0002';
  end if;

  delete from public.brush_attributes a
  where a.image_id = brush_save_attributes.image_id and a.source = attribute_source;

  if pg_catalog.jsonb_typeof(attributes) = 'array' then
    for item in select value from pg_catalog.jsonb_array_elements(attributes) loop
      if btrim(coalesce(item->>'trait', '')) = '' or btrim(coalesce(item->>'value', '')) = '' then
        continue;
      end if;
      insert into public.brush_attributes (image_id, trait, value, source, confidence)
      values (
        image_id,
        left(btrim(item->>'trait'), 80),
        left(btrim(item->>'value'), 160),
        attribute_source,
        nullif(item->>'confidence', '')::double precision
      );
      v_count := v_count + 1;
    end loop;
  end if;

  return pg_catalog.jsonb_build_object('saved', v_count);
end;
$fn$;

create or replace function public.brush_set_prompt(
  lab_pin text,
  brush_pin text,
  image_id uuid,
  prompt_text text,
  prompt_source text default 'manual'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform private.brush_require(lab_pin, brush_pin);
  if prompt_source not in ('filename', 'sidecar', 'manual', 'none') then
    raise exception 'Unknown prompt source' using errcode = '22023';
  end if;
  update public.brush_images
  set prompt_text = nullif(btrim(coalesce(prompt_text, '')), ''),
      prompt_source = prompt_source,
      updated_at = pg_catalog.now()
  where id = image_id;
  if not found then
    raise exception 'Image not found' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object('id', image_id);
end;
$fn$;

create or replace function public.brush_save_recipe(
  lab_pin text,
  brush_pin text,
  body text,
  basis jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id uuid;
  v_body text;
begin
  perform private.brush_require(lab_pin, brush_pin);
  v_body := btrim(coalesce(body, ''));
  if v_body = '' then
    raise exception 'The recipe is empty' using errcode = '22023';
  end if;
  insert into public.brush_recipes (body, basis)
  values (left(v_body, 8000), coalesce(basis, '{}'::jsonb))
  returning id into v_id;
  return pg_catalog.jsonb_build_object('id', v_id);
end;
$fn$;

revoke all on function public.brush_status(text) from public;
revoke all on function public.brush_set_pin(text, text, text) from public;
revoke all on function public.brush_gate(text, text) from public;
revoke all on function public.brush_tags(text, text) from public;
revoke all on function public.brush_next_pair(text, text) from public;
revoke all on function public.brush_record(text, text, uuid, uuid, text, uuid, boolean, boolean, uuid[], integer) from public;
revoke all on function public.brush_leaderboard(text, text) from public;
revoke all on function public.brush_library(text, text) from public;
revoke all on function public.brush_image_detail(text, text, uuid) from public;
revoke all on function public.brush_image_lookup(text, text, text) from public;
revoke all on function public.brush_insights(text, text) from public;
revoke all on function public.brush_trashed(text, text) from public;
revoke all on function public.brush_save_trash_tags(text, text, uuid, uuid[]) from public;
revoke all on function public.brush_restore(text, text, uuid) from public;
revoke all on function public.brush_upsert_attribute(text, text, uuid, text, text, text, double precision) from public;
revoke all on function public.brush_suggest_tag(text, text, text, text, text) from public;
revoke all on function public.brush_review_tag(text, text, uuid, text) from public;
revoke all on function public.brush_sync_begin(text, text) from public;
revoke all on function public.brush_upsert_images(text, text, jsonb, uuid) from public;
revoke all on function public.brush_sync_finish(text, text, uuid) from public;
revoke all on function public.brush_save_attributes(text, text, uuid, jsonb, text) from public;
revoke all on function public.brush_set_prompt(text, text, uuid, text, text) from public;
revoke all on function public.brush_save_recipe(text, text, text, jsonb) from public;

grant execute on function public.brush_status(text) to anon, authenticated;
grant execute on function public.brush_set_pin(text, text, text) to anon, authenticated;
grant execute on function public.brush_gate(text, text) to anon, authenticated;
grant execute on function public.brush_tags(text, text) to anon, authenticated;
grant execute on function public.brush_next_pair(text, text) to anon, authenticated;
grant execute on function public.brush_record(text, text, uuid, uuid, text, uuid, boolean, boolean, uuid[], integer) to anon, authenticated;
grant execute on function public.brush_leaderboard(text, text) to anon, authenticated;
grant execute on function public.brush_library(text, text) to anon, authenticated;
grant execute on function public.brush_image_detail(text, text, uuid) to anon, authenticated;
grant execute on function public.brush_image_lookup(text, text, text) to anon, authenticated;
grant execute on function public.brush_insights(text, text) to anon, authenticated;
grant execute on function public.brush_trashed(text, text) to anon, authenticated;
grant execute on function public.brush_save_trash_tags(text, text, uuid, uuid[]) to anon, authenticated;
grant execute on function public.brush_restore(text, text, uuid) to anon, authenticated;
grant execute on function public.brush_upsert_attribute(text, text, uuid, text, text, text, double precision) to anon, authenticated;
grant execute on function public.brush_suggest_tag(text, text, text, text, text) to anon, authenticated;
grant execute on function public.brush_review_tag(text, text, uuid, text) to anon, authenticated;
grant execute on function public.brush_sync_begin(text, text) to anon, authenticated;
grant execute on function public.brush_upsert_images(text, text, jsonb, uuid) to anon, authenticated;
grant execute on function public.brush_sync_finish(text, text, uuid) to anon, authenticated;
grant execute on function public.brush_save_attributes(text, text, uuid, jsonb, text) to anon, authenticated;
grant execute on function public.brush_set_prompt(text, text, uuid, text, text) to anon, authenticated;
grant execute on function public.brush_save_recipe(text, text, text, jsonb) to anon, authenticated;
