-- Ongoing tournament. New photos start at the default rating and do not rewrite anyone else.
-- A newcomer uses a larger K than a settled photo. Their first matches prefer the open end of the ladder.

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
        * (case when games_a < 8 then 48 else 24 end)::double precision as k_a,
      (case when margin = 'close' then 1.0 / 3.0 else 1.0 end)
        * (case when games_b < 8 then 48 else 24 end)::double precision as k_b,
      1.0 / (1.0 + pg_catalog.power(10::double precision, (elo_b - elo_a) / 400.0)) as expected_a
  )
  select pg_catalog.jsonb_build_object(
    'k', vars.k_a,
    'k_a', vars.k_a,
    'k_b', vars.k_b,
    'expected_a', vars.expected_a,
    'elo_a', elo_a + vars.k_a * ((case when a_won then 1 else 0 end) - vars.expected_a),
    'elo_b', elo_b + vars.k_b * ((case when a_won then 0 else 1 end) - (1.0 - vars.expected_a)),
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
  v_target double precision;
  v_quantile double precision;
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

  if exists (
    select 1 from public.brush_images
    where archived_at is null and trashed_at is null and games < 5
  ) then
    select * into v_left
    from public.brush_images
    where archived_at is null and trashed_at is null
      and games = (
        select min(games) from public.brush_images
        where archived_at is null and trashed_at is null and games < 5
      )
    order by case when id = v_last_left or id = v_last_right then 1 else 0 end, random()
    limit 1;
  elsif random() < 0.7 then
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

  v_target := null;
  if v_left.games < 5 and exists (
    select 1 from public.brush_images
    where archived_at is null and trashed_at is null and games >= 5 and id <> v_left.id
  ) then
    v_quantile := case v_left.games
      when 0 then 0.5
      when 1 then 0.8
      when 2 then 0.2
      when 3 then 0.65
      else 0.35
    end;
    select percentile_cont(v_quantile) within group (order by elo)
    into v_target
    from public.brush_images
    where archived_at is null and trashed_at is null and games >= 5 and id <> v_left.id;
  end if;

  select * into v_right
  from public.brush_images opponent
  where opponent.archived_at is null and opponent.trashed_at is null and opponent.id <> v_left.id
  order by
    (case when private.brush_key_clash(v_left.name, v_left.folder_path, v_left.series, opponent.name, opponent.folder_path, opponent.series) then 100 else 0 end)
    + (case when private.brush_hash_distance(v_left.perceptual_hash, opponent.perceptual_hash) <= 8 then 100 else 0 end)
    + (case when v_target is not null and opponent.games < 5 then 40 else 0 end)
    + (case when opponent.id = v_last_left or opponent.id = v_last_right then 10 else 0 end)
    + (case when exists (
        select 1 from public.brush_matches prior
        where prior.created_at > pg_catalog.now() - interval '12 hours'
          and (
            (prior.left_id = v_left.id and prior.right_id = opponent.id)
            or (prior.right_id = v_left.id and prior.left_id = opponent.id)
          )
      ) then 10 else 0 end),
    case when v_target is not null then abs(opponent.elo - v_target) else opponent.games::double precision end,
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
