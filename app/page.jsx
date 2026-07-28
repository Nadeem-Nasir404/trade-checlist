"use client";

import { useEffect, useRef, useState } from "react";

import {
  blankState,
  buildTodayClockState,
  calculateMetrics,
  createJournalKey,
  createMarkdown,
  dateStr,
  DEFAULT_TICKERS,
  fmtDate,
  formatBiasLabel,
  getInstrumentConfig,
  getGoNoGo,
  getProtocolProgress,
  normalizeState,
  parseDateStr
} from "../lib/defaults";
import {
  getHistory,
  loadDay,
  loadSyncMeta,
  loadTickers,
  saveDay,
  saveSyncMeta,
  saveTickers
} from "../lib/local-store";

const SESSION_SEGMENTS = [
  { label: "Sydney / Tokyo", start: 0, end: 9, tone: "blue" },
  { label: "London", start: 8, end: 17, tone: "gold" },
  { label: "New York", start: 13, end: 22, tone: "green" }
];

const APP_VIEWS = [
  { id: "overview", label: "Home" },
  { id: "protocol", label: "Protocol" },
  { id: "narrative", label: "Narrative" },
  { id: "trades", label: "Trades" },
  { id: "journal", label: "Journal" }
];

const BIAS_OPTIONS = [
  { value: "bearish", label: "Short", tone: "short" },
  { value: "neutral", label: "Neutral", tone: "neutral" },
  { value: "bullish", label: "Long", tone: "long" }
];

function createTradePayload(form) {
  return {
    session: form.session,
    model: form.model,
    dir: form.dir,
    entry: form.entry.trim(),
    exit: form.exit.trim(),
    plannedRR: form.plannedRR.trim(),
    r: form.r.trim(),
    narrativeFit: form.narrativeFit,
    trigger: form.trigger,
    notes: form.notes.trim(),
    loggedAt: new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    })
  };
}

function StageCard({
  number,
  title,
  subtitle,
  complete,
  unlocked,
  children
}) {
  return (
    <section className={`stage-card ${complete ? "complete" : ""} ${!unlocked ? "locked" : ""}`}>
      <div className="stage-head">
        <div>
          <div className="stage-kicker">
            {number}. {title}
          </div>
          <div className="stage-subtitle">{subtitle}</div>
        </div>
        <span className={`stage-status ${complete ? "done" : unlocked ? "live" : "mute"}`}>
          {complete ? "Done" : unlocked ? "Active" : "Locked"}
        </span>
      </div>
      {unlocked ? children : <div className="locked-note">Complete the previous stage to unlock this step.</div>}
    </section>
  );
}

function ToggleRow({ title, detail, checked, onToggle }) {
  return (
    <button className={`task-row ${checked ? "done" : ""}`} onClick={onToggle} type="button">
      <span className="task-check">{checked ? "x" : ""}</span>
      <span className="task-copy">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </button>
  );
}

