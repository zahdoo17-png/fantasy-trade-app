// lib/fantasy.js
// Scoring system from your spreadsheet

export const SCORING = {
  FGM: 2,
  FGA: -1,
  FTM: 1,
  FTA: -1,
  FG3M: 1,
  REB: 1,
  AST: 2,
  STL: 4,
  BLK: 4,
  TO: -2,
  FF: -1,
  TF: -1,
  DD: 3,
  TD: 5,
  PTS: 1,
}

// Estimate double-doubles and triple-doubles per game
export function estimateDDTD(pts, reb, ast, blk, stl) {
  const cats = [pts, reb, ast, blk, stl]
  const tens = cats.filter(c => c >= 10).length
  const doubleChance = Math.min(0.9, tens * 0.25 + cats.reduce((s, c) => s + Math.min(c / 10, 1.0) * 0.1, 0))
  const tripleChance = Math.min(0.5, tens >= 2 ? (tens - 1) * 0.12 : 0)
  return { ddPerGame: doubleChance, tdPerGame: tripleChance }
}

// Calculate fantasy points per game from stat line
export function calcFantasyPPG(stats) {
  const {
    fgm = 0, fga = 0, ftm = 0, fta = 0, fg3m = 0,
    reb = 0, ast = 0, stl = 0, blk = 0, to = 0, pts = 0
  } = stats

  const { ddPerGame, tdPerGame } = estimateDDTD(pts, reb, ast, blk, stl)

  return (
    fgm * SCORING.FGM +
    fga * SCORING.FGA +
    ftm * SCORING.FTM +
    fta * SCORING.FTA +
    fg3m * SCORING.FG3M +
    reb * SCORING.REB +
    ast * SCORING.AST +
    stl * SCORING.STL +
    blk * SCORING.BLK +
    to * SCORING.TO +
    ddPerGame * SCORING.DD +
    tdPerGame * SCORING.TD +
    pts * SCORING.PTS
  )
}

// Age-based trajectory factor
export function ageFactor(age) {
  if (age >= 24 && age <= 29) return 1.0
  if (age < 24) return 0.93 + (age - 19) * 0.014
  if (age < 33) return 1.0 - (age - 29) * 0.015
  if (age < 36) return 1.0 - 0.06 - (age - 33) * 0.03
  return 1.0 - 0.15 - (age - 36) * 0.04
}

// 3-year injury risk score (1=high risk, 10=iron man)
// Weights: current year 50%, y-1 30%, y-2 20%
export function injuryRiskScore(gpCur, gpY1 = 0, gpY2 = 0) {
  const maxGP = 82
  let pct
  if (gpY2 === 0 && gpY1 === 0) {
    pct = gpCur / maxGP
  } else if (gpY2 === 0) {
    pct = (gpCur * 0.6 + gpY1 * 0.4) / maxGP
  } else {
    pct = (gpCur * 0.5 + gpY1 * 0.3 + gpY2 * 0.2) / maxGP
  }
  return Math.min(10, Math.max(1, parseFloat((pct * 10).toFixed(1))))
}

// GP availability factor from injury risk score
export function gpFactor(riskScore) {
  const pct = riskScore / 10
  if (pct >= 0.92) return 1.0
  if (pct >= 0.79) return 0.96
  if (pct >= 0.67) return 0.88
  if (pct >= 0.55) return 0.78
  return 0.65
}

// Full projected season total
export function projectedSeasonTotal(stats, age, gpCur, gpY1, gpY2) {
  const fpg = calcFantasyPPG(stats)
  const af = ageFactor(age)
  const risk = injuryRiskScore(gpCur, gpY1, gpY2)
  const gf = gpFactor(risk)
  return parseFloat((fpg * af * gf * gpCur).toFixed(1))
}

// Trade fairness verdict
export function tradeVerdict(totalA, totalB) {
  const diff = totalB - totalA
  const avg = (totalA + totalB) / 2
  const diffPct = avg > 0 ? (Math.abs(diff) / avg) * 100 : 0

  if (diffPct <= 8) {
    return { verdict: 'fair', label: 'Fair trade', diffPct }
  } else if (diff > 0) {
    return {
      verdict: 'win',
      label: `Favors you (+${diff.toLocaleString()} pts)`,
      diffPct,
      strength: diffPct > 25 ? 'strong' : 'slight'
    }
  } else {
    return {
      verdict: 'lose',
      label: `Favors other team (−${Math.abs(diff).toLocaleString()} pts)`,
      diffPct,
      strength: diffPct > 25 ? 'strong' : 'slight'
    }
  }
}
