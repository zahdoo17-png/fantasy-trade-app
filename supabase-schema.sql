-- =============================================
-- Fantasy Basketball Trade Analyzer
-- Run this entire file in Supabase SQL Editor
-- =============================================

-- Players table: one row per player, updated nightly
create table if not exists players (
  id bigint primary key,
  full_name text not null,
  first_name text,
  last_name text,
  team_id bigint,
  team_abbreviation text,
  team_name text,
  position text,
  age integer,
  height text,
  weight text,
  jersey_number text,
  is_active boolean default true,
  updated_at timestamptz default now()
);

-- Season stats: one row per player per season
create table if not exists season_stats (
  id bigserial primary key,
  player_id bigint references players(id),
  season integer not null,
  games_played integer default 0,
  pts_per_game numeric(5,2) default 0,
  reb_per_game numeric(5,2) default 0,
  ast_per_game numeric(5,2) default 0,
  stl_per_game numeric(5,2) default 0,
  blk_per_game numeric(5,2) default 0,
  to_per_game numeric(5,2) default 0,
  fgm_per_game numeric(5,2) default 0,
  fga_per_game numeric(5,2) default 0,
  fg_pct numeric(5,3) default 0,
  ftm_per_game numeric(5,2) default 0,
  fta_per_game numeric(5,2) default 0,
  ft_pct numeric(5,3) default 0,
  fg3m_per_game numeric(5,2) default 0,
  fg3a_per_game numeric(5,2) default 0,
  min_per_game numeric(5,2) default 0,
  -- Derived fantasy metrics
  fantasy_pts_per_game numeric(7,2) default 0,
  proj_season_total numeric(9,2) default 0,
  injury_risk_score numeric(4,2) default 5.0,
  age_factor numeric(4,3) default 1.0,
  gp_factor numeric(4,3) default 1.0,
  -- Last 3 seasons GP for injury tracking
  gp_season_minus1 integer default 0,
  gp_season_minus2 integer default 0,
  updated_at timestamptz default now(),
  unique(player_id, season)
);

-- Game logs: individual game stats (last 30 games per player)
create table if not exists game_logs (
  id bigserial primary key,
  player_id bigint references players(id),
  game_id bigint,
  game_date date not null,
  season integer not null,
  team_abbreviation text,
  opponent_abbreviation text,
  home_away text,
  result text,
  minutes numeric(5,2),
  pts integer default 0,
  reb integer default 0,
  ast integer default 0,
  stl integer default 0,
  blk integer default 0,
  turnover integer default 0,
  fgm integer default 0,
  fga integer default 0,
  ftm integer default 0,
  fta integer default 0,
  fg3m integer default 0,
  fg3a integer default 0,
  fantasy_pts numeric(7,2) default 0,
  created_at timestamptz default now(),
  unique(player_id, game_date)
);

-- Scouting reports: AI-generated, cached per player
create table if not exists scouting_reports (
  id bigserial primary key,
  player_id bigint references players(id),
  report_text text not null,
  trend text check(trend in ('surging','slumping','stable','returning','new_role')),
  last_10_avg numeric(6,2),
  season_avg numeric(6,2),
  pct_change numeric(6,2),
  key_factors jsonb default '[]',
  generated_at timestamptz default now(),
  unique(player_id)
);

-- Sync log: tracks nightly job runs
create table if not exists sync_log (
  id bigserial primary key,
  started_at timestamptz default now(),
  finished_at timestamptz,
  players_updated integer default 0,
  game_logs_added integer default 0,
  reports_generated integer default 0,
  status text default 'running',
  error_message text
);

-- Indexes for fast lookups
create index if not exists idx_season_stats_player on season_stats(player_id);
create index if not exists idx_season_stats_season on season_stats(season);
create index if not exists idx_game_logs_player on game_logs(player_id);
create index if not exists idx_game_logs_date on game_logs(game_date desc);
create index if not exists idx_scouting_player on scouting_reports(player_id);
create index if not exists idx_players_name on players using gin(to_tsvector('english', full_name));

-- Enable Row Level Security (RLS) — read-only public access
alter table players enable row level security;
alter table season_stats enable row level security;
alter table game_logs enable row level security;
alter table scouting_reports enable row level security;
alter table sync_log enable row level security;

create policy "Public read access" on players for select using (true);
create policy "Public read access" on season_stats for select using (true);
create policy "Public read access" on game_logs for select using (true);
create policy "Public read access" on scouting_reports for select using (true);
create policy "Public read access" on sync_log for select using (true);
