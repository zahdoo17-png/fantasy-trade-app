# 🏀 Fantasy Basketball Trade Analyzer

Real-time NBA fantasy trade analyzer with nightly stat syncs and AI-powered scouting reports.

## What it does

- **Live player stats** pulled nightly from the NBA via balldontlie.io
- **Fantasy points** calculated using your custom scoring system (FGM+2, AST+2, STL+4, BLK+4, etc.)
- **3-year injury risk scores** so you know who's a durability risk
- **AI scouting reports** (powered by Claude) that explain surges, slumps, injuries, and role changes
- **Trade verdict** — fair / favors you / favors them, with % breakdown
- **Auto-updates every night at 2am ET** via Vercel cron

---

## Setup (takes ~20 minutes)

### Step 1 — Clone / download this project

```bash
# If using git:
git init
git add .
# Or just unzip the project folder
```

### Step 2 — Create a Supabase project (free)

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Name it `fantasy-basketball`, pick a region close to you
3. Once created, go to **SQL Editor** → paste the entire contents of `supabase-schema.sql` → click **Run**
4. Go to **Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret key** → `SUPABASE_SERVICE_ROLE_KEY`

### Step 3 — Get a balldontlie API key (free)

1. Go to [balldontlie.io](https://balldontlie.io) → Sign up free
2. Copy your API key → `BALLDONTLIE_API_KEY`

### Step 4 — Get your Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com) → API Keys → Create key
2. Copy it → `ANTHROPIC_API_KEY`

### Step 5 — Set up environment variables

Copy `.env.local.example` to `.env.local` and fill in all values:

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
BALLDONTLIE_API_KEY=your-key-here
CRON_SECRET=pick-any-random-string-here
```

### Step 6 — Run locally to test

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Step 7 — Trigger the first stats sync

With the dev server running:

```bash
curl "http://localhost:3000/api/cron/sync-stats?secret=your-cron-secret"
```

This populates your Supabase database with current NBA stats. Takes 3-5 minutes.

### Step 8 — Deploy to Vercel (free)

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your project folder (or connect your GitHub repo)
3. Under **Environment Variables**, add all 6 variables from `.env.local`
4. Deploy!

Vercel will automatically:
- Host your site with a public URL
- Run the nightly cron job at 2am ET every day (configured in `vercel.json`)

---

## Project structure

```
fantasy-trade-app/
├── pages/
│   ├── index.js                  # Main trade analyzer UI
│   ├── _app.js                   # Next.js app wrapper
│   ├── _document.js              # HTML head / meta tags
│   └── api/
│       ├── cron/
│       │   └── sync-stats.js     # Nightly NBA stats sync (Vercel cron)
│       ├── scouting-report.js    # AI report generator (Claude)
│       ├── sync-status.js        # Last sync health check
│       └── players/
│           ├── search.js         # Player search endpoint
│           └── top.js            # Top 200 players endpoint
├── lib/
│   ├── fantasy.js                # Scoring engine + trade verdict logic
│   ├── supabase.js               # Supabase client
│   └── nba-api.js                # balldontlie NBA API client
├── styles/
│   └── globals.css
├── supabase-schema.sql           # Run this in Supabase SQL editor first
├── vercel.json                   # Cron schedule (2am ET nightly)
├── next.config.js
├── package.json
└── .env.local.example            # Copy to .env.local and fill in
```

---

## Scoring system

| Stat | Points |
|------|--------|
| Field Goals Made (FGM) | +2 |
| Field Goals Attempted (FGA) | -1 |
| Free Throws Made (FTM) | +1 |
| Free Throws Attempted (FTA) | -1 |
| 3-Pointers Made (3PM) | +1 |
| Rebounds (REB) | +1 |
| Assists (AST) | +2 |
| Steals (STL) | +4 |
| Blocks (BLK) | +4 |
| Turnovers (TO) | -2 |
| Double Doubles (DD) | +3 |
| Triple Doubles (TD) | +5 |
| Points (PTS) | +1 |
| Flagrant Fouls (FF) | -1 |
| Technical Fouls (TF) | -1 |

---

## How the AI scouting reports work

When you add a player to the trade analyzer, the site:

1. Checks Supabase for a cached report (valid 24 hours)
2. If expired, fetches the player's season stats + last 10 game logs
3. Sends everything to Claude with a prompt asking for a 3-4 sentence analysis
4. Claude explains: recent surge/slump, likely reasons (injury on team, role change, trade, schedule), and a buy/sell/hold recommendation
5. Caches the report in Supabase so the next user sees it instantly

Reports auto-refresh every 24 hours after the nightly stat sync.

---

## Manual sync

Trigger a sync anytime (useful after big trade deadlines):

```bash
curl "https://your-vercel-url.vercel.app/api/cron/sync-stats?secret=your-cron-secret"
```

---

## FAQ

**Why don't I see any players?**
Run the first sync: `GET /api/cron/sync-stats?secret=your-secret`

**The scouting report says "stats still loading"**
The player has 0 games in the DB — trigger a sync first.

**How do I update the scoring system?**
Edit `lib/fantasy.js` → `SCORING` object, then re-sync stats.

**Can I add rookies manually?**
Yes — insert them directly into Supabase's `players` and `season_stats` tables.
