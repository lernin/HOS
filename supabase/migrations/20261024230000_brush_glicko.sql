-- Glicko-2. Each picture keeps its rating. sigma becomes the rating deviation:
-- greatest(50, 350 / sqrt(games + 1)). Volatility starts at 0.06.
-- Rank and top-16 seeding use rating - 2 * RD. Levels still use the raw rating.
-- A clear win scores 1-0. A close call scores 2/3-1/3. History, wins, and faces stay.

alter table public.brush_images
  add column if not exists volatility double precision not null default 0.06;

update public.brush_images
set sigma = case
      when 350::double precision / pg_catalog.sqrt((games + 1)::double precision) < 50::double precision then 50::double precision
      else 350::double precision / pg_catalog.sqrt((games + 1)::double precision)
    end,
    volatility = 0.06;

comment on column public.brush_images.elo is 'Glicko-2 rating. Levels use this raw rating.';
comment on column public.brush_images.sigma is 'Glicko-2 rating deviation. Rank and top-16 seeding use elo - 2 * sigma.';
comment on column public.brush_images.volatility is 'Glicko-2 volatility. New pictures start at 0.06.';

create or replace function private.brush_glicko_f(
  x double precision,
  delta double precision,
  phi2 double precision,
  v double precision,
  a double precision,
  tau double precision
) returns double precision
language sql
immutable
set search_path = ''
as $fn$
  select (
    pg_catalog.exp(x) * (delta * delta - phi2 - v - pg_catalog.exp(x))
  ) / (
    2.0 * pg_catalog.power(phi2 + v + pg_catalog.exp(x), 2)
  ) - (x - a) / (tau * tau);
$fn$;

revoke all on function private.brush_glicko_f(double precision, double precision, double precision, double precision, double precision, double precision) from public, anon, authenticated;

create or replace function private.brush_glicko_one(
  rating double precision,
  rd double precision,
  vol double precision,
  opp_rating double precision,
  opp_rd double precision,
  score double precision
) returns jsonb
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  scale constant double precision := 173.7178;
  tau constant double precision := 0.5;
  mu double precision := (rating - 1500.0) / scale;
  phi double precision := rd / scale;
  mu_j double precision := (opp_rating - 1500.0) / scale;
  phi_j double precision := opp_rd / scale;
  gj double precision;
  ej double precision;
  v double precision;
  delta double precision;
  a double precision;
  phi2 double precision;
  big_a double precision;
  big_b double precision;
  f_a double precision;
  f_b double precision;
  big_c double precision;
  f_c double precision;
  sigma_p double precision;
  phi_star double precision;
  phi_p double precision;
  outcome double precision;
  new_rd double precision;
  k integer := 1;
  guard integer := 0;
begin
  gj := 1.0 / pg_catalog.sqrt(1.0 + (3.0 * phi_j * phi_j) / (pg_catalog.pi() * pg_catalog.pi()));
  ej := 1.0 / (1.0 + pg_catalog.exp(-gj * (mu - mu_j)));
  v := 1.0 / (gj * gj * ej * (1.0 - ej));
  outcome := gj * (score - ej);
  delta := v * outcome;
  a := pg_catalog.ln(case when vol > 0 then vol * vol else 0.06 * 0.06 end);
  phi2 := phi * phi;
  big_a := a;
  if delta * delta > phi2 + v then
    big_b := pg_catalog.ln(delta * delta - phi2 - v);
  else
    while private.brush_glicko_f(a - k * tau, delta, phi2, v, a, tau) < 0 loop
      k := k + 1;
      if k > 100 then
        exit;
      end if;
    end loop;
    big_b := a - k * tau;
  end if;
  f_a := private.brush_glicko_f(big_a, delta, phi2, v, a, tau);
  f_b := private.brush_glicko_f(big_b, delta, phi2, v, a, tau);
  while pg_catalog.abs(big_b - big_a) > 0.000001 and guard < 100 loop
    big_c := big_a + ((big_a - big_b) * f_a) / (f_b - f_a);
    f_c := private.brush_glicko_f(big_c, delta, phi2, v, a, tau);
    if f_c * f_b < 0 then
      big_a := big_b;
      f_a := f_b;
    else
      f_a := f_a / 2.0;
    end if;
    big_b := big_c;
    f_b := f_c;
    guard := guard + 1;
  end loop;
  sigma_p := pg_catalog.exp(big_a / 2.0);
  phi_star := pg_catalog.sqrt(phi * phi + sigma_p * sigma_p);
  phi_p := 1.0 / pg_catalog.sqrt(1.0 / (phi_star * phi_star) + 1.0 / v);
  new_rd := scale * phi_p;
  if new_rd < 50 then
    new_rd := 50;
  end if;
  if new_rd > 350 then
    new_rd := 350;
  end if;
  return pg_catalog.jsonb_build_object(
    'rating', scale * (mu + phi_p * phi_p * outcome) + 1500.0,
    'rd', new_rd,
    'volatility', sigma_p,
    'expected', ej
  );
end;
$fn$;

revoke all on function private.brush_glicko_one(double precision, double precision, double precision, double precision, double precision, double precision) from public, anon, authenticated;

drop function if exists private.brush_rate(double precision, double precision, integer, integer, double precision, double precision, boolean, text);
drop function if exists private.brush_rate(double precision, double precision, integer, integer, double precision, double precision, boolean);

create or replace function private.brush_rate(
  elo_a double precision,
  elo_b double precision,
  sigma_a double precision,
  sigma_b double precision,
  volatility_a double precision,
  volatility_b double precision,
  a_won boolean,
  margin text default 'clear'
) returns jsonb
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  score_a double precision;
  score_b double precision;
  next_a jsonb;
  next_b jsonb;
  vol_a double precision := case when volatility_a > 0 then volatility_a else 0.06 end;
  vol_b double precision := case when volatility_b > 0 then volatility_b else 0.06 end;
begin
  if margin = 'close' then
    if a_won then
      score_a := 2.0 / 3.0;
      score_b := 1.0 / 3.0;
    else
      score_a := 1.0 / 3.0;
      score_b := 2.0 / 3.0;
    end if;
  elsif a_won then
    score_a := 1.0;
    score_b := 0.0;
  else
    score_a := 0.0;
    score_b := 1.0;
  end if;
  next_a := private.brush_glicko_one(elo_a, sigma_a, vol_a, elo_b, sigma_b, score_a);
  next_b := private.brush_glicko_one(elo_b, sigma_b, vol_b, elo_a, sigma_a, score_b);
  return pg_catalog.jsonb_build_object(
    'elo_a', (next_a->>'rating')::double precision,
    'elo_b', (next_b->>'rating')::double precision,
    'sigma_a', (next_a->>'rd')::double precision,
    'sigma_b', (next_b->>'rd')::double precision,
    'volatility_a', (next_a->>'volatility')::double precision,
    'volatility_b', (next_b->>'volatility')::double precision,
    'expected_a', (next_a->>'expected')::double precision
  );
end;
$fn$;

revoke all on function private.brush_rate(double precision, double precision, double precision, double precision, double precision, double precision, boolean, text) from public, anon, authenticated;

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
      v_left.elo, v_right.elo, v_left.sigma, v_right.sigma, v_left.volatility, v_right.volatility, winner_id = left_id, v_margin
    );
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
    'has_thumbnail', image.thumbnail_path is not null,
    'perceptual_hash', image.perceptual_hash,
    'face_box', image.face_box,
    'face_scanned', image.face_scanned
  );
$fn$;

revoke all on function private.brush_image_json(public.brush_images) from public, anon, authenticated;
