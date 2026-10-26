-- Qualify category columns inside the ranking functions.
-- The parameter is still named category so the client JSON key stays the same.
-- An unqualified category next to brush_contest.category, brush_matches.category,
-- or brush_ratings.category made Postgres raise "column reference \"category\" is ambiguous"
-- and the match screen could not load.

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
  margin text default 'clear',
  category text default 'overall'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_left public.brush_images%rowtype;
  v_right public.brush_images%rowtype;
  v_left_rating public.brush_ratings%rowtype;
  v_right_rating public.brush_ratings%rowtype;
  v_rated jsonb;
  v_match uuid;
  v_tag uuid;
  v_margin text;
  v_category text;
begin
  perform private.brush_require(lab_pin, brush_pin);
  v_category := coalesce(nullif(brush_record.category, ''), 'overall');

  if left_id is null or right_id is null or left_id = right_id then
    raise exception 'Pick two different images' using errcode = '22023';
  end if;
  if decision not in ('pick', 'trash') then
    raise exception 'Unknown decision' using errcode = '22023';
  end if;
  if not exists (select 1 from public.brush_categories where id = v_category) then
    raise exception 'Unknown category' using errcode = '22023';
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

  insert into public.brush_ratings (image_id, category, elo, sigma, volatility, games, wins, losses, close_wins, close_losses)
  select i.id, v_category,
    case when v_category = 'overall' then i.elo else 1500 end,
    case when v_category = 'overall' then i.sigma else 350 end,
    case when v_category = 'overall' then i.volatility else 0.06 end,
    case when v_category = 'overall' then i.games else 0 end,
    case when v_category = 'overall' then i.wins else 0 end,
    case when v_category = 'overall' then i.losses else 0 end,
    case when v_category = 'overall' then i.close_wins else 0 end,
    case when v_category = 'overall' then i.close_losses else 0 end
  from public.brush_images i
  where i.id in (left_id, right_id)
  on conflict (image_id, category) do nothing;

  select * into v_left_rating from public.brush_ratings where image_id = left_id and brush_ratings.category = v_category;
  select * into v_right_rating from public.brush_ratings where image_id = right_id and brush_ratings.category = v_category;

  if decision = 'pick' then
    v_rated := private.brush_rate(
      v_left_rating.elo, v_right_rating.elo, v_left_rating.sigma, v_right_rating.sigma,
      v_left_rating.volatility, v_right_rating.volatility, winner_id = left_id, v_margin
    );
    update public.brush_ratings
    set elo = (v_rated->>'elo_a')::double precision,
        sigma = (v_rated->>'sigma_a')::double precision,
        volatility = (v_rated->>'volatility_a')::double precision,
        games = games + 1,
        wins = wins + case when image_id = winner_id then 1 else 0 end,
        losses = losses + case when image_id = winner_id then 0 else 1 end,
        close_wins = close_wins + case when image_id = winner_id and v_margin = 'close' then 1 else 0 end,
        close_losses = close_losses + case when image_id <> winner_id and v_margin = 'close' then 1 else 0 end
    where image_id = left_id and brush_ratings.category = v_category;
    update public.brush_ratings
    set elo = (v_rated->>'elo_b')::double precision,
        sigma = (v_rated->>'sigma_b')::double precision,
        volatility = (v_rated->>'volatility_b')::double precision,
        games = games + 1,
        wins = wins + case when image_id = winner_id then 1 else 0 end,
        losses = losses + case when image_id = winner_id then 0 else 1 end,
        close_wins = close_wins + case when image_id = winner_id and v_margin = 'close' then 1 else 0 end,
        close_losses = close_losses + case when image_id <> winner_id and v_margin = 'close' then 1 else 0 end
    where image_id = right_id and brush_ratings.category = v_category;
    if v_category = 'overall' then
      update public.brush_images
      set elo = (v_rated->>'elo_a')::double precision,
          sigma = (v_rated->>'sigma_a')::double precision,
          volatility = (v_rated->>'volatility_a')::double precision,
          games = games + 1,
          wins = wins + case when id = winner_id then 1 else 0 end,
          losses = losses + case when id = winner_id then 0 else 1 end,
          updated_at = pg_catalog.now()
      where id = left_id;
      update public.brush_images
      set elo = (v_rated->>'elo_b')::double precision,
          sigma = (v_rated->>'sigma_b')::double precision,
          volatility = (v_rated->>'volatility_b')::double precision,
          games = games + 1,
          wins = wins + case when id = winner_id then 1 else 0 end,
          losses = losses + case when id = winner_id then 0 else 1 end,
          updated_at = pg_catalog.now()
      where id = right_id;
    end if;
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

  insert into public.brush_matches (left_id, right_id, winner_id, decision, left_trashed, right_trashed, decided_ms, margin, category)
  values (
    left_id,
    right_id,
    case when decision = 'pick' then winner_id else null end,
    decision,
    decision = 'trash' and coalesce(trash_left, false),
    decision = 'trash' and coalesce(trash_right, false),
    decided_ms,
    case when decision = 'pick' then v_margin else 'clear' end,
    v_category
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
  return pg_catalog.jsonb_build_object(
    'phase', coalesce(v_row.phase, 'qualifying'),
    'rounds', coalesce(v_row.rounds, '[]'::jsonb),
    'champion_id', v_row.champion_id,
    'recent', v_recent
  );
end;
$fn$;

create or replace function public.brush_contest_put(
  lab_pin text,
  brush_pin text,
  phase text,
  rounds jsonb,
  champion_id uuid,
  category text default 'overall'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_category text;
begin
  perform private.brush_require(lab_pin, brush_pin);
  v_category := coalesce(nullif(brush_contest_put.category, ''), 'overall');
  if phase not in ('qualifying', 'finals', 'champion') then
    raise exception 'Unknown contest phase' using errcode = '22023';
  end if;
  if not exists (select 1 from public.brush_categories where id = v_category) then
    raise exception 'Unknown category' using errcode = '22023';
  end if;
  if champion_id is not null and not exists (select 1 from public.brush_images where id = champion_id) then
    raise exception 'Champion not found' using errcode = 'P0002';
  end if;
  update public.brush_contest
  set phase = brush_contest_put.phase,
      rounds = coalesce(brush_contest_put.rounds, '[]'::jsonb),
      champion_id = brush_contest_put.champion_id,
      updated_at = pg_catalog.now()
  where brush_contest.category = v_category;
  if not found then
    insert into public.brush_contest (id, category, phase, rounds, champion_id)
    values (
      coalesce((select max(contest.id) from public.brush_contest contest), 0) + 1,
      v_category,
      brush_contest_put.phase,
      coalesce(brush_contest_put.rounds, '[]'::jsonb),
      brush_contest_put.champion_id
    );
  end if;
  return public.brush_contest_get(lab_pin, brush_pin, v_category);
end;
$fn$;
