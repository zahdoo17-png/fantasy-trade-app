// pages/api/cron/sync-stats.js
// Nightly NBA stats sync using balldontlie.io

import { getAdminClient } from '../../../lib/supabase'
import {
  getAllPlayers,
  getSeasonAverages,
  getRecentGamesWithStats,
  currentSeason,
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
    console.log(`[SYNC] Starting sync for ${season} season...`)

    const players = await getAllPlayers()
    console.log(`[SYNC] Got ${players.length} active players`)

    if (!players.length) {
      throw new Error('No players returned from balldontlie API')
    }

    const playerRows = players.map(p => ({
      id: p.id,
      full_name: `${p.first_name} ${p.last_name}`,
      first_name: p.first_name,
      last_name: p.last_name,
      team_id: p.team?.id || null,
      team_abbreviation: p.team?.abbreviation || 'FA',
      team_name: p.team?.full_name || 'Free Agent',
      position: p.position || 'N/A',
      height: p.height || null,
      weight: p.weight || null,
      jersey_number: p.jersey_number || null,
      is_active: true,
      updated_at: new Date().toISOString()
    }))

    for (let i = 0; i < playerRows.length; i += 50) {
      await db.from('players').upsert(playerRows.slice(i, i + 50), { onConflict: 'id' })
    }
    console.log(`[SYNC] Upserted ${playerRows.length} players`)

    const playerIds = players.map(p => p.id)
    const seasonAvgs = await getSeasonAverages(playerIds, season)
    console.log(`[SYNC] Got averages for ${seasonAvgs.length} players`)

    const prevSeason1 = season - 1
    const prevSeason2 = season - 2
    const [prevAvgs1, prevAvgs2] = await Promise.all([
      getSeasonAverages(playerIds.slice(0, 200), prevSeason1),
      getSeasonAverages(playerIds.slice(0, 200), prevSeason2)
    ])

    const prevGPMap1 = Object.fromEntries(prevAvgs1.map(s => [s.player_id, s.games_played]))
    const prevGPMap2 = Object.fromEntries(prevAvgs2.map(s => [s.player_id, s.games_played]))
    const playerAgeMap = Object.fromEntries(players.map(p => [p.id, p.age || 25]))

    const statsRows = seasonAvgs
      .filter(s => s.games_played > 0)
      .map(s => {
        const age = playerAgeMap[s.player_id] || 25
        const gpCur = s.games_played || 0
        const gpY1 = prevGPMap1[s.player_id] || 0
        const gpY2 = prevGPMap2[s.player_id] || 0

        const statLine = {
          fgm: s.fgm || 0, fga: s.fga || 0,
          ftm: s.ftm || 0, fta: s.fta || 0,
          fg3m: s.fg3m || 0,
          reb: s.reb || 0, ast: s.ast || 0,
          stl: s.stl || 0, blk: s.blk || 0,
          to: s.turnover || 0, pts: s.pts || 0
        }

        const fpg = parseFloat(calcFantasyPPG(statLine).toFixed(2))
        const af = ageFactor(age)
        const risk = injuryRiskScore(gpCur, gpY1, gpY2)
        const gf = gpFactor(risk)
        const projTotal = parseFloat((fpg * af * gf * gpCur).toFixed(1))

        return {
          player_id: s.player_id,
          season,
          games_played: gpCur,
          pts_per_game: s.pts || 0,
          reb_per_game: s.reb || 0,
          ast_per_game: s.ast || 0,
          stl_per_game: s.stl || 0,
          blk_per_game: s.blk || 0,
          to_per_game: s.turnover || 0,
          fgm_per_game: s.fgm || 0,
          fga_per_game: s.fga || 0,
          fg_pct: s.fg_pct || 0,
          ftm_per_game: s.ftm || 0,
          fta_per_game: s.fta || 0,
          ft_pct: s.ft_pct || 0,
          fg3m_per_game: s.fg3m || 0,
          fg3a_per_game: s.fg3a || 0,
          min_per_game: s.min ? parseFloat(s.min) : 0,
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
    console.log(`[SYNC] Updated stats for ${playersUpdated} players`)

    const topPlayers = statsRows
      .sort((a, b) => b.proj_season_total - a.proj_season_total)
      .slice(0, 150)

    for (const player of topPlayers) {
      try {
        const recentGames = await getRecentGamesWithStats(player.player_id, season, 15)
        if (!recentGames.length) continue

        const logRows = recentGames
          .filter(g => g.min && parseFloat(g.min) > 0)
          .map(g => {
            const statLine = {
              fgm: g.fgm || 0, fga: g.fga || 0,
              ftm: g.ftm || 0, fta: g.fta || 0,
              fg3m: g.fg3m || 0, reb: g.reb || 0,
              ast: g.ast || 0, stl: g.stl || 0,
              blk: g.blk || 0, to: g.turnover || 0,
              pts: g.pts || 0
            }
            const fp = parseFloat(calcFantasyPPG(statLine).toFixed(2))
            const game = g.game || {}
            const isHome = game.home_team_id === g.team?.id

            return {
              player_id: player.player_id,
              game_id: g.game?.id || null,
              game_date: game.date ? game.date.substring(0, 10) : new Date().toISOString().substring(0, 10),
              season,
              team_abbreviation: g.team?.abbreviation || '',
              home_away: isHome ? 'H' : 'A',
              minutes: g.min ? parseFloat(g.min) : 0,
              pts: g.pts || 0,
              reb: g.reb || 0,
              ast: g.ast || 0,
              stl: g.stl || 0,
              blk: g.blk || 0,
              turnover: g.turnover || 0,
              fgm: g.fgm || 0,
              fga: g.fga || 0,
              ftm: g.ftm || 0,
              fta: g.fta || 0,
              fg3m: g.fg3m || 0,
              fg3a: g.fg3a || 0,
              fantasy_pts: fp
            }
          })

        if (logRows.length) {
          await db.from('game_logs').upsert(logRows, { onConflict: 'player_id,game_date', ignoreDuplicates: true })
          gameLogsAdded += logRows.length
        }
        await sleep(200)
      } catch (e) {
        console.warn(`[SYNC] Game log error for player ${player.player_id}:`, e.message)
      }
    }

    console.log(`[SYNC] Added ${gameLogsAdded} game log entries`)

    await db.from('sync_log').update({
      finished_at: new Date().toISOString(),
      players_updated: playersUpdated,
      game_logs_added: gameLogsAdded,
      status: 'success'
    }).eq('id', syncId)

    console.log('[SYNC] Nightly sync complete!')
    return res.status(200).json({
      success: true,
      season,
      playersUpdated,
      gameLogsAdded,
      duration: `${((Date.now() - new Date(startedAt).getTime()) / 1000).toFixed(1)}s`
    })

  } catch (error) {
    console.error('[SYNC] Fatal error:', error)
    await db.from('sync_log').update({
      finished_at: new Date().toISOString(),
      status: 'error',
      error_message: error.message
    }).eq('id', syncId)

    return res.status(500).json({ error: error.message })
  }
}
