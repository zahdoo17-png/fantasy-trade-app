// pages/index.js
import { useState, useEffect, useCallback, useRef } from 'react'
import Head from 'next/head'
import { tradeVerdict } from '../lib/fantasy'

export default function Home() {
  const [players, setPlayers] = useState([])
  const [sideA, setSideA] = useState([])
  const [sideB, setSideB] = useState([])
  const [searchA, setSearchA] = useState('')
  const [searchB, setSearchB] = useState('')
  const [suggestionsA, setSuggestionsA] = useState([])
  const [suggestionsB, setSuggestionsB] = useState([])
  const [scoutingReports, setScoutingReports] = useState({})
  const [loadingReports, setLoadingReports] = useState({})
  const [lastSync, setLastSync] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const searchTimerA = useRef(null)
  const searchTimerB = useRef(null)

  // Load top players on mount
  useEffect(() => {
    fetch('/api/players/top?limit=200')
      .then(r => r.json())
      .then(data => {
        setPlayers(Array.isArray(data) ? data : [])
        setIsLoading(false)
      })
      .catch(() => setIsLoading(false))
  }, [])

  // Debounced search
  const handleSearch = useCallback((q, side) => {
    if (q.length < 2) {
      side === 'a' ? setSuggestionsA([]) : setSuggestionsB([])
      return
    }
    // Filter from loaded players first (fast), fallback to API
    const local = players
      .filter(p => p.name.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 8)
    if (local.length >= 3) {
      side === 'a' ? setSuggestionsA(local) : setSuggestionsB(local)
      return
    }
    fetch(`/api/players/search?q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(data => side === 'a' ? setSuggestionsA(data) : setSuggestionsB(data))
      .catch(() => {})
  }, [players])

  useEffect(() => {
    clearTimeout(searchTimerA.current)
    searchTimerA.current = setTimeout(() => handleSearch(searchA, 'a'), 200)
  }, [searchA, handleSearch])

  useEffect(() => {
    clearTimeout(searchTimerB.current)
    searchTimerB.current = setTimeout(() => handleSearch(searchB, 'b'), 200)
  }, [searchB, handleSearch])

  const addPlayer = (player, side) => {
    if (side === 'a') {
      if (!sideA.find(p => p.id === player.id)) setSideA(prev => [...prev, player])
      setSearchA(''); setSuggestionsA([])
    } else {
      if (!sideB.find(p => p.id === player.id)) setSideB(prev => [...prev, player])
      setSearchB(''); setSuggestionsB([])
    }
    // Fetch scouting report for this player
    fetchScoutingReport(player.id)
  }

  const removePlayer = (playerId, side) => {
    if (side === 'a') setSideA(prev => prev.filter(p => p.id !== playerId))
    else setSideB(prev => prev.filter(p => p.id !== playerId))
  }

  const fetchScoutingReport = async (playerId) => {
    if (scoutingReports[playerId] || loadingReports[playerId]) return
    setLoadingReports(prev => ({ ...prev, [playerId]: true }))
    try {
      const res = await fetch('/api/scouting-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId })
      })
      const data = await res.json()
      if (data.report) {
        setScoutingReports(prev => ({ ...prev, [playerId]: data.report }))
      }
    } catch (e) {}
    setLoadingReports(prev => ({ ...prev, [playerId]: false }))
  }

  const totalA = sideA.reduce((s, p) => s + (p.projTotal || 0), 0)
  const totalB = sideB.reduce((s, p) => s + (p.projTotal || 0), 0)
  const hasPlayers = sideA.length > 0 || sideB.length > 0
  const verdict = hasPlayers ? tradeVerdict(totalA, totalB) : null

  const barPctA = (totalA + totalB) > 0 ? (totalA / (totalA + totalB)) * 100 : 50

  return (
    <>
      <Head>
        <title>Fantasy Basketball Trade Analyzer</title>
        <meta name="description" content="Real-time NBA fantasy basketball trade analyzer with AI scouting reports" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css" />
      </Head>

      <div className="page">
        <header className="header">
          <div className="header-inner">
            <div className="logo">
              <span className="logo-icon">🏀</span>
              <div>
                <h1>Fantasy Trade Analyzer</h1>
                <p className="header-sub">Live NBA stats · Updated nightly · AI scouting reports</p>
              </div>
            </div>
            {isLoading && <div className="loading-badge"><i className="ti ti-loader-2 spin"></i> Loading stats...</div>}
            {!isLoading && players.length > 0 && (
              <div className="sync-badge"><i className="ti ti-check"></i> {players.length} players loaded</div>
            )}
          </div>
        </header>

        <main className="main">
          {/* Trade panels */}
          <div className="panels">
            <TradePanel
              title="You give" side="a" icon="ti-arrow-up-right" color="blue"
              search={searchA} setSearch={setSearchA}
              suggestions={suggestionsA} setSuggestions={setSuggestionsA}
              players={sideA} onAdd={p => addPlayer(p, 'a')} onRemove={id => removePlayer(id, 'a')}
              total={totalA} scoutingReports={scoutingReports} loadingReports={loadingReports}
            />
            <TradePanel
              title="You receive" side="b" icon="ti-arrow-down-left" color="orange"
              search={searchB} setSearch={setSearchB}
              suggestions={suggestionsB} setSuggestions={setSuggestionsB}
              players={sideB} onAdd={p => addPlayer(p, 'b')} onRemove={id => removePlayer(id, 'b')}
              total={totalB} scoutingReports={scoutingReports} loadingReports={loadingReports}
            />
          </div>

          {/* Verdict */}
          {hasPlayers && verdict && (
            <div className="verdict-card">
              <div className="scale-row">
                <div className="scale-side">
                  <div className="scale-label">You give</div>
                  <div className="scale-num blue">{totalA.toLocaleString()}</div>
                </div>
                <div className="bar-wrap">
                  <div className="bar-bg">
                    <div
                      className={`bar-fill ${verdict.verdict}`}
                      style={{ width: `${barPctA}%` }}
                    />
                  </div>
                  <div className="bar-labels">
                    <span>{Math.round(barPctA)}%</span>
                    <span>{Math.round(100 - barPctA)}%</span>
                  </div>
                </div>
                <div className="scale-side">
                  <div className="scale-label">You receive</div>
                  <div className="scale-num orange">{totalB.toLocaleString()}</div>
                </div>
              </div>

              <div className={`verdict-box ${verdict.verdict}`}>
                <i className={`ti verdict-icon ${
                  verdict.verdict === 'fair' ? 'ti-circle-check' :
                  verdict.verdict === 'win' ? 'ti-trending-up' : 'ti-trending-down'
                }`}></i>
                <div>
                  <div className="verdict-main">{verdict.label}</div>
                  <div className="verdict-detail">
                    {verdict.verdict === 'fair'
                      ? `Values are within ${verdict.diffPct.toFixed(1)}% — this is a balanced deal.`
                      : verdict.verdict === 'win'
                      ? `You receive ${verdict.diffPct.toFixed(1)}% more value — a ${verdict.strength} win.`
                      : `You give away ${verdict.diffPct.toFixed(1)}% more value — ${verdict.diffPct > 25 ? 'decline this' : 'consider negotiating'}.`
                    }
                  </div>
                </div>
              </div>

              <p className="scoring-note">
                Scoring: FGM+2 · AST+2 · STL+4 · BLK+4 · PTS+1 · 3PM+1 · REB+1 · FTM+1 · DD+3 · TD+5 · TO−2 · FGA−1 · FTA−1
              </p>
            </div>
          )}

          {!hasPlayers && (
            <div className="empty-hero">
              <div className="empty-icon">🏀</div>
              <h2>Add players to analyze a trade</h2>
              <p>Search for players on each side. AI scouting reports will explain recent surges, slumps, injuries, and role changes.</p>
            </div>
          )}
        </main>

        <footer className="footer">
          Stats via balldontlie.io · Updated nightly at 2am ET · AI reports powered by Claude
        </footer>
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #0a1628;
          color: #e2eaf4;
          min-height: 100vh;
        }
        .spin { animation: spin 1s linear infinite; display: inline-block; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      <style jsx>{`
        .page { min-height: 100vh; display: flex; flex-direction: column; }
        .header { background: #0f1e35; border-bottom: 1px solid #1e3050; padding: 1rem 1.5rem; }
        .header-inner { max-width: 900px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
        .logo { display: flex; align-items: center; gap: 12px; }
        .logo-icon { font-size: 28px; }
        h1 { font-size: 20px; font-weight: 600; color: #fff; }
        .header-sub { font-size: 12px; color: #6a8aaa; margin-top: 1px; }
        .loading-badge { font-size: 12px; color: #6a8aaa; display: flex; align-items: center; gap: 5px; }
        .sync-badge { font-size: 12px; color: #4caf50; display: flex; align-items: center; gap: 5px; }
        .main { flex: 1; max-width: 900px; margin: 0 auto; width: 100%; padding: 1.5rem; }
        .panels { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 1.25rem; }
        @media(max-width: 600px) { .panels { grid-template-columns: 1fr; } }
        .verdict-card { background: #0f1e35; border: 1px solid #1e3050; border-radius: 14px; padding: 1.5rem; }
        .scale-row { display: flex; align-items: center; gap: 14px; margin-bottom: 1.25rem; }
        .scale-side { text-align: center; min-width: 80px; }
        .scale-label { font-size: 11px; color: #6a8aaa; margin-bottom: 3px; }
        .scale-num { font-size: 22px; font-weight: 700; }
        .scale-num.blue { color: #5ba3f5; }
        .scale-num.orange { color: #f5834a; }
        .bar-wrap { flex: 1; }
        .bar-bg { height: 10px; background: #0a1628; border-radius: 5px; overflow: hidden; border: 1px solid #1e3050; }
        .bar-fill { height: 100%; border-radius: 5px; transition: width .5s ease; }
        .bar-fill.fair { background: #4caf50; }
        .bar-fill.win { background: #5ba3f5; }
        .bar-fill.lose { background: #f5834a; }
        .bar-labels { display: flex; justify-content: space-between; font-size: 11px; color: #6a8aaa; margin-top: 3px; }
        .verdict-box { display: flex; align-items: flex-start; gap: 12px; padding: 1rem 1.25rem; border-radius: 11px; margin-bottom: .75rem; }
        .verdict-box.fair { background: rgba(76,175,80,.1); border: 1px solid rgba(76,175,80,.3); }
        .verdict-box.win { background: rgba(91,163,245,.1); border: 1px solid rgba(91,163,245,.3); }
        .verdict-box.lose { background: rgba(245,131,74,.1); border: 1px solid rgba(245,131,74,.3); }
        .verdict-icon { font-size: 22px; margin-top: 1px; }
        .verdict-box.fair .verdict-icon { color: #4caf50; }
        .verdict-box.win .verdict-icon { color: #5ba3f5; }
        .verdict-box.lose .verdict-icon { color: #f5834a; }
        .verdict-main { font-size: 15px; font-weight: 600; color: #fff; }
        .verdict-detail { font-size: 13px; color: #8aaccc; margin-top: 3px; }
        .scoring-note { font-size: 11px; color: #3a5a7a; text-align: center; line-height: 1.6; }
        .empty-hero { text-align: center; padding: 4rem 2rem; }
        .empty-icon { font-size: 48px; margin-bottom: 1rem; }
        .empty-hero h2 { font-size: 20px; color: #c0d4ea; margin-bottom: .5rem; }
        .empty-hero p { font-size: 14px; color: #6a8aaa; max-width: 420px; margin: 0 auto; line-height: 1.6; }
        .footer { text-align: center; padding: 1.5rem; font-size: 12px; color: #3a5a7a; border-top: 1px solid #1e3050; }
      `}</style>
    </>
  )
}

function TradePanel({ title, side, icon, color, search, setSearch, suggestions, setSuggestions, players, onAdd, onRemove, total, scoutingReports, loadingReports }) {
  const inputRef = useRef(null)
  const [focused, setFocused] = useState(false)

  return (
    <div className={`panel panel-${color}`}>
      <div className="panel-title">
        <i className={`ti ${icon}`}></i> {title}
        {total > 0 && <span className="panel-total">{total.toLocaleString()} pts</span>}
      </div>

      <div className="search-wrap">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => { setFocused(false); setSuggestions([]) }, 150)}
          placeholder="Search player..."
          className={`search-input ${color}`}
        />
        {suggestions.length > 0 && focused && (
          <div className="suggestions">
            {suggestions.map(p => (
              <div key={p.id} className="sug-item" onMouseDown={() => onAdd(p)}>
                <div className="sug-left">
                  <span className="sug-name">{p.name}</span>
                  <span className="sug-meta">{p.team} · {p.position} · {p.ptsPG?.toFixed(1)}pts</span>
                </div>
                <div className="sug-right">
                  <span className="sug-pts">{(p.projTotal || 0).toLocaleString()}</span>
                  <span className="sug-pts-label">proj pts</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="players-list">
        {players.length === 0 ? (
          <div className="empty-state">Search and add players above</div>
        ) : (
          players.map(p => (
            <PlayerChip
              key={p.id} player={p} side={side} onRemove={onRemove}
              report={scoutingReports[p.id]} loadingReport={loadingReports[p.id]}
            />
          ))
        )}
      </div>

      <style jsx>{`
        .panel { background: #0f1e35; border: 1px solid #1e3050; border-radius: 14px; padding: 1.25rem; }
        .panel-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
        .panel-blue .panel-title { color: #5ba3f5; }
        .panel-orange .panel-title { color: #f5834a; }
        .panel-total { margin-left: auto; font-size: 12px; font-weight: 700; }
        .search-wrap { position: relative; margin-bottom: 10px; }
        .search-input { width: 100%; padding: 9px 12px; background: #0a1628; border: 1px solid #1e3050; border-radius: 9px; color: #e2eaf4; font-size: 13px; outline: none; transition: border-color .15s; }
        .search-input.blue:focus { border-color: #5ba3f5; box-shadow: 0 0 0 2px rgba(91,163,245,.12); }
        .search-input.orange:focus { border-color: #f5834a; box-shadow: 0 0 0 2px rgba(245,131,74,.12); }
        .suggestions { position: absolute; top: 100%; left: 0; right: 0; background: #0f1e35; border: 1px solid #1e3050; border-radius: 9px; z-index: 20; max-height: 220px; overflow-y: auto; margin-top: 3px; box-shadow: 0 8px 24px rgba(0,0,0,.5); }
        .sug-item { padding: 9px 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e3050; }
        .sug-item:last-child { border-bottom: none; }
        .sug-item:hover { background: #162840; }
        .sug-name { display: block; font-size: 13px; font-weight: 500; color: #e2eaf4; }
        .sug-meta { display: block; font-size: 11px; color: #6a8aaa; margin-top: 1px; }
        .sug-right { text-align: right; }
        .sug-pts { display: block; font-size: 13px; font-weight: 700; color: #e2eaf4; }
        .sug-pts-label { display: block; font-size: 10px; color: #6a8aaa; }
        .players-list { display: flex; flex-direction: column; gap: 8px; min-height: 72px; }
        .empty-state { display: flex; align-items: center; justify-content: center; min-height: 72px; font-size: 13px; color: #3a5a7a; border: 1px dashed #1e3050; border-radius: 9px; }
      `}</style>
    </div>
  )
}

function PlayerChip({ player, side, onRemove, report, loadingReport }) {
  const [expanded, setExpanded] = useState(false)

  const trendColor = !report ? '' :
    report.trend === 'surging' ? '#4caf50' :
    report.trend === 'slumping' ? '#f5834a' : '#6a8aaa'

  const trendIcon = !report ? '' :
    report.trend === 'surging' ? 'ti-trending-up' :
    report.trend === 'slumping' ? 'ti-trending-down' : 'ti-minus'

  const riskColor = player.injuryRisk >= 8.5 ? '#4caf50' : player.injuryRisk >= 6.5 ? '#f5a623' : '#f5834a'

  return (
    <div className="chip">
      <div className="chip-main">
        <div className="chip-info">
          <div className="chip-name-row">
            <span className="chip-name">{player.name}</span>
            {report && <i className={`ti ${trendIcon}`} style={{ color: trendColor, fontSize: 13 }}></i>}
          </div>
          <div className="chip-meta">
            {player.team} · {player.position} · Age {player.age}
            <span className="risk-badge" style={{ color: riskColor }}>
              <i className="ti ti-heart-rate-monitor"></i> {player.injuryRisk?.toFixed(1)}/10
            </span>
          </div>
        </div>
        <div className="chip-right">
          <div className="chip-pts">{(player.projTotal || 0).toLocaleString()}</div>
          <div className="chip-pts-label">{(player.fantasyPPG || 0).toFixed(1)}/g</div>
        </div>
        <button className="chip-expand" onClick={() => setExpanded(!expanded)} title="Scouting report">
          <i className={`ti ${expanded ? 'ti-chevron-up' : 'ti-chevron-down'}`}></i>
        </button>
        <button className="chip-remove" onClick={() => onRemove(player.id)}>
          <i className="ti ti-x"></i>
        </button>
      </div>

      {expanded && (
        <div className="scout-section">
          {loadingReport ? (
            <div className="scout-loading"><i className="ti ti-loader-2 spin"></i> Generating AI scouting report...</div>
          ) : report ? (
            <>
              <div className="scout-stats">
                <div className="scout-stat">
                  <span className="ss-label">Season avg</span>
                  <span className="ss-val">{report.season_avg?.toFixed(1) || '—'} fpts/g</span>
                </div>
                {report.last_10_avg && (
                  <div className="scout-stat">
                    <span className="ss-label">Last 10 avg</span>
                    <span className="ss-val" style={{ color: trendColor }}>{report.last_10_avg?.toFixed(1)} fpts/g</span>
                  </div>
                )}
                {report.pct_change !== 0 && (
                  <div className="scout-stat">
                    <span className="ss-label">vs season</span>
                    <span className="ss-val" style={{ color: trendColor }}>
                      {report.pct_change > 0 ? '+' : ''}{report.pct_change?.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
              <p className="scout-report">{report.report_text}</p>
              <p className="scout-time">Generated {new Date(report.generated_at).toLocaleDateString()}</p>
            </>
          ) : (
            <div className="scout-loading">No report available yet. Stats sync runs nightly.</div>
          )}
        </div>
      )}

      <style jsx>{`
        .chip { background: #0a1628; border: 1px solid #1e3050; border-radius: 10px; overflow: hidden; }
        .chip-main { display: flex; align-items: center; gap: 8px; padding: 9px 10px; }
        .chip-info { flex: 1; min-width: 0; }
        .chip-name-row { display: flex; align-items: center; gap: 5px; }
        .chip-name { font-size: 13px; font-weight: 500; color: #e2eaf4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .chip-meta { font-size: 11px; color: #6a8aaa; margin-top: 1px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .risk-badge { display: flex; align-items: center; gap: 2px; font-size: 10px; }
        .chip-right { text-align: right; flex-shrink: 0; }
        .chip-pts { font-size: 13px; font-weight: 700; color: #e2eaf4; }
        .chip-pts-label { font-size: 10px; color: #6a8aaa; }
        .chip-expand, .chip-remove { background: none; border: none; cursor: pointer; color: #3a5a7a; padding: 4px; border-radius: 5px; line-height: 1; transition: color .15s; flex-shrink: 0; }
        .chip-expand:hover { color: #8aaccc; }
        .chip-remove:hover { color: #f5834a; }
        .scout-section { border-top: 1px solid #1e3050; padding: 12px 12px 10px; }
        .scout-loading { font-size: 12px; color: #6a8aaa; display: flex; align-items: center; gap: 6px; }
        .scout-stats { display: flex; gap: 16px; margin-bottom: 10px; }
        .scout-stat { display: flex; flex-direction: column; gap: 2px; }
        .ss-label { font-size: 10px; color: #6a8aaa; text-transform: uppercase; letter-spacing: .05em; }
        .ss-val { font-size: 13px; font-weight: 600; color: #e2eaf4; }
        .scout-report { font-size: 13px; color: #a0bcd8; line-height: 1.6; }
        .scout-time { font-size: 10px; color: #3a5a7a; margin-top: 8px; }
      `}</style>
    </div>
  )
}