function SegmentedBias({ value, onChange }) {
  return (
    <div className="segmented">
      {BIAS_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`seg-btn ${value === option.value ? `is-${option.tone}` : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function Page() {
  const today = dateStr(new Date());
  const [hydrated, setHydrated] = useState(false);
  const [activeView, setActiveView] = useState("overview");
  const [tickers, setTickers] = useState(DEFAULT_TICKERS);
  const [activeTicker, setActiveTicker] = useState(DEFAULT_TICKERS[0]);
  const [currentDateStr] = useState(today);
  const [selectedDateStr, setSelectedDateStr] = useState(today);
  const [journalState, setJournalState] = useState(blankState());
  const [historyDates, setHistoryDates] = useState([]);
  const [newTicker, setNewTicker] = useState("");
  const [showTickerForm, setShowTickerForm] = useState(false);
  const [tradeForm, setTradeForm] = useState({
    session: "",
    model: "",
    dir: "Long",
    entry: "",
    exit: "",
    plannedRR: "",
    r: "",
    narrativeFit: "",
    trigger: "",
    notes: ""
  });
  const [clockState, setClockState] = useState(buildTodayClockState());
  const [syncState, setSyncState] = useState({
    configured: false,
    status: "idle",
    message: "Checking Notion connection...",
    pageUrl: "",
    lastSyncedAt: "",
    error: ""
  });

  const syncTimeoutRef = useRef(null);

  useEffect(() => {
    const storedTickers = loadTickers();
    const initialTicker = storedTickers[0] || DEFAULT_TICKERS[0];
    const initialState = normalizeState(loadDay(initialTicker, today) || blankState());

    setTickers(storedTickers);
    setActiveTicker(initialTicker);
    setSelectedDateStr(today);
    setJournalState(initialState);
    setHistoryDates(getHistory(initialTicker, today));
    setHydrated(true);
  }, [today]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClockState(buildTodayClockState());
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    async function loadSyncStatus() {
      try {
        const response = await fetch("/api/journal");
        const data = await response.json();
        if (data.configured) {
          setSyncState((current) => ({
            ...current,
            configured: true,
            status: "ready",
            message: "Notion autosync is armed."
          }));
        } else {
          setSyncState({
            configured: false,
            status: "local",
            message: "Local mode only. Add Notion env vars to sync online.",
            pageUrl: "",
            lastSyncedAt: "",
            error: ""
          });
        }
      } catch (error) {
        setSyncState({
          configured: false,
          status: "local",
          message: "Could not verify Notion from the browser. Local mode is still available.",
          pageUrl: "",
          lastSyncedAt: "",
          error: ""
        });
      }
    }

    loadSyncStatus();
  }, []);

  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        window.clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  const instrumentConfig = getInstrumentConfig(activeTicker);
  const metrics = calculateMetrics(journalState, activeTicker);
  const goNoGo = getGoNoGo(journalState, activeTicker);
  const protocol = getProtocolProgress(journalState, activeTicker);
  const stages = protocol.stages;
  const dateLabel = fmtDate(parseDateStr(selectedDateStr));
  const journalKey = createJournalKey(activeTicker, selectedDateStr);

  useEffect(() => {
    const meta = loadSyncMeta(journalKey);
    if (!meta) {
      return;
    }

    setSyncState((current) => ({
      ...current,
      pageUrl: meta.pageUrl || "",
      lastSyncedAt: meta.lastSyncedAt || current.lastSyncedAt
    }));
  }, [journalKey]);

  function refreshHistoryFor(ticker) {
    setHistoryDates(getHistory(ticker, currentDateStr));
  }

  function persistState(nextState, options = {}) {
    const ticker = options.ticker || activeTicker;
    const day = options.day || selectedDateStr;

    setJournalState(nextState);
    saveDay(ticker, day, nextState);
    refreshHistoryFor(ticker);

    if (options.sync !== false) {
      queueSync(nextState, {
        ticker,
        day,
        immediate: Boolean(options.immediateSync)
      });
    }
  }

  async function syncNow(payload) {
    setSyncState((current) => ({
      ...current,
      status: "syncing",
      message: "Syncing to Notion...",
      error: ""
    }));

    try {
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Notion sync failed.");
      }

      setSyncState((current) => ({
        ...current,
        configured: true,
        status: "synced",
        message:
          data.mode === "created"
            ? "New daily journal created in Notion."
            : "Daily journal updated in Notion.",
        pageUrl: data.pageUrl || current.pageUrl,
        lastSyncedAt: new Date().toISOString(),
        error: ""
      }));

      saveSyncMeta(createJournalKey(payload.ticker, payload.day), {
        pageUrl: data.pageUrl || "",
        lastSyncedAt: new Date().toISOString()
      });
    } catch (error) {
      setSyncState((current) => ({
        ...current,
        status: "error",
        message: "Notion sync failed.",
        error: error.message
      }));
    }
  }

  function queueSync(nextState, options = {}) {
    if (!syncState.configured) {
      return;
    }

    const payload = {
      ticker: options.ticker || activeTicker,
      day: options.day || selectedDateStr,
      state: nextState,
      journalKey
    };

    if (syncTimeoutRef.current) {
      window.clearTimeout(syncTimeoutRef.current);
    }

    if (options.immediate) {
      void syncNow(payload);
      return;
    }

    syncTimeoutRef.current = window.setTimeout(() => {
      void syncNow(payload);
    }, 900);
  }

  function handleTickerSwitch(ticker) {
    const loaded = normalizeState(loadDay(ticker, currentDateStr) || blankState());
    setActiveTicker(ticker);
    setSelectedDateStr(currentDateStr);
    setJournalState(loaded);
    refreshHistoryFor(ticker);
  }

  function handleHistoryChange(day) {
    const nextDay = day || currentDateStr;
    const loaded = normalizeState(loadDay(activeTicker, nextDay) || blankState());
    setSelectedDateStr(nextDay);
    setJournalState(loaded);
  }

  function handleAddTicker() {
    const nextTicker = newTicker.trim().toUpperCase();
    if (!nextTicker || tickers.includes(nextTicker)) {
      return;
    }

    const nextTickers = [...tickers, nextTicker];
    setTickers(nextTickers);
    saveTickers(nextTickers);
    setNewTicker("");
    setShowTickerForm(false);
    setActiveTicker(nextTicker);
    setSelectedDateStr(currentDateStr);
    const nextState = blankState();
    setJournalState(nextState);
    saveDay(nextTicker, currentDateStr, nextState);
    refreshHistoryFor(nextTicker);
  }

  function handleRemoveTicker(ticker) {
    if (tickers.length <= 1) {
      return;
    }

    const nextTickers = tickers.filter((item) => item !== ticker);
    setTickers(nextTickers);
    saveTickers(nextTickers);

    if (ticker === activeTicker) {
      handleTickerSwitch(nextTickers[0]);
    }
  }

  function updateSessionField(key, value) {
    persistState({
      ...journalState,
      sessionProfile: {
        ...journalState.sessionProfile,
        [key]: value
      }
    });
  }

  function updateDailyPrepField(key, value) {
    persistState({
      ...journalState,
      dailyPrep: {
        ...journalState.dailyPrep,
        [key]: value
      }
    });
  }

  function updateNarrativeField(key, value, options = {}) {
    const nextNarrative = {
      ...journalState.narrativeProfile,
      [key]: value
    };
    const nextPremarket = { ...journalState.premarket };

    if (key === "profileLocation") nextPremarket.profileLocation = value;
    if (key === "auctionState") nextPremarket.auctionState = value;
    if (key === "dayType") nextPremarket.marketBehavior = value;
    if (key === "liquidityPath") nextPremarket.liquidityFocus = value;

    persistState(
      {
        ...journalState,
        narrativeProfile: nextNarrative,
        premarket: nextPremarket
      },
      options
    );
  }

  function updatePremarketField(key, value, options = {}) {
    persistState(
      {
        ...journalState,
        premarket: {
          ...journalState.premarket,
          [key]: value
        }
      },
      options
    );
  }

  function handleTradeAdd() {
    if (!tradeForm.entry.trim()) {
      return;
    }

    const nextState = {
      ...journalState,
      trades: [...journalState.trades, createTradePayload(tradeForm)]
    };

    persistState(nextState, { immediateSync: true });
    setTradeForm({
      session: "",
      model: "",
      dir: "Long",
      entry: "",
      exit: "",
      plannedRR: "",
      r: "",
      narrativeFit: "",
      trigger: "",
      notes: ""
    });
  }

  function handleTradeDelete(index) {
    persistState({
      ...journalState,
      trades: journalState.trades.filter((_, itemIndex) => itemIndex !== index)
    });
  }

  async function handleCopyMarkdown() {
    const markdown = createMarkdown({
      ticker: activeTicker,
      dateLabel,
      state: journalState
    });

    try {
      await navigator.clipboard.writeText(markdown);
      setSyncState((current) => ({
        ...current,
        message: "Markdown copied for manual paste."
      }));
    } catch (error) {
      setSyncState((current) => ({
        ...current,
        message: "Clipboard blocked in this browser."
      }));
    }
  }

  function handleClearDay() {
    const nextState = blankState();
    persistState(nextState, { immediateSync: true });
  }

  if (!hydrated) {
    return <main className="loading-shell">Loading trading workspace...</main>;
  }

  const readinessStroke = 2 * Math.PI * 27;
  const readinessOffset = readinessStroke - (metrics.readiness / 100) * readinessStroke;
  const setupToneClass =
    metrics.setup.tone === "bull"
      ? "is-good"
      : metrics.setup.tone === "warn"
        ? "is-warn"
        : metrics.setup.tone === "bear"
          ? "is-bad"
          : "";
  const previousContextLabel = instrumentConfig.requiresSessionProfile
    ? "Previous cash close"
    : "Prior daily close";
  const openContextLabel = instrumentConfig.requiresSessionProfile
    ? "Today's open"
    : "Daily open / handoff";

  return (
    <main className={`app-shell theme-${instrumentConfig.theme}`}>
      <aside className="side-nav">
        <div className="brand-block">
          <div className="brand-mark">Trade OS</div>
          <div className="brand-copy">
            Pre-market, profiling, execution and review in one workspace.
          </div>
          <div className="asset-badge-row">
            <span className="asset-badge">{instrumentConfig.label}</span>
            <span className="asset-badge soft">{instrumentConfig.rhythm}</span>
          </div>
        </div>

        <div className="side-panel">
          <div className="side-label">Tracked instruments</div>
          <div className="symbol-stack">
            {tickers.map((ticker) => (
              <div key={ticker} className={`symbol-pill ${ticker === activeTicker ? "live" : ""}`}>
                <button type="button" onClick={() => handleTickerSwitch(ticker)}>
                  {ticker}
                </button>
                {tickers.length > 1 ? (
                  <span onClick={() => handleRemoveTicker(ticker)}>x</span>
                ) : null}
              </div>
            ))}
          </div>
          {showTickerForm ? (
            <div className="ticker-form">
              <input
                value={newTicker}
                onChange={(event) => setNewTicker(event.target.value)}
                placeholder="Add symbol"
              />
              <div className="ticker-form-actions">
                <button type="button" onClick={handleAddTicker}>
                  Save
                </button>
                <button className="ghost" type="button" onClick={() => setShowTickerForm(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="subtle-btn" type="button" onClick={() => setShowTickerForm(true)}>
              Add symbol
            </button>
          )}
        </div>

        <div className="side-foot">
          <div>{protocol.completedStages} / {protocol.totalStages} stages complete</div>
          <div>{instrumentConfig.shortLabel}</div>
          <div>Sync: {syncState.configured ? syncState.status : "local only"}</div>
          <div>{syncState.pageUrl ? "Notion journal linked" : "No journal link yet"}</div>
        </div>
      </aside>

      <section className="workspace">
        <div className="platform-bar">
          <div className="platform-brand">
            <div className="platform-logo">
              <span />
              <span />
              <span />
            </div>
            <div className="platform-brand-copy">
              <strong>Trade OS</strong>
              <small>Orderflow Workspace</small>
            </div>
          </div>

          <nav className="platform-nav">
            {APP_VIEWS.map((item) => (
              <button
                key={item.id}
                className={`platform-link ${activeView === item.id ? "active" : ""}`}
                onClick={() => setActiveView(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="platform-actions">
            <button className="platform-utility" type="button" onClick={() => setActiveView("protocol")}>
              Tools
            </button>
            <button className="platform-pill" type="button" onClick={() => setActiveView("journal")}>
              {syncState.pageUrl ? "Notion" : "Journal"}
            </button>
          </div>
        </div>

        <header className="workspace-top">
          <div className="workspace-head">
            <div>
              <div className="eyebrow">Trading Workspace</div>
              <h1>{activeTicker} execution board</h1>
              <p>{dateLabel} | {instrumentConfig.rhythm}</p>
            </div>
            <div className="hero-gauge">
              <svg viewBox="0 0 64 64" width="64" height="64">
                <circle className="gauge-track" cx="32" cy="32" r="27" />
                <circle
                  className="gauge-fill"
                  cx="32"
                  cy="32"
                  r="27"
                  style={{
                    strokeDasharray: readinessStroke,
                    strokeDashoffset: readinessOffset
                  }}
                />
              </svg>
              <div className="gauge-pct">{metrics.readiness}%</div>
            </div>
          </div>

          <div className="top-action-bar">
            <div className="control-cluster">
              <label>Instrument</label>
              <select value={activeTicker} onChange={(event) => handleTickerSwitch(event.target.value)}>
                {tickers.map((ticker) => (
                  <option key={ticker} value={ticker}>
                    {ticker}
                  </option>
                ))}
              </select>
            </div>

            <div className="control-cluster">
              <label>History</label>
              <select
                value={selectedDateStr === currentDateStr ? "" : selectedDateStr}
                onChange={(event) => handleHistoryChange(event.target.value)}
              >
                <option value="">Today</option>
                {historyDates.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>

            <div className="top-actions">
              <button className="action-btn primary-outline" type="button" onClick={() => setActiveView("trades")}>
                + New trade
              </button>
              <button className="action-btn ghost" type="button" onClick={handleClearDay}>
                Reset day
              </button>
            </div>
          </div>

          <div className="status-grid">
            <div className="status-card">
              <span className="card-label">GO / NO-GO</span>
              <div className={`go-chip ${goNoGo.verdict === "GO" ? "go" : "no-go"}`}>{goNoGo.verdict}</div>
              <p>{goNoGo.blockers.length ? goNoGo.blockers[0] : "All required workflow gates are satisfied."}</p>
            </div>
            <div className={`status-card ${setupToneClass}`}>
              <span className="card-label">
                {instrumentConfig.requiresSessionProfile ? "Session Profile" : "Flow Context"}
              </span>
              <strong>{metrics.setup.label}</strong>
              <p>{metrics.setup.detail}</p>
            </div>
            <div className="status-card">
              <span className="card-label">Day Conclusion</span>
              <strong>{metrics.conclusion.label}</strong>
              <p>{metrics.conclusion.detail}</p>
            </div>
            <div className="status-card clocks-card">
              <span className="card-label">Execution Score</span>
              <strong>{metrics.executionScore}</strong>
              <p>
                NY {clockState.ny} | {metrics.wins} wins / {metrics.losses} losses / Net {metrics.netR}R
              </p>
            </div>
          </div>
        </header>

        {activeView === "overview" ? (
          <>
            <section className="module-card">
              <div className="module-head">
                <div>
                  <div className="eyebrow">Today</div>
                  <h2>Workflow snapshot</h2>
                </div>
              </div>
              <div className="overview-grid">
                {stages.map((stage, index) => (
                  <div key={stage.id} className={`mini-stage ${stage.complete ? "done" : stage.unlocked ? "live" : "mute"}`}>
                    <span>{index + 1}</span>
                    <strong>{stage.label}</strong>
                    <small>{stage.complete ? "Completed" : stage.unlocked ? "Ready to work" : "Locked"}</small>
                  </div>
                ))}
              </div>
            </section>

            <section className="module-card">
              <div className="module-head">
                <div>
                  <div className="eyebrow">Profile</div>
                  <h2>{instrumentConfig.sessionProfileTitle}</h2>
                  <p className="module-copy">{instrumentConfig.sessionProfileSubtitle}</p>
                </div>
              </div>
              {!instrumentConfig.requiresSessionProfile ? (
                <div className="context-banner optional">
                  BTC-style flow: keep profile tools visible, but they do not block GO / NO-GO.
                </div>
              ) : null}
              <div className="profile-grid">
                <div className="field-mini">
                  <label>VAH</label>
                  <input
                    value={journalState.sessionProfile.vah}
                    onChange={(event) => updateSessionField("vah", event.target.value)}
                    placeholder="Value Area High"
                  />
                </div>
                <div className="field-mini">
                  <label>VAL</label>
                  <input
                    value={journalState.sessionProfile.val}
                    onChange={(event) => updateSessionField("val", event.target.value)}
                    placeholder="Value Area Low"
                  />
                </div>
                <div className="field-mini">
                  <label>POC</label>
                  <input
                    value={journalState.sessionProfile.poc}
                    onChange={(event) => updateSessionField("poc", event.target.value)}
                    placeholder="Point of Control"
                  />
                </div>
                <div className="field-mini">
                  <label>VWAP</label>
                  <input
                    value={journalState.sessionProfile.vwap}
                    onChange={(event) => updateSessionField("vwap", event.target.value)}
                    placeholder="Session VWAP"
                  />
                </div>
              </div>
              <div className="dual-grid">
                <div>
                  <div className="field-label">
                    {instrumentConfig.requiresSessionProfile ? "Yesterday's close" : "Prior close"}
                  </div>
                  <select
                    value={journalState.sessionProfile.yestClose}
                    onChange={(event) => updateSessionField("yestClose", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="outside">Closed outside value</option>
                    <option value="inside">Closed inside value</option>
                  </select>
                </div>
                <div>
                  <div className="field-label">
                    {instrumentConfig.requiresSessionProfile ? "Today's open" : "Daily open"}
                  </div>
                  <select
                    value={journalState.sessionProfile.todayOpen}
                    onChange={(event) => updateSessionField("todayOpen", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="outside">Opened outside value</option>
                    <option value="inside">Opened inside value</option>
                  </select>
                </div>
              </div>
              <div className="field-label">LVN / gap notes</div>
              <input
                value={journalState.sessionProfile.lvn}
                onChange={(event) => updateSessionField("lvn", event.target.value)}
                placeholder="Low volume nodes, gaps, single prints, open drive references"
              />
            </section>

            <section className="module-card">
              <div className="module-head">
                <div>
                  <div className="eyebrow">Liquidity</div>
                  <h2>24-hour session flow</h2>
                </div>
              </div>
              <div className="session-strip">
                <div className="label-row">
                  <span>00:00 UTC</span>
                  <span>Global sessions</span>
                  <span>24:00 UTC</span>
                </div>
                <div className="strip-track">
                  {SESSION_SEGMENTS.map((segment) => (
                    <div
                      key={segment.label}
                      className={`strip-seg ${
                        segment.tone === "blue"
                          ? "sydney"
                          : segment.tone === "gold"
                            ? "london"
                            : "ny"
                      }`}
                      style={{
                        left: `${(segment.start / 24) * 100}%`,
                        width: `${((segment.end - segment.start) / 24) * 100}%`
                      }}
                    />
                  ))}
                  <div className="strip-now" style={{ left: `${clockState.utcPercent}%` }} />
                </div>
                <div className="strip-legend">
                  {SESSION_SEGMENTS.map((segment) => (
                    <span key={segment.label}>
                      <i
                        className="dot"
                        style={{
                          background:
                            segment.tone === "blue"
                              ? "var(--blue)"
                              : segment.tone === "gold"
                                ? "var(--amber)"
                                : "var(--green)"
                        }}
                      />
                      {segment.label}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          </>
        ) : null}

        {activeView === "protocol" ? (
          <>
            <section className="module-card">
              <div className="module-head">
                <div>
                  <div className="eyebrow">Pre-trade checklist</div>
                  <h2>Orderflow methodology</h2>
                  <p className="module-copy">
                    Built like a gated checklist. You only unlock the next layer after the current one is satisfied.
                    {instrumentConfig.requiresSessionProfile
                      ? " Session-profile context is part of the gate for this instrument."
                      : " Session-profile context stays optional for this instrument."}
                  </p>
                </div>
              </div>
            </section>

            <StageCard
              number="1"
              title="Daily Prep"
              subtitle="Lock the base rules before execution starts."
              complete={stages[0].complete}
              unlocked={stages[0].unlocked}
            >
              <div className="task-stack">
                <div className="task-row task-row-static">
                  <span className="task-check">{journalState.bias ? "x" : ""}</span>
                  <span className="task-copy">
                    <strong>Define the day&apos;s bias</strong>
                    <small>Profile framing. Pick a directional stance before the first trade.</small>
                  </span>
                  <SegmentedBias
                    value={journalState.bias}
                    onChange={(value) => persistState({ ...journalState, bias: value })}
                  />
                </div>
                <ToggleRow
                  title="Wait out the first 30 minutes"
                  detail="Setups stay locked until the opening rotation is done."
                  checked={journalState.dailyPrep.waitFirstThirty}
                  onToggle={() =>
                    updateDailyPrepField("waitFirstThirty", !journalState.dailyPrep.waitFirstThirty)
                  }
                />
                <ToggleRow
                  title="Previous day profile levels are marked"
                  detail="VAH, VAL, POC, VWAP and LVN from the previous session are mapped."
                  checked={journalState.dailyPrep.levelsMarked}
                  onToggle={() =>
                    updateDailyPrepField("levelsMarked", !journalState.dailyPrep.levelsMarked)
                  }
                />
                <ToggleRow
                  title="Event window reviewed"
                  detail="FOMC, CPI, NFP or major releases are mapped before the session."
                  checked={journalState.dailyPrep.eventRiskChecked}
                  onToggle={() =>
                    updateDailyPrepField("eventRiskChecked", !journalState.dailyPrep.eventRiskChecked)
                  }
                />
              </div>
            </StageCard>

            <StageCard
              number="2"
              title="Profile Map"
              subtitle="Build the matrix with previous day references before you form a conclusion."
              complete={stages[1].complete}
              unlocked={stages[1].unlocked}
            >
              <div className="protocol-grid">
                <div>
                  <div className="field-label">Previous session VAH</div>
                  <input
                    value={journalState.sessionProfile.vah}
                    onChange={(event) => updateSessionField("vah", event.target.value)}
                    placeholder="Previous day VAH"
                  />
                </div>
                <div>
                  <div className="field-label">Previous session VAL</div>
                  <input
                    value={journalState.sessionProfile.val}
                    onChange={(event) => updateSessionField("val", event.target.value)}
                    placeholder="Previous day VAL"
                  />
                </div>
                <div>
                  <div className="field-label">Previous session POC</div>
                  <input
                    value={journalState.sessionProfile.poc}
                    onChange={(event) => updateSessionField("poc", event.target.value)}
                    placeholder="Previous day POC"
                  />
                </div>
                <div>
                  <div className="field-label">Previous session VWAP</div>
                  <input
                    value={journalState.sessionProfile.vwap}
                    onChange={(event) => updateSessionField("vwap", event.target.value)}
                    placeholder="Previous day VWAP"
                  />
                </div>
                <div className="wide-field">
                  <div className="field-label">Previous session LVN</div>
                  <input
                    value={journalState.sessionProfile.lvn}
                    onChange={(event) => updateSessionField("lvn", event.target.value)}
                    placeholder="Low volume node notes, gap references, single prints"
                  />
                </div>
                <div>
                  <div className="field-label">
                    {instrumentConfig.requiresSessionProfile ? "Yesterday's close" : "Prior close"}
                  </div>
                  <select
                    value={journalState.sessionProfile.yestClose}
                    onChange={(event) => updateSessionField("yestClose", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="outside">Closed outside value</option>
                    <option value="inside">Closed inside value</option>
                  </select>
                </div>
                <div>
                  <div className="field-label">
                    {instrumentConfig.requiresSessionProfile ? "Today's open" : "Daily open"}
                  </div>
                  <select
                    value={journalState.sessionProfile.todayOpen}
                    onChange={(event) => updateSessionField("todayOpen", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="outside">Opened outside value</option>
                    <option value="inside">Opened inside value</option>
                  </select>
                </div>
                <div className="wide-field">
                  <div className={`context-banner ${metrics.setup.tone === "bear" ? "" : "optional"}`}>
                    Matrix read: {metrics.setup.label}. {metrics.setup.detail}
                  </div>
                </div>
              </div>
            </StageCard>

            <StageCard
              number="3"
              title="Narrative Builder"
              subtitle="Profile only. No mood, no trades, just the market map."
              complete={stages[2].complete}
              unlocked={stages[2].unlocked}
            >
              <div className="protocol-grid">
                <div>
                  <div className="field-label">{previousContextLabel}</div>
                  <select
                    value={journalState.narrativeProfile.prevCashClose}
                    onChange={(event) => updateNarrativeField("prevCashClose", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="Closed above prior value">Closed above prior value</option>
                    <option value="Closed inside prior value">Closed inside prior value</option>
                    <option value="Closed below prior value">Closed below prior value</option>
                    <option value="Closed outside the overnight range">Closed outside overnight range</option>
                  </select>
                </div>
                <div>
                  <div className="field-label">{openContextLabel}</div>
                  <select
                    value={journalState.narrativeProfile.todayOpen}
                    onChange={(event) => updateNarrativeField("todayOpen", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="Opened above value">Opened above value</option>
                    <option value="Opened inside value">Opened inside value</option>
                    <option value="Opened below value">Opened below value</option>
                    <option value="Opened outside overnight range">Opened outside overnight range</option>
                  </select>
                </div>
                <div>
                  <div className="field-label">Value context</div>
                  <select
                    value={journalState.narrativeProfile.valueContext}
                    onChange={(event) => updateNarrativeField("valueContext", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="Acceptance above value">Acceptance above value</option>
                    <option value="Rotating back into value">Rotating back into value</option>
                    <option value="Rejecting value edge">Rejecting value edge</option>
                    <option value="Still seeking value">Still seeking value</option>
                  </select>
                </div>
                <div>
                  <div className="field-label">Profile location</div>
                  <select
                    value={journalState.narrativeProfile.profileLocation}
                    onChange={(event) => updateNarrativeField("profileLocation", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="Value area edge">Value area edge</option>
                    <option value="At POC / acceptance">At POC / acceptance</option>
                    <option value="Outside value / imbalance">Outside value / imbalance</option>
                    <option value="Opening range boundary">Opening range boundary</option>
                    <option value="Mid-range / nowhere">Mid-range / nowhere</option>
                  </select>
                </div>
                <div>
                  <div className="field-label">Auction state</div>
                  <select
                    value={journalState.narrativeProfile.auctionState}
                    onChange={(event) => updateNarrativeField("auctionState", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="Balanced auction">Balanced auction</option>
                    <option value="Trend day building">Trend day building</option>
                    <option value="Trend down building">Trend down building</option>
                    <option value="Failed auction">Failed auction</option>
                    <option value="Double distribution / split day">Double distribution / split day</option>
                  </select>
                </div>
                <div>
                  <div className="field-label">Liquidity path</div>
                  <select
                    value={journalState.narrativeProfile.liquidityPath}
                    onChange={(event) => updateNarrativeField("liquidityPath", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="Sweep highs first">Sweep highs first</option>
                    <option value="Sweep lows first">Sweep lows first</option>
                    <option value="Two-way rotation">Two-way rotation</option>
                    <option value="No clean path yet">No clean path yet</option>
                  </select>
                </div>
                <div className="wide-field">
                  <div className="field-label">Day type hypothesis</div>
                  <select
                    value={journalState.narrativeProfile.dayType}
                    onChange={(event) => updateNarrativeField("dayType", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="Continuation">Continuation</option>
                    <option value="Reversal">Reversal</option>
                    <option value="Rotation">Rotation</option>
                    <option value="Expansion">Expansion</option>
                  </select>
                </div>
                <div className="wide-field">
                  <div className="field-label">Profile note</div>
                  <textarea
                    value={journalState.narrativeProfile.profileNote}
                    onChange={(event) =>
                      updateNarrativeField("profileNote", event.target.value, { sync: false })
                    }
                    onBlur={() =>
                      persistState({
                        ...journalState,
                        narrativeProfile: {
                          ...journalState.narrativeProfile,
                          profileNote: journalState.narrativeProfile.profileNote
                        }
                      })
                    }
                    placeholder="Just profile the market here: where it is, what value is doing, and what path looks most likely."
                  />
                </div>
              </div>
            </StageCard>

            <StageCard
              number="4"
              title="Orderflow Conclusion"
              subtitle="Use orderflow to confirm continuation, reversal, or stand-aside."
              complete={stages[3].complete}
              unlocked={stages[3].unlocked}
            >
              <div className="protocol-grid">
                <div>
                  <div className="field-label">HTF POI</div>
                  <select
                    value={journalState.premarket.htfPoi}
                    onChange={(event) => updatePremarketField("htfPoi", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="Weekly high / low">Weekly high / low</option>
                    <option value="Daily high / low">Daily high / low</option>
                    <option value="Value area edge">Value area edge</option>
                    <option value="Unmitigated order block">Unmitigated order block</option>
                    <option value="HTF fair value gap">HTF fair value gap</option>
                    <option value="Open / VWAP reference">Open / VWAP reference</option>
                  </select>
                </div>
                <div>
                  <div className="field-label">Orderflow</div>
                  <select
                    value={journalState.premarket.orderFlow}
                    onChange={(event) => updatePremarketField("orderFlow", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="Displacement with follow-through">Displacement with follow-through</option>
                    <option value="Absorption at level">Absorption at level</option>
                    <option value="Failed breakout">Failed breakout</option>
                    <option value="Sweep then reclaim">Sweep then reclaim</option>
                    <option value="Trend auction">Trend auction</option>
                    <option value="Choppy / two-way">Choppy / two-way</option>
                  </select>
                </div>
                <div>
                  <div className="field-label">Initiative</div>
                  <select
                    value={journalState.premarket.initiative}
                    onChange={(event) => updatePremarketField("initiative", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="Buyers in control">Buyers in control</option>
                    <option value="Sellers in control">Sellers in control</option>
                    <option value="No initiative yet">No initiative yet</option>
                    <option value="Initiative failed">Initiative failed</option>
                  </select>
                </div>
                <div>
                  <div className="field-label">Response at level</div>
                  <select
                    value={journalState.premarket.response}
                    onChange={(event) => updatePremarketField("response", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="Acceptance above level">Acceptance above level</option>
                    <option value="Acceptance below level">Acceptance below level</option>
                    <option value="Rejection from level">Rejection from level</option>
                    <option value="No clear response">No clear response</option>
                  </select>
                </div>
                <div>
                  <div className="field-label">CVD / delta</div>
                  <select
                    value={journalState.premarket.cvdState}
                    onChange={(event) => updatePremarketField("cvdState", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="Aligned with price">Aligned with price</option>
                    <option value="Aggression absorbed">Aggression absorbed</option>
                    <option value="Diverging from price">Diverging from price</option>
                    <option value="Loading before break">Loading before break</option>
                    <option value="Flat / non-confirming">Flat / non-confirming</option>
                  </select>
                </div>
                <div>
                  <div className="field-label">Tape state</div>
                  <select
                    value={journalState.premarket.tapeState}
                    onChange={(event) => updatePremarketField("tapeState", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="Fast tape with size">Fast tape with size</option>
                    <option value="Slow tape / no urgency">Slow tape / no urgency</option>
                    <option value="Big prints defending level">Big prints defending level</option>
                    <option value="Exhaustion into level">Exhaustion into level</option>
                    <option value="Noise only">Noise only</option>
                  </select>
                </div>
                <div>
                  <div className="field-label">Execution lane</div>
                  <select
                    value={journalState.premarket.executionLane}
                    onChange={(event) => updatePremarketField("executionLane", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="Trend / continuation">Trend / continuation</option>
                    <option value="Mean reversion / fade">Mean reversion / fade</option>
                    <option value="Wait for confirmation">Wait for confirmation</option>
                    <option value="No trade / buffer">No trade / buffer</option>
                  </select>
                </div>
                <div>
                  <div className="field-label">Session liquidity</div>
                  <select
                    value={journalState.premarket.sessionLiquidity}
                    onChange={(event) => updatePremarketField("sessionLiquidity", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="Asia sweep likely">Asia sweep likely</option>
                    <option value="London open raid">London open raid</option>
                    <option value="New York AM expansion">New York AM expansion</option>
                    <option value="New York PM mean reversion">New York PM mean reversion</option>
                    <option value="Multi-session liquidity pool">Multi-session liquidity pool</option>
                  </select>
                </div>
                <div className="wide-field">
                  <div className={`context-banner ${metrics.conclusion.tone === "bull" ? "optional" : ""}`}>
                    Conclusion: {metrics.conclusion.label}. {metrics.conclusion.detail}
                  </div>
                  <div className="reason-list">
                    {metrics.conclusion.reasons.map((reason) => (
                      <span key={reason} className="reason-pill">
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </StageCard>
          </>
        ) : null}

        {activeView === "narrative" ? (
          <section className="module-card">
            <div className="module-head">
              <div>
                <div className="eyebrow">Narrative Builder</div>
                <h2>Market profiling only</h2>
                <p className="module-copy">
                  This section is only for profiling what the market is doing. Mood, journaling and trades stay elsewhere.
                </p>
              </div>
            </div>
            <div className="narrative-summary">
              <div className="summary-pill">{formatBiasLabel(journalState.bias)}</div>
              <div className="summary-pill">{journalState.narrativeProfile.dayType || "Day type pending"}</div>
              <div className="summary-pill">{journalState.narrativeProfile.auctionState || "Auction pending"}</div>
              <div className="summary-pill">{instrumentConfig.shortLabel}</div>
            </div>
            <div className="protocol-grid">
              <div>
                <div className="field-label">{previousContextLabel}</div>
                <select
                  value={journalState.narrativeProfile.prevCashClose}
                  onChange={(event) => updateNarrativeField("prevCashClose", event.target.value)}
                >
                  <option value="">Select</option>
                  <option value="Closed above prior value">Closed above prior value</option>
                  <option value="Closed inside prior value">Closed inside prior value</option>
                  <option value="Closed below prior value">Closed below prior value</option>
                  <option value="Closed outside the overnight range">Closed outside overnight range</option>
                </select>
              </div>
              <div>
                <div className="field-label">{openContextLabel}</div>
                <select
                  value={journalState.narrativeProfile.todayOpen}
                  onChange={(event) => updateNarrativeField("todayOpen", event.target.value)}
                >
                  <option value="">Select</option>
                  <option value="Opened above value">Opened above value</option>
                  <option value="Opened inside value">Opened inside value</option>
                  <option value="Opened below value">Opened below value</option>
                  <option value="Opened outside overnight range">Opened outside overnight range</option>
                </select>
              </div>
              <div>
                <div className="field-label">Value context</div>
                <select
                  value={journalState.narrativeProfile.valueContext}
                  onChange={(event) => updateNarrativeField("valueContext", event.target.value)}
                >
                  <option value="">Select</option>
                  <option value="Acceptance above value">Acceptance above value</option>
                  <option value="Rotating back into value">Rotating back into value</option>
                  <option value="Rejecting value edge">Rejecting value edge</option>
                  <option value="Still seeking value">Still seeking value</option>
                </select>
              </div>
              <div>
                <div className="field-label">Profile location</div>
                <select
                  value={journalState.narrativeProfile.profileLocation}
                  onChange={(event) => updateNarrativeField("profileLocation", event.target.value)}
                >
                  <option value="">Select</option>
                  <option value="Value area edge">Value area edge</option>
                  <option value="At POC / acceptance">At POC / acceptance</option>
                  <option value="Outside value / imbalance">Outside value / imbalance</option>
                  <option value="Opening range boundary">Opening range boundary</option>
                  <option value="Mid-range / nowhere">Mid-range / nowhere</option>
                </select>
              </div>
              <div>
                <div className="field-label">Auction state</div>
                <select
                  value={journalState.narrativeProfile.auctionState}
                  onChange={(event) => updateNarrativeField("auctionState", event.target.value)}
                >
                  <option value="">Select</option>
                  <option value="Balanced auction">Balanced auction</option>
                  <option value="Trend day building">Trend day building</option>
                  <option value="Trend down building">Trend down building</option>
                  <option value="Failed auction">Failed auction</option>
                  <option value="Double distribution / split day">Double distribution / split day</option>
                </select>
              </div>
              <div>
                <div className="field-label">Liquidity path</div>
                <select
                  value={journalState.narrativeProfile.liquidityPath}
                  onChange={(event) => updateNarrativeField("liquidityPath", event.target.value)}
                >
                  <option value="">Select</option>
                  <option value="Sweep highs first">Sweep highs first</option>
                  <option value="Sweep lows first">Sweep lows first</option>
                  <option value="Two-way rotation">Two-way rotation</option>
                  <option value="No clean path yet">No clean path yet</option>
                </select>
              </div>
              <div className="wide-field">
                <div className="field-label">Day type hypothesis</div>
                <select
                  value={journalState.narrativeProfile.dayType}
                  onChange={(event) => updateNarrativeField("dayType", event.target.value)}
                >
                  <option value="">Select</option>
                  <option value="Continuation">Continuation</option>
                  <option value="Reversal">Reversal</option>
                  <option value="Rotation">Rotation</option>
                  <option value="Expansion">Expansion</option>
                </select>
              </div>
              <div className="wide-field">
                <div className="field-label">Profile note</div>
                <textarea
                  value={journalState.narrativeProfile.profileNote}
                  onChange={(event) =>
                    updateNarrativeField("profileNote", event.target.value, { sync: false })
                  }
                  onBlur={() =>
                    persistState({
                      ...journalState,
                      narrativeProfile: {
                        ...journalState.narrativeProfile,
                        profileNote: journalState.narrativeProfile.profileNote
                      }
                    })
                  }
                  placeholder="Keep this purely profile-based: who is in control, where value sits, and what path seems likely."
                />
              </div>
            </div>
          </section>
        ) : null}

        {activeView === "trades" ? (
          <section className="module-card">
            <div className="module-head">
              <div>
                <div className="eyebrow">Execution</div>
                <h2>Trade log</h2>
                <p className="module-copy">Log only the trades that fit the narrative or explicitly note when you traded against it.</p>
              </div>
            </div>
            <div className="trade-form">
              <select
                value={tradeForm.session}
                onChange={(event) => setTradeForm((current) => ({ ...current, session: event.target.value }))}
              >
                <option value="">Session</option>
                <option value="Asia">Asia</option>
                <option value="London">London</option>
                <option value="New York AM">New York AM</option>
                <option value="New York PM">New York PM</option>
              </select>
              <select
                value={tradeForm.model}
                onChange={(event) => setTradeForm((current) => ({ ...current, model: event.target.value }))}
              >
                <option value="">Model</option>
                <option value="Continuation">Continuation</option>
                <option value="Reversal">Reversal</option>
                <option value="Expansion">Expansion</option>
                <option value="Mean Reversion">Mean Reversion</option>
              </select>
              <select
                value={tradeForm.dir}
                onChange={(event) => setTradeForm((current) => ({ ...current, dir: event.target.value }))}
              >
                <option value="Long">Long</option>
                <option value="Short">Short</option>
              </select>
              <input
                value={tradeForm.entry}
                onChange={(event) => setTradeForm((current) => ({ ...current, entry: event.target.value }))}
                placeholder="Entry"
              />
              <input
                value={tradeForm.exit}
                onChange={(event) => setTradeForm((current) => ({ ...current, exit: event.target.value }))}
                placeholder="Exit"
              />
              <input
                value={tradeForm.plannedRR}
                onChange={(event) =>
                  setTradeForm((current) => ({ ...current, plannedRR: event.target.value }))
                }
                placeholder="Planned RR"
              />
              <input
                value={tradeForm.r}
                onChange={(event) => setTradeForm((current) => ({ ...current, r: event.target.value }))}
                placeholder="R"
              />
              <select
                value={tradeForm.narrativeFit}
                onChange={(event) =>
                  setTradeForm((current) => ({ ...current, narrativeFit: event.target.value }))
                }
              >
                <option value="">Narrative fit</option>
                <option value="With narrative">With narrative</option>
                <option value="Counter narrative">Counter narrative</option>
                <option value="Neutral / scalp">Neutral / scalp</option>
              </select>
              <select
                value={tradeForm.trigger}
                onChange={(event) => setTradeForm((current) => ({ ...current, trigger: event.target.value }))}
              >
                <option value="">Trigger</option>
                <option value="Structure Shift (2m)">Structure Shift (2m)</option>
                <option value="Absorption (5m)">Absorption (5m)</option>
                <option value="Liquidity Sweep">Liquidity Sweep</option>
                <option value="VWAP Reclaim">VWAP Reclaim</option>
                <option value="Other">Other</option>
              </select>
              <input
                className="full"
                value={tradeForm.notes}
                onChange={(event) => setTradeForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Notes - execution, mistake, what to repeat"
              />
            </div>
            <button className="action-btn primary-outline full-width" type="button" onClick={handleTradeAdd}>
              Log trade
            </button>

            <div className="trade-log-wrap">
              {journalState.trades.length ? (
                <>
                  <div className="trade-row head trade-row-wide">
                    <span>Dir</span>
                    <span>Session</span>
                    <span>Model</span>
                    <span>Entry</span>
                    <span>Exit</span>
                    <span>Plan RR</span>
                    <span>R</span>
                    <span>Narrative</span>
                    <span>Trigger</span>
                    <span>Notes</span>
                    <span></span>
                  </div>
                  {journalState.trades.map((trade, index) => (
                    <div key={`${trade.entry}-${index}`} className="trade-row trade-row-wide">
                      <span>{trade.dir}</span>
                      <span>{trade.session || "-"}</span>
                      <span>{trade.model || "-"}</span>
                      <span>{trade.entry}</span>
                      <span>{trade.exit || "-"}</span>
                      <span>{trade.plannedRR || "-"}</span>
                      <span className={Number.parseFloat(trade.r) >= 0 ? "r-pos" : "r-neg"}>
                        {trade.r || "-"}
                      </span>
                      <span>{trade.narrativeFit || "-"}</span>
                      <span>{trade.trigger || "-"}</span>
                      <span>{trade.notes || "-"}</span>
                      <span className="del" onClick={() => handleTradeDelete(index)}>
                        x
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <div className="empty-note">No trades logged yet today.</div>
              )}
            </div>
          </section>
        ) : null}

        {activeView === "journal" ? (
          <section className="module-card">
            <div className="module-head">
              <div>
                <div className="eyebrow">Journal</div>
                <h2>Context, mood and review</h2>
                <p className="module-copy">This is where your personal state and journaling live, separate from market profiling.</p>
              </div>
            </div>
            <div className="dual-grid">
              <div>
                <div className="field-label">Mood</div>
                <select
                  value={journalState.premarket.mood}
                  onChange={(event) => updatePremarketField("mood", event.target.value)}
                >
                  <option value="">Select</option>
                  <option value="Calm">Calm</option>
                  <option value="Locked in">Locked in</option>
                  <option value="Hesitant">Hesitant</option>
                  <option value="FOMO risk">FOMO risk</option>
                  <option value="Tired / low focus">Tired / low focus</option>
                </select>
              </div>
              <div>
                <div className="field-label">Key level / nPOC reference</div>
                <input
                  value={journalState.keyLevel}
                  onChange={(event) =>
                    persistState({ ...journalState, keyLevel: event.target.value }, { sync: false })
                  }
                  onBlur={() => persistState({ ...journalState, keyLevel: journalState.keyLevel })}
                  placeholder="Weekly VAH, daily nPOC, open drive edge"
                />
              </div>
            </div>
            <div className="field-label">Bias notes</div>
            <textarea
              value={journalState.biasNotes}
              onChange={(event) =>
                persistState({ ...journalState, biasNotes: event.target.value }, { sync: false })
              }
              onBlur={() => persistState({ ...journalState, biasNotes: journalState.biasNotes })}
              placeholder="Why this bias, what confirms it, and what invalidates it."
            />
            <div className="field-label">Trade narrative</div>
            <textarea
              value={journalState.premarket.thesisNarrative}
              onChange={(event) => updatePremarketField("thesisNarrative", event.target.value, { sync: false })}
              onBlur={() =>
                persistState({
                  ...journalState,
                  premarket: {
                    ...journalState.premarket,
                    thesisNarrative: journalState.premarket.thesisNarrative
                  }
                })
              }
              placeholder="This can include the story you traded, what you expected, and where you deviated."
            />
            <div className="dual-grid">
              <div>
                <div className="field-label">Macro theme</div>
                <input
                  value={journalState.macroTheme}
                  onChange={(event) =>
                    persistState({ ...journalState, macroTheme: event.target.value }, { sync: false })
                  }
                  onBlur={() =>
                    persistState({ ...journalState, macroTheme: journalState.macroTheme })
                  }
                  placeholder="Dollar strength, risk-on, CPI drift..."
                />
              </div>
              <div>
                <div className="field-label">Playbook focus</div>
                <input
                  value={journalState.playbookFocus}
                  onChange={(event) =>
                    persistState({ ...journalState, playbookFocus: event.target.value }, { sync: false })
                  }
                  onBlur={() =>
                    persistState({ ...journalState, playbookFocus: journalState.playbookFocus })
                  }
                  placeholder="Wait for reclaim, only continuation, fade extremes..."
                />
              </div>
            </div>
            <div className="field-label">Rule of day</div>
            <input
              value={journalState.ruleOfDay}
              onChange={(event) =>
                persistState({ ...journalState, ruleOfDay: event.target.value }, { sync: false })
              }
              onBlur={() => persistState({ ...journalState, ruleOfDay: journalState.ruleOfDay })}
              placeholder="No second entry after first stop. Wait for confirmation."
            />
            <div className="field-label">Execution review</div>
            <textarea
              value={journalState.executionReview}
              onChange={(event) =>
                persistState({ ...journalState, executionReview: event.target.value }, { sync: false })
              }
              onBlur={() =>
                persistState({
                  ...journalState,
                  executionReview: journalState.executionReview
                })
              }
              placeholder="What to repeat, what to cut, what the market taught today."
            />
            <div className="footer-actions">
              <button className="action-btn ghost" type="button" onClick={() => queueSync(journalState, { immediate: true })}>
                Sync now
              </button>
              <button className="action-btn ghost" type="button" onClick={handleCopyMarkdown}>
                Copy for Notion
              </button>
              {syncState.pageUrl ? (
                <a className="notion-link" href={syncState.pageUrl} target="_blank" rel="noreferrer">
                  Open Notion
                </a>
              ) : null}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
