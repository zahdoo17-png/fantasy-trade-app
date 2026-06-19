// lib/nba-api.js
// Uses nba-api-free (unofficial NBA stats) — no API key required

const NBA_BASE = 'https://stats.nba.com/stats'

const NBA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.nba.com/',
  'Origin': 'https://www.nba.com',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
}

export function currentSeason() {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = month >= 10 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-${String(year + 1).slice(2)}`
}

export function currentSeasonYear() {
  const now = new Date()
  const month = now.getMonth() + 1
  return month >= 10 ? now.getFullYear() : now.getFullYear() - 1
}

async function fetchNBA(endpoint, params = {}) {
  const url = new URL(`${NBA_BASE}/${endpoint}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: NBA_HEADERS,
    next: { revalidate: 0 }
  })
  if (!res.ok) throw new Error(`NBA API error ${res.status}: ${endpoint}`)
  return res.json()
}

function parseResultSet(data) {
  const rs = data?.resultSets?.[0] || data?.resultSet
  if (!rs) return []
  const headers = rs.headers.map(h => h.toLowerCase())
  return rs.rowSet.map(row => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = row[i] })
    return obj
  })
}

// Fetch all players with season averages in one call
export async function getAllPlayersWithStats(season) {
  try {
    const data = await fetchNBA('leaguedashplayerstats', {
      Season: season,
      SeasonType: 'Regular Season',
      PerMode: 'PerGame',
      LeagueID: '00',
      MeasureType: 'Base',
      PaceAdjust: 'N',
      PlusMinus: 'N',
      Rank: 'N',
      Outcome: '',
      Location: '',
      Month: '0',
      SeasonSegment: '',
      DateFrom: '',
      DateTo: '',
      OpponentTeamID: '0',
      VsConference: '',
      VsDivision: '',
      GameSegment: '',
      Period: '0',
      LastNGames: '0',
      GameScope: '',
      PlayerExperience: '',
      PlayerPosition: '',
      StarterBench: '',
      DraftYear: '',
      DraftPick: '',
      College: '',
      Country: '',
      Height: '',
      Weight: '',
      TwoWay: '',
    })
    return parseResultSet(data)
  } catch (e) {
    console.error('NBA stats fetch error:', e.message)
    return []
  }
}

// Fetch recent game logs for a player
export async function getPlayerGameLogs(playerId, season) {
  try {
    const data = await fetchNBA('playergamelog', {
      PlayerID: playerId,
      Season: season,
      SeasonType: 'Regular Season',
      LeagueID: '00',
    })
    return parseResultSet(data)
  } catch (e) {
    console.error(`Game log error player ${playerId}:`, e.message)
    return []
  }
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
