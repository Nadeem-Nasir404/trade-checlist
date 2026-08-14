# Trade OS — Full App Documentation

A complete reference for everything currently in the app: features, UI structure, data model, business logic, styling, storage, and the Notion integration.

- **App name:** Trade OS — Pre-market Protocol
- **Framework:** Next.js 14 (App Router) + React 18
- **Language:** JavaScript (JSX / ESM)
- **Deployment target:** Vercel
- **Data storage:** Browser `localStorage` (primary) + optional Notion sync (server-side)

---

## 1. Navigation & App Shell

The app is a single page (`app/page.jsx`) with a top navigation bar and five tab views.

### Top bar
| Element | Description |
|---|---|
| `Trade OS` brand mark | Left side, always visible |
| `Pre-market protocol` subtitle | Small brand tagline |
| Tab navigation | Today · Trades · Conclusion · Stats · Journal |
| World clocks | UTC, LDN (London), NY (New York), PK (Karachi) |
| Sync pill | Shows connection status: `Local` (red dot) or `Notion` (green/amber/red depending on status) |

### The 5 views
1. **Today** — the bias-determination protocol (4 stages + session strip + status row)
2. **Trades** — execution blotter, trade form, day performance stats
3. **Conclusion** — final verdict generated from ALL collected data, with loading animation
4. **Stats** — historical analytics across saved days
5. **Journal** — personal journaling fields + Notion sync + backup tools

---

## 2. Today View (Bias Determination)

This is the **bias determination** workflow — kept strictly separate from execution.

### Page header
- Instrument ticker (e.g. `NQ`, `BTC`, `XAUUSD`, `EURUSD`)
- Formatted date + instrument label + market rhythm
- **Readiness gauge** — circular progress ring showing `readiness %` (how much of the protocol checklist is filled)

