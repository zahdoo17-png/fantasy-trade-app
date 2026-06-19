// pages/api/cron/sync-stats.js
// Nightly NBA stats sync using official NBA stats API (no key needed)

import { getAdminClient } from '../../../lib/supabase'
import {
  getAllPlayersWithStats,
  getPlayerGameLogs,
  currentSeason,
  currentSeasonYear,
  sleep
} from '../../../lib/nba-api'
import {
  calcFantasyPPG,
  ageFactor,
  injuryRiskScore,
  gpFactor
} from '../../../lib/fantasy'

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET || 'hoops123'
  const isVercelCron = req.headers.authorization === `Bearer ${secret}`
  const isManual = req.query.secret === secret

  if (!isVercelCron && !isManual) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const db = getAdminClient()
  const season = currentSeason()
  const seasonYear = currentSeasonYear()
  const startedAt = new Date().toISOString()

  const { data: syncEntry } = await db
    .from('sync_log')
    .insert({ started_at: startedAt, status: 'running' })
    .select()
    .single()

  const syncId = syncEntry?.id
  let playersUpdated = 0
  let gameLogsAdded = 0

  try {
    console.log(`[SYNC] Starting sync for ${season}...`)

    const allStats = await getAllPlayersWithStats(season)
    console.log(`[SYNC] Got ${allStats.length} players from NBA API`)

    if (!allStats.length) {
      throw new Error('No player data returned from NBA API')
    }

    const prevSeason1 = `${seasonYear - 1}-${String(seasonYear).slice(2)}`
    const prevSeason2 = `${seasonYear - 2}-${String(seasonYear - 1).slice(2)}`

    const [prev1Stats, prev2Stats] = await Promise.all([
      getAllPlayersWithStats(prevSeason1),
      getAllPlayersWithStats(prevSeason2),
    ])

    const prevGP1 = Object.fromEntries(prev1Stats.map(s => [s.player_id, s.gp || 0]))
    const prevGP2 = Object.fromEntries(prev2Stats.map(s => [s.player_id, s.gp || 0]))

    const playerRows = allStats.map(s => ({
      id: parseInt(s.player_id),
      full_name: s.player_name,
      first_name: s.player_name?.split(' ')[0] || '',
      last_name: s.player_name?.split(' ').slice(1).join(' ') || '',
      team_abbreviation: s.team_abbreviation || 'FA',
      team_name: s.team_abbreviation || 'FA',
      position: s.player_position || 'N/A',
      age: parseInt(s.age) || 25,
      is_active: true,
      updated_at: new Date().toISOString()
    }))

    for (let i = 0; i < playerRows.length; i += 50) {
      await db.from('players').upsert(playerRows.slice(i, i + 50), { onConflict: 'id' })
    }
    console.log(`[SYNC] Upserted ${playerRows.length} players`)

    const statsRows = allStats
      .filter(s => parseInt(s.gp) > 0)
      .map(s => {
        const playerId = parseInt(s.player_id)
        const age = parseInt(s.age) || 25
        const gpCur = parseInt(s.gp) || 0
        const gpY1 = prevGP1[s.player_id] || 0
        const gpY2 = prevGP2[s.player_id] || 0

        const statLine = {
          fgm: parseFloat(s.fgm) || 0,
          fga: parseFloat(s.fga) || 0,
          ftm: parseFloat(s.ftm) || 0,
          fta: parseFloat(s.fta) || 0,
          fg3m: parseFloat(s.fg3m) || 0,
          reb: parseFloat(s.reb) || 0,
          ast: parseFloat(s.ast) || 0,
          stl: parseFloat(s.stl) || 0,
          blk: parseFloat(s.blk) || 0,
          to: parseFloat(s.tov) || 0,
          pts: parseFloat(s.pts) || 0,
        }

        const fpg = parseFloat(calcFantasyPPG(statLine).toFixed(2))
        const af = ageFactor(age)
        const risk = injuryRiskScore(gpCur, gpY1, gpY2)
        const gf = gpFactor(risk)
        const projTotal = parseFloat((fpg * af * gf * gpCur).toFixed(1))

        return {
          player_id: playerId,
          season: seasonYear,
          games_played: gpCur,
          pts_per_game: statLine.pts,
          reb_per_game: statLine.reb,
          ast_per_game: statLine.ast,
          stl_per_game: statLine.stl,
          blk_per_game: statLine.blk,
          to_per_game: statLine.to,
          fgm_per_game: statLine.fgm,
          fga_per_game: statLine.fga,
          fg_pct: parseFloat(s.fg_pct) || 0,
          ftm_per_game: statLine.ftm,
          fta_per_game: statLine.fta,
          ft_pct: parseFloat(s.ft_pct) || 0,
          fg3m_per_game: statLine.fg3m,
          fg3a_per_game: parseFloat(s.fg3a) || 0,
          min_per_game: parseFloat(s.min) || 0,
          fantasy_pts_per_game: fpg,
          proj_season_total: projTotal,
          injury_risk_score: risk,
          age_factor: parseFloat(af.toFixed(3)),
          gp_factor: parseFloat(gf.toFixed(3)),
          gp_season_minus1: gpY1,
          gp_season_minus2: gpY2,
          updated_at: new Date().toISOString()
        }
      })

    for (let i = 0; i < statsRows.length; i += 50) {
      await db.from('season_stats').upsert(statsRows.slice(i, i + 50), {
        onConflict: 'player_id,season'
      })
    }
    playersUpdated = statsRows.length
    console.log(`[SYNC] Updated ${playersUpdated} player stats`)

    const top100 = statsRows
      .sort((a, b) => b.proj_season_total - a.proj_season_total)
      .slice(0, 100)

    for (const player of top100) {
      try {
        const logs = await getPlayerGameLogs(player.player_id, season)
        if (!logs.length) continue

        const logRows = logs.slice(0, 15).map(g => ({
          player_id: player.player_id,
          game_date: g.game_date ? g.game_date.substring(0, 10) : new Date().toISOString().substring(0, 10),
          season: seasonYear,
          team_abbreviation: g.team_abbreviation || '',
          home_away: g.matchup?.includes('vs.') ? 'H' : 'A',
          minutes: parseFloat(g.min) || 0,
          pts: parseInt(g.pts) || 0,
          reb: parseInt(g.reb) || 0,
          ast: parseInt(g.ast) || 0,
          stl: parseInt(g.stl) || 0,
          blk: parseInt(g.blk) || 0,
          turnover: parseInt(g.tov) || 0,
          fgm: parseInt(g.fgm) || 0,
          fga: parseInt(g.fga) || 0,
          ftm: parseInt(g.ftm) || 0,
          fta: parseInt(g.fta) || 0,
          fg3m: parseInt(g.fg3m) || 0,
          fg3a: parseInt(g.fg3a) || 0,
          fantasy_pts: parseFloat(calcFantasyPPG({
            fgm: parseInt(g.fgm) || 0, fga: parseInt(g.fga) || 0,
            ftm: parseInt(g.ftm) || 0, fta: parseInt(g.fta) || 0,
            fg3m: parseInt(g.fg3m) || 0, reb: parseInt(g.reb) || 0,
            ast: parseInt(g.ast) || 0, stl: parseInt(g.stl) || 0,
            blk: parseInt(g.blk) || 0, to: parseInt(g.tov) || 0,
            pts: parseInt(g.pts) || 0,
          }).toFixed(2))
        }))

        if (logRows.length) {
          await db.from('game_logs').upsert(logRows, {
            onConflict: 'player_id,game_date',
            ignoreDuplicates: true
          })
          gameLogsAdded += logRows.length
        }
        await sleep(500)
      } catch (e) {
        console.warn(`[SYNC] Game log error for ${player.player_id}:`, e.message)
      }
    }

    console.log(`[SYNC] Added ${gameLogsAdded} game logs`)

    await db.from('sync_log').update({
      finished_at: new Date().toISOString(),
      players_updated: playersUpdated,
      game_logs_added: gameLogsAdded,
      status: 'success'
    }).eq('id', syncId)

    return res.status(200).json({
      success: true,
      season,
      playersUpdated,
      gameLogsAdded,
      duration: `${((Date.now() - new Date(startedAt).getTime()) / 1000).toFixed(1)}s`
    })

  } catch (error) {
    console.error('[SYNC] Error:', error)
    await db.from('sync_log').update({
      finished_at: new Date().toISOString(),
      status: 'error',
      error_message: error.message
    }).eq('id', syncId)
    return res.status(500).json({ error: error.message })
  }
}
