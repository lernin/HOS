-- Exact undo for a Brush decision.
-- brush_record stores both pictures' ratings and trash state before it changes them.
-- brush_undo restores that snapshot and deletes the match. Older matches have no snapshot.

alter table public.brush_matches
  add column if not exists before_state jsonb;

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
  v_before jsonb;
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
  on conflict on constraint brush_ratings_pkey do nothing;

  select * into v_left_rating from public.brush_ratings where image_id = left_id and brush_ratings.category = v_category;
  select * into v_right_rating from public.brush_ratings where image_id = right_id and brush_ratings.category = v_category;

  v_before := pg_catalog.jsonb_build_object(
    'left', pg_catalog.jsonb_build_object(
      'elo', v_left_rating.elo,
      'sigma', v_left_rating.sigma,
      'volatility', v_left_rating.volatility,
      'games', v_left_rating.games,
      'wins', v_left_rating.wins,
      'losses', v_left_rating.losses,
      'close_wins', v_left_rating.close_wins,
      'close_losses', v_left_rating.close_losses,
      'trash_count', v_left.trash_count,
      'trashed_at', v_left.trashed_at,
      'image_elo', v_left.elo,
      'image_sigma', v_left.sigma,
      'image_volatility', v_left.volatility,
      'image_games', v_left.games,
      'image_wins', v_left.wins,
      'image_losses', v_left.losses,
      'image_close_wins', v_left.close_wins,
      'image_close_losses', v_left.close_losses
    ),
    'right', pg_catalog.jsonb_build_object(
      'elo', v_right_rating.elo,
      'sigma', v_right_rating.sigma,
      'volatility', v_right_rating.volatility,
      'games', v_right_rating.games,
      'wins', v_right_rating.wins,
      'losses', v_right_rating.losses,
      'close_wins', v_right_rating.close_wins,
      'close_losses', v_right_rating.close_losses,
      'trash_count', v_right.trash_count,
      'trashed_at', v_right.trashed_at,
      'image_elo', v_right.elo,
      'image_sigma', v_right.sigma,
      'image_volatility', v_right.volatility,
      'image_games', v_right.games,
      'image_wins', v_right.wins,
      'image_losses', v_right.losses,
      'image_close_wins', v_right.close_wins,
      'image_close_losses', v_right.close_losses
    )
  );

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

  insert into public.brush_matches (left_id, right_id, winner_id, decision, left_trashed, right_trashed, decided_ms, margin, category, before_state)
  values (
    left_id,
    right_id,
    case when decision = 'pick' then winner_id else null end,
    decision,
    decision = 'trash' and coalesce(trash_left, false),
    decision = 'trash' and coalesce(trash_right, false),
    decided_ms,
    case when decision = 'pick' then v_margin else 'clear' end,
    v_category,
    v_before
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


create or replace function public.brush_undo(lab_pin text, brush_pin text, match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_row public.brush_matches%rowtype;
  v_state jsonb;
  v_side text;
  v_image uuid;
begin
  perform private.brush_require(lab_pin, brush_pin);
  select * into v_row from public.brush_matches where id = brush_undo.match_id for update;
  if v_row.id is null then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  v_state := v_row.before_state;
  if v_state is null or v_state->'left' is null or v_state->'right' is null then
    raise exception 'That decision cannot be undone' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.brush_matches later
    where later.id <> v_row.id
      and later.category = v_row.category
      and later.created_at > v_row.created_at
      and (later.left_id in (v_row.left_id, v_row.right_id) or later.right_id in (v_row.left_id, v_row.right_id))
  ) then
    raise exception 'A later match has to be undone first' using errcode = '22023';
  end if;

  perform 1 from public.brush_images where id in (v_row.left_id, v_row.right_id) order by id for update;

  foreach v_side in array ARRAY['left', 'right']::text[] loop
    v_image := case when v_side = 'left' then v_row.left_id else v_row.right_id end;
    update public.brush_ratings
    set elo = (v_state->v_side->>'elo')::double precision,
        sigma = (v_state->v_side->>'sigma')::double precision,
        volatility = (v_state->v_side->>'volatility')::double precision,
        games = (v_state->v_side->>'games')::integer,
        wins = (v_state->v_side->>'wins')::integer,
        losses = (v_state->v_side->>'losses')::integer,
        close_wins = (v_state->v_side->>'close_wins')::integer,
        close_losses = (v_state->v_side->>'close_losses')::integer
    where image_id = v_image and brush_ratings.category = v_row.category;
    if v_row.category = 'overall' then
      update public.brush_images
      set elo = (v_state->v_side->>'image_elo')::double precision,
          sigma = (v_state->v_side->>'image_sigma')::double precision,
          volatility = (v_state->v_side->>'image_volatility')::double precision,
          games = (v_state->v_side->>'image_games')::integer,
          wins = (v_state->v_side->>'image_wins')::integer,
          losses = (v_state->v_side->>'image_losses')::integer,
          close_wins = (v_state->v_side->>'image_close_wins')::integer,
          close_losses = (v_state->v_side->>'image_close_losses')::integer,
          trash_count = (v_state->v_side->>'trash_count')::integer,
          trashed_at = (v_state->v_side->>'trashed_at')::timestamptz,
          updated_at = pg_catalog.now()
      where id = v_image;
    else
      update public.brush_images
      set trash_count = (v_state->v_side->>'trash_count')::integer,
          trashed_at = (v_state->v_side->>'trashed_at')::timestamptz,
          updated_at = pg_catalog.now()
      where id = v_image;
    end if;
  end loop;

  delete from public.brush_matches where id = v_row.id;

  return pg_catalog.jsonb_build_object(
    'match_id', v_row.id,
    'category', v_row.category,
    'left_id', v_row.left_id,
    'right_id', v_row.right_id,
    'before', v_state
  );
end;
$fn$;

grant execute on function public.brush_undo(text, text, uuid) to anon, authenticated;