### Instrument switcher (`controls` row)
- **Symbol pills** — one per tracked ticker; active pill is highlighted; each removable (unless it's the only one)
- **Add symbol (+)** — dashed round button that opens a mini ticker input; adds to localStorage
- **History dropdown** — switches to any previously saved day for that instrument
- **+ Trade** button — jumps straight to the Trades view
- **Reset button** — turns into a red `Confirm reset` for 3.5s before it actually clears the day (accident protection)

### Status row (4 cards)
| Card | What it shows |
|---|---|
| GO / NO-GO | Overall workflow gate. `GO` (green) if all checklist items are filled and no blockers; `NO-GO` (red) otherwise, listing first blocker |
| Session Profile / Flow Context | Profile matrix read (`Highest probability`, `High probability`, `Chop / no trade`, `Pending`) |
| Day Conclusion | Final verdict (from the Conclusion engine) + `Open verdict` button |
| Execution Score | Numeric score + stage progress + W/L and net R summary |

### Stage 1 — Daily Prep
- **Define the day's bias** — segmented control: Short / Neutral / Long (required to start)
- **Wait out the first 30 minutes** — toggle
- **Previous day profile levels are marked** — toggle (VAH, VAL, POC, VWAP, LVN)
- **Event window reviewed** — toggle (FOMC, CPI, NFP, major releases)

### Stage 2 — Profile Map
- VAH / VAL / POC / VWAP text inputs
- Yesterday's close vs value (outside / inside) — only gating for profile instruments
- Today's open vs value (outside / inside)
- LVN / gap notes free-text field
- **Matrix read banner** — live verdict from the profile matrix
- For flow instruments (crypto), a note explains profile levels stay visible but don't block GO/NO-GO

### Stage 3 — Narrative Builder
Profile-only inputs (no mood, no trades):
- Previous cash close (above/inside/below prior value, or outside overnight range)
- Today's open (above/inside/below value, or outside overnight range)
- Value context (acceptance above, rotating back in, rejecting edge, still seeking)
- Profile location (value area edge, at POC, outside value/imbalance, opening range boundary, mid-range)
- Auction state (balanced, trend building up/down, failed, double distribution)
- Liquidity path (sweep highs first, sweep lows first, two-way rotation, no clean path)
- Day type hypothesis (Continuation / Reversal / Rotation / Expansion)
- Profile note (free text)

### Stage 4 — Orderflow Conclusion (preliminary read)
- HTF POI (weekly/daily high-low, value edge, order block, FVG, open/VWAP)
- Orderflow (displacement w/ follow-through, absorption, failed breakout, sweep-then-reclaim, trend auction, choppy)
- Initiative (buyers/sellers in control, none yet, failed)
- Response at level (acceptance above/below, rejection, none)
- CVD / delta (aligned, absorbed, diverging, loading, flat)
- Tape state (fast w/ size, slow, big prints defending, exhaustion, noise)
- Execution lane (trend/continuation, mean reversion/fade, wait for confirmation, no trade/buffer)
- Session liquidity (Asia sweep, London raid, NY AM expansion, NY PM mean reversion, multi-session pool)
- **Orderflow read banner** + reason pills
- **Generate final conclusion** button → jumps to Conclusion view

### Stage locking logic
Stages unlock sequentially:
- Stage 1 always unlocked
- Stage 2 unlocks when Stage 1 is complete
- Stage 3 unlocks when Stage 2 is complete
- Stage 4 unlocks when Stage 3 is complete

A stage is "complete" when all its inputs are filled. Locked stages render with a note and reduced opacity.

### Liquidity card
- **24-hour session flow strip** — horizontal timeline showing Sydney/Tokyo, London, New York segments
- **Now marker** — white line positioned at current UTC time
- **Legend** with colored dots per session

---

## 3. Trades View (Execution — kept separate)

Pure execution logging, no bias inputs here.

### Day stats (4 tiles)
- Net R (green positive / red negative)
- Win rate %
- Wins / Losses
- Best trade R

### Trade form
| Field | Type | Notes |
|---|---|---|
| Session | select | Asia / London / New York AM / New York PM |
| Model | select | Continuation / Reversal / Expansion / Mean Reversion |
| Direction | select | Long / Short |
| Entry | text | required |
| Exit | text | optional |
| Stop | text | optional |
| Planned RR | text | optional |
| R | text | optional (auto-filled via auto-R) |
| Narrative fit | select | With narrative / Counter narrative / Neutral / scalp |
| Trigger | select | Structure Shift (2m) / Absorption (5m) / Liquidity Sweep / VWAP Reclaim / Other |
| Notes | text (full width) | free text |

### Auto-R calculation
- Entering Entry, Stop, and Exit auto-computes R = reward / risk
- A hint shows the computed value; **Use X R** button copies it into the R field
- Risk and reward are direction-aware (inverted for Shorts); returns `null` if inputs are invalid

### Trade log
- Table-style rows: Dir · Session · Model · Entry · Exit · Stop · Plan RR · R · Narrative · Trigger · Notes · delete (×)
- R values colored (positive = green, negative = red)
- Empty state: "No trades logged yet today."
- Each trade stores `loggedAt` (time when logged)

---

## 4. Conclusion View (Final Verdict)

A dedicated view that combines **all** inputs — bias, prep, profile matrix, narrative, orderflow, AND execution results — into one verdict.

### Loading phase
When the view opens it plays a loading sequence (~2.2s):
- Spinner + "Analyzing all collected data"
- 6 sequential steps light up:
  1. Reading bias and daily prep
  2. Mapping profile matrix
  3. Checking orderflow signals
  4. Evaluating execution log
  5. Weighing risk conditions
  6. Building final verdict

### Verdict output
- **Verdict hero** — color-coded by tone:
  - `bull` (green) → GO
  - `warn` (amber) → CAUTION
  - `bear` (red) → NO-GO
  - `muted` (gray) → PENDING
- Big verdict label + title
- **Matched rule card** — shows the exact rule that fired as `IF ... THEN ...`
- **Signal chips** — Readiness %, Bias, Profile map, Orderflow, Trades, Net R, Win rate
- **Why this verdict** — reason pills
- **Warnings** — amber pills for issues like negative net R, counter-narrative trades, CVD divergence
- **Actions** — `Review execution log` (→ Trades), `Back to protocol` (→ Today)

### Rule engine (`CONCLUSION_RULES` in `lib/defaults.js`)
Rules are evaluated **in order; first match wins**. Each rule: `when(ctx)`, `explain`, `verdict`, `tone`, `title`, `detail`, `reasons`.

| # | Rule id | Condition (IF) | Verdict (THEN) | Tone |
|---|---|---|---|---|
| 1 | `no-trade-veto` | Execution lane = No trade / buffer | STAND ASIDE | bear |
| 2 | `cvd-divergence-veto` | CVD diverging from price | WAIT FOR CONFIRMATION | warn |
| 3 | `bias-conflict` | Locked bias conflicts with map direction | TRUST THE MAP | warn |
| 4 | `full-alignment-go` | Bias aligned + high conviction + orderflow bull + net R ≥ 0 | GO — EXECUTE THE PLAN | bull |
| 5 | `continuation` | Profile = Highest probability + orderflow bull | CONTINUATION FAVORED | bull |
| 6 | `reversal` | Orderflow = Reversal favored / warn tone | REVERSAL / FADE ONLY | warn |
| 7 | `rotation` | Profile = Chop / no trade (bear tone) | ROTATION / LOW CONVICTION | bear |
| 8 | `incomplete` | Fewer than 4 stages complete | PROVISIONAL | muted |
| 9 | `default` | Always true (fallback) | CONTEXT BUILT — TRIGGER PENDING | muted |

> **Training:** These rules are easy to extend. Add a new object to `CONCLUSION_RULES` with a `when` predicate and the `verdict`/`detail` you want. They are evaluated top-to-bottom, so put specific rules before generic ones.

---

## 5. Stats View (Analytics)

Aggregates every saved day for the active instrument.

### Summary cards
- Net R
- Win rate %
- Profit factor (∞ when no losses)
- Total trades
- Avg win R / Avg loss R
- Best trade / Worst trade

### Breakdowns
- **By session** — trades, win rate, net R per session, sorted by best net R
- **By model** — same breakdown per trade model

### Day-by-day history
- Each day: date, trades, W/L, readiness %, net R
- Rows are clickable → opens that day's full journal in the Today view

---

## 6. Journal View

Personal context, mood and review — explicitly separated from market profiling.

### Fields
- **Mood** — Calm / Locked in / Hesitant / FOMO risk / Tired low focus
- **Key level / nPOC reference** — text
- **Macro theme** — text (e.g. dollar strength, risk-on)
- **Playbook focus** — text
- **Rule of day** — text (e.g. "No second entry after first stop")
- **Bias notes** — textarea
- **Trade narrative** — textarea (thesis, expectations, deviations)
- **Execution review** — textarea (what to repeat/cut)

### Notion sync controls
- **Sync now** — immediately push to Notion
- **Copy for Notion** — copies full Markdown summary to clipboard as a fallback
- **Open Notion** — link to the synced page if one exists

### Backup / restore
- **Export JSON** — downloads `trade-journal-backup-YYYY-MM-DD.json` with all localStorage data
- **Import JSON** — restores from a backup file
- Sync status message displayed at the bottom

---

## 7. Data Model (`lib/defaults.js`)

### Instrument profiles
Instrument detection is by ticker substring:
| Kind | Detected by | Theme | Requires session profile |
|---|---|---|---|
| Index | NQ, ES, YM, RTY, MNQ, MES | `index` (green) | Yes |
| Crypto | BTC, ETH, SOL | `crypto` (orange) | No |
| Metal | XAU, GC, GOLD | `metal` (gold) | Yes |
| FX | anything else | `fx` (blue) | Yes |

### State shape (`blankState()`)
```js
{
  sessionProfile: { vah, val, poc, vwap, lvn, yestClose, todayOpen },
  dailyPrep:     { waitFirstThirty, levelsMarked, eventRiskChecked },
  narrativeProfile: { prevCashClose, todayOpen, valueContext, profileLocation,
                      auctionState, liquidityPath, dayType, profileNote },
  bias:          null | "bearish" | "neutral" | "bullish",
  keyLevel: "",
  biasNotes: "",
  premarket: { marketBehavior, orderFlow, htfPoi, liquidityFocus, sessionLiquidity,
               profileLocation, auctionState, cvdState, tapeState, executionLane,
               initiative, response, mood, thesisNarrative },
  macroTheme: "",
  playbookFocus: "",
  ruleOfDay: "",
  executionReview: "",
  trades: []
}
```

### Trade shape
```js
{ session, model, dir, entry, exit, stop, plannedRR, r,
  narrativeFit, trigger, notes, loggedAt }
```

### Key helpers
| Function | Purpose |
|---|---|
| `getInstrumentConfig(ticker)` | Returns the instrument profile |
| `normalizeState(input)` | Fills missing fields with defaults (backward compat) |
| `getSetupVerdict(sessionProfile, ticker)` | Profile matrix classification |
| `getOrderflowConclusion(state, ticker)` | Preliminary orderflow read (stage 4) |
| `getBiasConclusion(state, ticker)` | Scores long vs short from all selections, conviction, alignment vs locked bias |
| `CONCLUSION_RULES` / `buildFinalConclusion(state, ticker)` | Final verdict engine |
| `getProtocolProgress(state, ticker)` | Stage completion + unlock state |
| `getGoNoGo(state, ticker)` | GO/NO-GO gate with blocker list |
| `calculateMetrics(state, ticker)` | Readiness %, net R, W/L, win rate, execution score, setup/conclusion/bias reads |
| `computeAutoR(form)` | Auto R from entry/stop/exit |
| `createMarkdown({ticker, dateLabel, state})` | Notion-ready Markdown summary |
| `buildAnalytics(dayEntries, ticker)` | Stats aggregation |
| `buildTodayClockState()` | World clocks + UTC position % |

---

## 8. Logic Details

### Profile matrix verdict (`getSetupVerdict`)
Based on yesterday's close vs value + today's open vs value:
| Yesterday close | Today open | Verdict |
|---|---|---|
| outside | outside | Highest probability (bull) |
| outside | inside | High probability (warn) |
| inside | outside | High probability (warn) |
| inside | inside | Chop / no trade (bear) |
| missing either | — | Pending (muted) |
| flow instrument | — | Optional (muted) |

### Bias conclusion (`getBiasConclusion`)
- Counts long-supporting vs short-supporting selections (prev close, today open, value context, auction state, liquidity path, initiative, response)
- `direction = long` when net ≥ +2, `short` when net ≤ −2, else `neutral`
- **Conviction** = |net| + confirmations (CVD aligned/loading, tape fast/size) adjusted by setup quality, mid-range penalty, CVD divergence penalty, wait-for-confirmation penalty → high ≥5, medium ≥3, low otherwise
- **Alignment** = whether the computed direction matches the user's locked bias
- Hard veto: execution lane = no trade → Stand aside

### Orderflow conclusion (`getOrderflowConclusion`)
- **Continuation read** = orderflow (displacement/trend auction) + CVD (aligned/loading) + tape (fast/size, big prints) + lane (trend/wait)
- **Reversal read** = orderflow (absorption/sweep-reclaim/failed breakout) + CVD (absorbed/aligned) + tape (big prints/exhaustion) + lane (mean reversion/wait)
- Priority: no-trade lane → CVD/tape divergence → chop matrix → continuation → reversal → default

### GO / NO-GO gate (`getGoNoGo`)
Lists every missing required field as a blocker. Also blocks on:
- Profile mid-range / nowhere
- CVD diverging from price
- Execution lane = no trade
- Chop / no trade matrix (profile instruments)

### Readiness (`calculateMetrics`)
25 checklist items; readiness = filled / total × 100.

### Execution score
`round(readiness × 0.68 + completedStages × 7 + (has trades ? 4 : 0))`, capped at 100.

---

## 9. Styling & Theme (`app/globals.css`)

### Color system (restored green/olive theme)
| Token | Value | Purpose |
|---|---|---|
| `--bg` | `#070a08` | page background (dark green-black) |
| `--panel` | `#0d1410` | card background |
| `--panel-2` | `#111914` | nested panels / inputs |
| `--panel-3` | `#152019` | pills, gauge track |
| `--border` | `#223226` | default borders (green-tinted) |
| `--border-strong` | `#2c3d30` | hover borders |
| `--border-soft` | `#18251c` | legacy soft borders |
| `--text` | `#eef2df` | primary text |
| `--text-dim` | `#9cad8e` | secondary text |
| `--text-faint` | `#65755d` | muted/labels |
| `--green` | `#3be37a` | accent, positive, GO |
| `--amber` | `#d7bd73` | warnings, London session |
| `--red` | `#db6767` | negative, NO-GO |
| `--blue` | `#76c6a1` | mint-blue, info, Sydney session |

### Theme accent switching
Instrument classes override `--accent`/`--accent-soft`:
- `.theme-index` → green
- `.theme-crypto` → orange `#f0a53b`
- `.theme-metal` → gold `#f5c86a`
- `.theme-fx` → mint-blue

### Typography
- **Sora** (display font) for headings/body via `--disp`
- **IBM Plex Mono** for numbers, codes, labels via `--mono`

### Visual details
- Page background uses radial green/amber glows
- `fade-rise` animation on cards
- Focus rings / focus-visible outlines in accent color
- Custom scrollbar, green-tinted selection
- Responsive breakpoints at 960px and 640px (grids collapse to 2 then 1 column; clocks/brand-sub hidden on mobile)
- `prefers-reduced-motion` support

---

## 10. Storage (`lib/local-store.js`)

All keys are prefixed with `trade-journal-protocol:`.

| Key | Contents |
|---|---|
| `tickers` | array of tracked symbols |
| `day:{TICKER}:{YYYY-MM-DD}` | full journal state for that day |
| `history:{TICKER}` | list of saved days (sorted newest first) |
| `sync-meta:{ticker}::{day}` | Notion page URL + last synced time |

### Backup / restore
- `exportAllData()` — dumps every prefixed localStorage key into a JSON payload with app/version metadata
- `importAllData(payload)` — writes all keys back; validates payload shape

---

## 11. Notion Integration (`app/api/journal/route.js`)

Server-side route, keeps the token out of the browser.

### GET `/api/journal`
Returns `{ configured, databaseId }` — whether env vars are set.

### POST `/api/journal`
Body: `{ ticker, day, state }`. Upserts a Notion page:
1. Builds properties (Journal title, Trade Date, Instrument, Bias, Readiness, Setup, Trade Count, Net R, Journal Key)
2. Builds content blocks (summary, protocol, profile, narrative, orderflow, checklist, trades)
3. Looks up existing page by `Journal Key` property
4. If exists → updates properties, deletes + re-appends children
5. If not → creates page

### Markdown fallback
`createMarkdown` generates a full summary that can be copied manually.

### Env vars
- `NOTION_TOKEN` — integration token
- `NOTION_DATABASE_ID` — database ID
- `NEXT_PUBLIC_TIMEZONE` — PK clock timezone (default `Asia/Karachi`)

---

## 12. File Map

| File | Lines | Responsibility |
|---|---|---|
| `app/layout.jsx` | 24 | Root layout, font loading (Sora + IBM Plex Mono) |
| `app/page.jsx` | ~1711 | Entire UI + state + handlers |
| `app/globals.css` | ~1317 | All styling |
| `app/api/journal/route.js` | ~315 | Notion sync API |
| `lib/defaults.js` | ~1126 | Data model, all logic engines, rules |
| `lib/local-store.js` | ~94 | localStorage read/write, backup |
| `README.md` | 64 | Setup and deployment guide |
