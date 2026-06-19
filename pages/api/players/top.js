// pages/api/players/top.js
import { supabase } from '../../../lib/supabase'
import { currentSeasonYear } from '../../../lib/nba-api'

export default async function handler(req, res) {
  const season = currentSeasonYear()
  const limit = parseInt(req.query.limit || '200')

  const { data, error } = await supabase
    .from('season_stats')
    .select(`
      player_id, season, fantasy_pts_per_game, proj_season_total,
      games_played, pts_per_game, reb_per_game, ast_per_game,
      stl_per_game, blk_per_game, to_per_game, injury_risk_score,
      players!inner(full_name, team_abbreviation, position, age, is_active)
    `)
    .eq('season', season)
    .gt('games_played', 0)
    .order('proj_season_total', { ascending: false })
    .limit(limit)

  if (error) return res.status(500).json({ error: error.message })

  const results = (data || []).map(s => ({
    id: s.player_id,
    name: s.players?.full_name || 'Unknown',
    team: s.players?.team_abbreviation || 'FA',
    position: s.players?.position || 'N/A',
    age: s.players?.age || 0,
    fantasyPPG: s.fantasy_pts_per_game,
    projTotal: s.proj_season_total,
    gamesPlayed: s.games_played,
    ptsPG: s.pts_per_game,
    rebPG: s.reb_per_game,
    astPG: s.ast_per_game,
    stlPG: s.stl_per_game,
    blkPG: s.blk_per_game,
    toPG: s.to_per_game,
    injuryRisk: s.injury_risk_score,
  }))

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
  return res.status(200).json(results)
}
