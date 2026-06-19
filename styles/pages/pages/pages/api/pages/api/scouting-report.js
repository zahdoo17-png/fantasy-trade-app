// pages/api/scouting-report.js
// Generates AI scouting report using Vercel AI SDK (free with Vercel account)
// Caches in Supabase for 24 hours

import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { getAdminClient, supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { playerId } = req.body
  if (!playerId) return res.status(400).json({ error: 'playerId required' })

  // Check cache first (valid for 24 hours)
  const { data: cached } = await supabase
    .from('scouting_reports')
    .select('*')
    .eq('player_id', playerId)
    .single()

  if (cached) {
    const age = Date.now() - new Date(cached.generated_at).getTime()
    if (age < 24 * 60 * 60 * 1000) {
      return res.status(200).json({ report: cached, cached: true })
    }
  }

  // Fetch player data
  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .single()

  if (!player) return res.status(404).json({ error: 'Player not found' })

  // Fetch season stats
  const { data: stats } = await supabase
    .from('season_stats')
    .select('*')
    .eq('player_id', playerId)
    .order('season', { ascending: false })
    .limit(1)
    .single()

  // Fetch last 10 game logs
  const { data: gameLogs } = await supabase
    .from('game_logs')
    .select('*')
    .eq('player_id', playerId)
    .order('game_date', { ascending: false })
    .limit(10)

  if (!stats) {
    return res.status(200).json({
      report: {
        player_id: playerId,
        report_text: `${player.full_name} is a ${player.position} for the ${player.team_name}. Detailed stats are still loading — check back after tonight's sync.`,
        trend: 'stable',
        last_10_avg: null,
        season_avg: null,
        pct_change: 0,
        key_factors: [],
        generated_at: new Date().toISOString()
      },
      cached: false
    })
  }

  // Calculate last 10 game average
  const last10Avg = gameLogs?.length
    ? parseFloat((gameLogs.reduce((s, g) => s + (g.fantasy_pts || 0), 0) / gameLogs.length).toFixed(1))
    : null

  const seasonAvg = stats.fantasy_pts_per_game
  const pctChange = last10Avg && seasonAvg
    ? parseFloat((((last10Avg - seasonAvg) / seasonAvg) * 100).toFixed(1))
    : 0

  // Determine trend
  let trend = 'stable'
  if (pctChange > 15) trend = 'surging'
  else if (pctChange < -15) trend = 'slumping'

  const recentGamesStr = gameLogs?.length
    ? gameLogs.slice(0, 5).map(g =>
        `${g.game_date}: ${g.pts}pts/${g.reb}reb/${g.ast}ast/${g.stl}stl/${g.blk}blk (${g.fantasy_pts?.toFixed(1)} fpts)`
      ).join('\n')
    : 'No recent game data available'

  const prompt = `You are a fantasy basketball analyst. Write a concise scouting report for a trade analyzer.

Player: ${player.full_name}
Team: ${player.team_name} (${player.team_abbreviation})
Position: ${player.position}
Age: ${player.age || 'Unknown'}

SEASON STATS (${stats.season}-${(stats.season + 1).toString().slice(2)}):
- Games Played: ${stats.games_played}
- PPG: ${stats.pts_per_game} | RPG: ${stats.reb_per_game} | APG: ${stats.ast_per_game}
- SPG: ${stats.stl_per_game} | BPG: ${stats.blk_per_game} | TO: ${stats.to_per_game}
- FG%: ${(stats.fg_pct * 100).toFixed(1)}% | FT%: ${(stats.ft_pct * 100).toFixed(1)}%
- Fantasy Pts/G: ${stats.fantasy_pts_per_game}
- Injury Risk: ${stats.injury_risk_score}/10 (GP last 3 seasons: ${stats.games_played}, ${stats.gp_season_minus1}, ${stats.gp_season_minus2})

LAST 5 GAMES:
${recentGamesStr}

Last 10 avg: ${last10Avg || 'N/A'} fpts/g vs season avg: ${seasonAvg} fpts/g (${pctChange > 0 ? '+' : ''}${pctChange}%)

Write 3-4 sentences:
1. Most important thing to know RIGHT NOW for fantasy
2. Explain any surge/slump (injury on team, new role, trade, schedule)
3. Clear buy/sell/hold recommendation
4. Flag injury risk if score below 7

Be direct. Present tense. Do not start with the player's name.`

  try {
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      prompt,
      maxTokens: 300,
    })

    const reportText = text

    const keyFactors = []
    if (reportText.toLowerCase().includes('injur')) keyFactors.push('injury')
    if (reportText.toLowerCase().includes('trade')) keyFactors.push('team_change')
    if (reportText.toLowerCase().includes('role') || reportText.toLowerCase().includes('usage')) keyFactors.push('role_change')
    if (reportText.toLowerCase().includes('hot') || reportText.toLowerCase().includes('streak')) keyFactors.push('hot_streak')
    if (reportText.toLowerCase().includes('slump') || reportText.toLowerCase().includes('cold')) keyFactors.push('cold_streak')
    if (reportText.toLowerCase().includes('schedule')) keyFactors.push('schedule')

    const report = {
      player_id: playerId,
      report_text: reportText,
      trend,
      last_10_avg: last10Avg,
      season_avg: seasonAvg,
      pct_change: pctChange,
      key_factors: keyFactors,
      generated_at: new Date().toISOString()
    }

    const db = getAdminClient()
    await db.from('scouting_reports').upsert(report, { onConflict: 'player_id' })

    return res.status(200).json({ report, cached: false })

  } catch (error) {
    console.error('AI error:', error)
    return res.status(500).json({ error: 'Failed to generate report' })
  }
}
