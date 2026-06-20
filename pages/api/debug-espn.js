// pages/api/debug-espn.js
// Temporary diagnostic route to inspect ESPN's raw response shape
// Visit: /api/debug-espn?secret=hoops123

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET || 'hoops123'
  if (req.query.secret !== secret) return res.status(401).json({ error: 'Unauthorized' })

  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  }

  const season = req.query.season || 2026
  const url = `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=true&page=1&limit=3&sort=offensive.avgPoints:desc&season=${season}&seasontype=2`

  try {
    const r = await fetch(url, { headers: HEADERS })
    const status = r.status
    const text = await r.text()
    let json = null
    try { json = JSON.parse(text) } catch {}

    return res.status(200).json({
      requestedUrl: url,
      responseStatus: status,
      rawTextSample: text.substring(0, 500),
      parsedKeys: json ? Object.keys(json) : null,
      firstAthleteSample: json?.athletes?.[0] || null,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message, url })
  }
}
