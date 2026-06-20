// lib/nba-api.js
// balldontlie.io — free NBA stats API (requires API key)

const BASE = 'https://api.balldontlie.io/v1'

function getHeaders() {
  const key = process.env.BALLDONTLIE_API_KEY
  if (!key) throw new Error('Missing BALLDONTLIE_API_KEY environment variable')
  return { Authorization: key }
}

async function fetchBDL(path, params = {}) {
  const url = new URL(`${BASE}${path}`)
  Object.entries(params).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach(val => url.searchParams.append(k, val))
    else url.searchParams.set(k, v)
  })
  const res = await fetch(url.toString(), { headers: getHeaders() })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`BDL API error ${res.status}: ${path} ${text}`)
  }
  return res.json()
}

export function currentSeason() {
  const now = new Date()
  const month = now.getMonth() + 1
  return month >= 10 ? now.getFullYear() : now.getFullYear() - 1
}

export function currentSeasonYear() {
  return currentSeason()
}

export async function getAllPlayers() {
  const players = []
  let cursor = null
  let pages = 0
  do {
    const params = { per_page: 100 }
    if (cursor) params.cursor = cursor
    const data = await fetchBDL('/players/active', params)
    players.push(...(data.data || []))
    cursor = data.meta?.next_cursor
    pages++
    if (pages > 10) break // safety cap (~1000 players)
  } while (cursor)
  return players
}

export async function getSeasonAverages(playerIds, season) {
  if (!playerIds.length) return []
  const chunks = []
  for (let i = 0; i < playerIds.length; i += 100) {
    chunks.push(playerIds.slice(i, i + 100))
  }
  const results = []
  for (const chunk of chunks) {
    try {
      const data = await fetchBDL('/season_averages', { season, player_ids: chunk })
      results.push(...(data.data || []))
    } catch (e) {
      console.warn('Season averages chunk failed:', e.message)
    }
    await sleep(300)
  }
  return results
}

export async function getRecentGamesWithStats(playerId, season, count = 15) {
  try {
    const data = await fetchBDL('/stats', {
      player_ids: [playerId],
      seasons: [season],
      per_page: count,
      sort_by: 'date',
      direction: 'desc'
    })
    return data.data || []
  } catch {
    return []
  }
}

// Maps balldontlie field names to our expected format
export function mapBDLStatsToStandard(s) {
  return {
    player_id: s.player_id || s.player?.id,
    gp: s.games_played,
    age: s.player?.age,
    team_abbreviation: s.team?.abbreviation || s.player?.team?.abbreviation,
    player_position: s.player?.position,
    player_name: s.player ? `${s.player.first_name} ${s.player.last_name}` : undefined,
    pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, tov: s.turnover,
    fgm: s.fgm, fga: s.fga, fg_pct: s.fg_pct,
    ftm: s.ftm, fta: s.fta, ft_pct: s.ft_pct,
    fg3m: s.fg3m, fg3a: s.fg3a,
    min: s.min,
  }
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
