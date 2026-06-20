// pages/api/players/search.js
import { supabase } from '../../../lib/supabase'
import { currentSeasonYear } from '../../../lib/nba-api'

export default async function handler(req, res) {
  const { q } = req.query
  if (!q || q.length < 2) return res.status(200).json([])
  const season = currentSeasonYear()

  const { data, error } = await supabase
    .from('players')
    .select(`
      id, full_name, team_abbreviation, position, age,
      season_stats!inner(
        fantasy_pts_per_game, proj_season_total, games_played,
        pts_per_game, reb_per_game, ast_per_game, stl_per_game,
        blk_per_game, injury_risk_score, season
      )
    `)
    .ilike('full_name', `%${q}%`)
    .eq('season_stats.season', season)
    .eq('is_active', true)
    .limit(10)

  if (error) return res.status(500).json({ error: error.message })

  const results = (data || []).map(p => ({
    id: p.id,
    name: p.full_name,
    team: p.team_abbreviation,
    position: p.position,
    age: p.age,
    fantasyPPG: p.season_stats?.[0]?.fantasy_pts_per_game || 0,
    projTotal: p.season_stats?.[0]?.proj_season_total || 0,
    gamesPlayed: p.season_stats?.[0]?.games_played || 0,
    injuryRisk: p.season_stats?.[0]?.injury_risk_score || 5,
    ptsPG: p.season_stats?.[0]?.pts_per_game || 0,
  }))

  return res.status(200).json(results)
}
