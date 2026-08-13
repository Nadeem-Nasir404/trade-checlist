"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  blankState,
  buildAnalytics,
  buildTodayClockState,
  calculateMetrics,
  computeAutoR,
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
  exportAllData,
  getAllDayStates,
  getHistory,
  importAllData,
  loadDay,
  loadSyncMeta,
  loadTickers,
  saveDay,
  saveSyncMeta,
  saveTickers
} from "../lib/local-store";

const SESSION_SEGMENTS = [
  { label: "Sydney / Tokyo", start: 0, end: 9, tone: "sydney" },
  { label: "London", start: 8, end: 17, tone: "london" },
  { label: "New York", start: 13, end: 22, tone: "ny" }
];

const APP_VIEWS = [
  { id: "today", label: "Today" },
  { id: "trades", label: "Trades" },
  { id: "stats", label: "Stats" },
  { id: "journal", label: "Journal" }
];

const BIAS_OPTIONS = [
  { value: "bearish", label: "Short", tone: "short" },
  { value: "neutral", label: "Neutral", tone: "neutral" },
  { value: "bullish", label: "Long", tone: "long" }
];

const EMPTY_TRADE_FORM = {
  session: "",
  model: "",
  dir: "Long",
  entry: "",
  exit: "",
  stop: "",
  plannedRR: "",
  r: "",
  narrativeFit: "",
  trigger: "",
  notes: ""
};

function createTradePayload(form) {
  return {
    session: form.session,
    model: form.model,
    dir: form.dir,
    entry: form.entry.trim(),
    exit: form.exit.trim(),
    stop: form.stop.trim(),
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path d="M2 6.2 4.8 9 10 3.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StageCard({ number, title, subtitle, complete, unlocked, children }) {
  return (
    <section className={`card stage-card ${complete ? "complete" : ""} ${!unlocked ? "locked" : ""}`}>
      <div className="stage-head">
        <div>
          <div className="eyebrow">{number}. {title}</div>
          <p className="stage-subtitle">{subtitle}</p>
        </div>
        <span className={`pill ${complete ? "pill-accent" : unlocked ? "pill-live" : ""}`}>
          {complete ? "Done" : unlocked ? "Active" : "Locked"}
        </span>
      </div>
      {unlocked ? children : <div className="locked-note">Complete the previous stage to unlock this step.</div>}
    </section>
  );
}

function ToggleRow({ title, detail, checked, onToggle }) {
  return (
    <button className={`task-row ${checked ? "done" : ""}`} onClick={onToggle} type="button" aria-pressed={checked}>
      <span className="task-check">{checked ? <CheckIcon /> : null}</span>
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

function Field({ label, children, wide }) {
  return (
    <div className={wide ? "field wide-field" : "field"}>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

export default function Page() {
  const today = dateStr(new Date());
  const [hydrated, setHydrated] = useState(false);
  const [activeView, setActiveView] = useState("today");
  const [tickers, setTickers] = useState(DEFAULT_TICKERS);
  const [activeTicker, setActiveTicker] = useState(DEFAULT_TICKERS[0]);
  const [currentDateStr] = useState(today);
  const [selectedDateStr, setSelectedDateStr] = useState(today);
  const [journalState, setJournalState] = useState(blankState());
  const [historyDates, setHistoryDates] = useState([]);
  const [newTicker, setNewTicker] = useState("");
  const [showTickerForm, setShowTickerForm] = useState(false);
  const [tradeForm, setTradeForm] = useState(EMPTY_TRADE_FORM);
  const [confirmReset, setConfirmReset] = useState(false);
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
  const importInputRef = useRef(null);

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
  const autoR = useMemo(() => computeAutoR(tradeForm), [tradeForm]);
  const analytics = useMemo(
    () => (hydrated && activeView === "stats" ? buildAnalytics(getAllDayStates(activeTicker), activeTicker) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hydrated, activeView, activeTicker, journalState]
  );

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
    setTradeForm(EMPTY_TRADE_FORM);
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
    if (!confirmReset) {
      setConfirmReset(true);
      window.setTimeout(() => setConfirmReset(false), 3500);
      return;
    }

    setConfirmReset(false);
    const nextState = blankState();
    persistState(nextState, { immediateSync: true });
  }

  function handleExportBackup() {
    const payload = exportAllData();
    if (!payload) {
      return;
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `trade-journal-backup-${currentDateStr}.json`;
    anchor.click();
    URL.revokeObjectURL(url);

    setSyncState((current) => ({
      ...current,
      message: "Backup JSON downloaded."
    }));
  }

  async function handleImportBackup(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!importAllData(payload)) {
        throw new Error("Invalid backup file.");
      }

      const storedTickers = loadTickers();
      const nextTicker = storedTickers.includes(activeTicker) ? activeTicker : storedTickers[0];
      const loaded = normalizeState(loadDay(nextTicker, selectedDateStr) || blankState());
      setTickers(storedTickers);
      setActiveTicker(nextTicker);
      setJournalState(loaded);
      refreshHistoryFor(nextTicker);

      setSyncState((current) => ({
        ...current,
        message: "Backup imported. Local data restored."
      }));
    } catch (error) {
      setSyncState((current) => ({
        ...current,
        message: `Import failed: ${error.message}`
      }));
    }
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
  const syncTone = !syncState.configured
    ? "off"
    : syncState.status === "error"
      ? "err"
      : syncState.status === "syncing"
        ? "busy"
        : "ok";

  return (
    <main className={`app theme-${instrumentConfig.theme}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">Trade OS</span>
          <span className="brand-sub">Pre-market protocol</span>
        </div>

        <nav className="tabs">
          {APP_VIEWS.map((item) => (
            <button
              key={item.id}
              className={`tab ${activeView === item.id ? "active" : ""}`}
              onClick={() => setActiveView(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="topbar-right">
          <div className="clocks">
            <span><em>UTC</em>{clockState.utc}</span>
            <span><em>LDN</em>{clockState.london}</span>
            <span><em>NY</em>{clockState.ny}</span>
            <span><em>PK</em>{clockState.pk}</span>
          </div>
          <span className={`sync-pill ${syncTone}`} title={syncState.message}>
            <i />
            {syncState.configured ? "Notion" : "Local"}
          </span>
        </div>
      </header>

      <div className="content">
        <div className="page-head">
          <div>
            <h1>{activeTicker}</h1>
            <p>{dateLabel} · {instrumentConfig.label} · {instrumentConfig.rhythm}</p>
          </div>
          <div className="gauge" title={`Readiness ${metrics.readiness}%`}>
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

        <div className="controls">
          <div className="symbol-list">
            {tickers.map((ticker) => (
              <div key={ticker} className={`symbol-pill ${ticker === activeTicker ? "live" : ""}`}>
                <button type="button" onClick={() => handleTickerSwitch(ticker)}>
                  {ticker}
                </button>
                {tickers.length > 1 ? (
                  <button
                    type="button"
                    className="pill-remove"
                    aria-label={`Remove ${ticker}`}
                    onClick={() => handleRemoveTicker(ticker)}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
            {showTickerForm ? (
              <div className="ticker-form">
                <input
                  value={newTicker}
                  onChange={(event) => setNewTicker(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleAddTicker();
                  }}
                  placeholder="Symbol"
                  autoFocus
                />
                <button type="button" onClick={handleAddTicker}>Add</button>
                <button className="btn-ghost" type="button" onClick={() => setShowTickerForm(false)}>×</button>
              </div>
            ) : (
              <button className="symbol-add" type="button" onClick={() => setShowTickerForm(true)}>
                +
              </button>
            )}
          </div>

          <div className="controls-right">
            <select
              className="history-select"
              value={selectedDateStr === currentDateStr ? "" : selectedDateStr}
              onChange={(event) => handleHistoryChange(event.target.value)}
              aria-label="History"
            >
              <option value="">Today</option>
              {historyDates.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" type="button" onClick={() => setActiveView("trades")}>
              + Trade
            </button>
            <button
              className={`btn ${confirmReset ? "btn-danger" : "btn-ghost"}`}
              type="button"
              onClick={handleClearDay}
            >
              {confirmReset ? "Confirm reset" : "Reset"}
            </button>
          </div>
        </div>

        {activeView === "today" ? (
          <>
            <div className="status-row">
              <div className="status-card">
                <span className="card-label">GO / NO-GO</span>
                <div className={`go-chip ${goNoGo.verdict === "GO" ? "go" : "no-go"}`}>{goNoGo.verdict}</div>
                <p>{goNoGo.blockers.length ? goNoGo.blockers[0] : "All workflow gates satisfied."}</p>
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
              <div className="status-card">
                <span className="card-label">Execution Score</span>
                <strong>{metrics.executionScore}</strong>
                <p>
                  {protocol.completedStages}/{protocol.totalStages} stages · {metrics.wins}W / {metrics.losses}L · Net {metrics.netR}R
                </p>
              </div>
            </div>

            <StageCard
              number="1"
              title="Daily Prep"
              subtitle="Lock the base rules before execution starts."
              complete={stages[0].complete}
              unlocked={stages[0].unlocked}
            >
              <div className="task-stack">
                <div className="task-row task-row-static">
                  <span className="task-check">{journalState.bias ? <CheckIcon /> : null}</span>
                  <span className="task-copy">
                    <strong>Define the day&apos;s bias</strong>
                    <small>Pick a directional stance before the first trade.</small>
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
              {!instrumentConfig.requiresSessionProfile ? (
                <div className="context-banner optional">
                  Flow instrument: profile levels stay visible but do not block GO / NO-GO.
                </div>
              ) : null}
              <div className="grid-4">
                <Field label="VAH">
                  <input
                    value={journalState.sessionProfile.vah}
                    onChange={(event) => updateSessionField("vah", event.target.value)}
                    placeholder="Value Area High"
                  />
                </Field>
                <Field label="VAL">
                  <input
                    value={journalState.sessionProfile.val}
                    onChange={(event) => updateSessionField("val", event.target.value)}
                    placeholder="Value Area Low"
                  />
                </Field>
                <Field label="POC">
                  <input
                    value={journalState.sessionProfile.poc}
                    onChange={(event) => updateSessionField("poc", event.target.value)}
                    placeholder="Point of Control"
                  />
                </Field>
                <Field label="VWAP">
                  <input
                    value={journalState.sessionProfile.vwap}
                    onChange={(event) => updateSessionField("vwap", event.target.value)}
                    placeholder="Session VWAP"
                  />
                </Field>
              </div>
              <div className="grid-2">
                <Field label={instrumentConfig.requiresSessionProfile ? "Yesterday's close" : "Prior close"}>
                  <select
                    value={journalState.sessionProfile.yestClose}
                    onChange={(event) => updateSessionField("yestClose", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="outside">Closed outside value</option>
                    <option value="inside">Closed inside value</option>
                  </select>
                </Field>
                <Field label={instrumentConfig.requiresSessionProfile ? "Today's open" : "Daily open"}>
                  <select
                    value={journalState.sessionProfile.todayOpen}
                    onChange={(event) => updateSessionField("todayOpen", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="outside">Opened outside value</option>
                    <option value="inside">Opened inside value</option>
                  </select>
                </Field>
              </div>
              <Field label="LVN / gap notes">
                <input
                  value={journalState.sessionProfile.lvn}
                  onChange={(event) => updateSessionField("lvn", event.target.value)}
                  placeholder="Low volume nodes, gaps, single prints, open drive references"
                />
              </Field>
              <div className={`context-banner ${metrics.setup.tone === "bull" ? "optional" : ""}`}>
                Matrix read: {metrics.setup.label}. {metrics.setup.detail}
              </div>
            </StageCard>

            <StageCard
              number="3"
              title="Narrative Builder"
              subtitle="Profile only. No mood, no trades, just the market map."
              complete={stages[2].complete}
              unlocked={stages[2].unlocked}
            >
              <div className="grid-2">
                <Field label={previousContextLabel}>
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
                </Field>
                <Field label={openContextLabel}>
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
                </Field>
                <Field label="Value context">
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
                </Field>
                <Field label="Profile location">
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
                </Field>
                <Field label="Auction state">
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
                </Field>
                <Field label="Liquidity path">
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
                </Field>
                <Field label="Day type hypothesis" wide>
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
                </Field>
                <Field label="Profile note" wide>
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
                </Field>
              </div>
            </StageCard>

            <StageCard
              number="4"
              title="Orderflow Conclusion"
              subtitle="Use orderflow to confirm continuation, reversal, or stand-aside."
              complete={stages[3].complete}
              unlocked={stages[3].unlocked}
            >
              <div className="grid-2">
                <Field label="HTF POI">
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
                </Field>
                <Field label="Orderflow">
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
                </Field>
                <Field label="Initiative">
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
                </Field>
                <Field label="Response at level">
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
                </Field>
                <Field label="CVD / delta">
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
                </Field>
                <Field label="Tape state">
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
                </Field>
                <Field label="Execution lane">
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
                </Field>
                <Field label="Session liquidity">
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
                </Field>
              </div>
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
            </StageCard>

            <section className="card">
              <div className="card-head">
                <div>
                  <div className="eyebrow">Liquidity</div>
                  <h2>24-hour session flow</h2>
                </div>
              </div>
              <div className="session-strip">
                <div className="strip-track">
                  {SESSION_SEGMENTS.map((segment) => (
                    <div
                      key={segment.label}
                      className={`strip-seg ${segment.tone}`}
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
                      <i className={`dot ${segment.tone}`} />
                      {segment.label}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          </>
        ) : null}

        {activeView === "trades" ? (
          <section className="card">
            <div className="card-head">
              <div>
                <div className="eyebrow">Execution</div>
                <h2>Trade log</h2>
                <p className="card-copy">Log only the trades that fit the narrative — or explicitly note when you traded against it.</p>
              </div>
            </div>

            <div className="day-stats">
              <div className="day-stat">
                <span>Net R</span>
                <strong className={metrics.netR > 0 ? "r-pos" : metrics.netR < 0 ? "r-neg" : ""}>{metrics.netR}R</strong>
              </div>
              <div className="day-stat">
                <span>Win rate</span>
                <strong>{metrics.winRate}%</strong>
              </div>
              <div className="day-stat">
                <span>Wins / Losses</span>
                <strong>{metrics.wins} / {metrics.losses}</strong>
              </div>
              <div className="day-stat">
                <span>Best trade</span>
                <strong className="r-pos">{metrics.bestTrade}R</strong>
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
                value={tradeForm.stop}
                onChange={(event) => setTradeForm((current) => ({ ...current, stop: event.target.value }))}
                placeholder="Stop"
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
                placeholder="Notes — execution, mistake, what to repeat"
              />
            </div>
            <div className="trade-form-foot">
              <div className={`auto-r-hint ${autoR !== null ? "ready" : ""}`}>
                {autoR !== null ? (
                  <>
                    Auto R from entry / stop / exit: <strong>{autoR}R</strong>
                  </>
                ) : (
                  "Fill entry, stop and exit to auto-compute R."
                )}
              </div>
              {autoR !== null ? (
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setTradeForm((current) => ({ ...current, r: String(autoR) }))}
                >
                  Use {autoR}R
                </button>
              ) : null}
              <button className="btn btn-primary" type="button" onClick={handleTradeAdd}>
                Log trade
              </button>
            </div>

            <div className="trade-log-wrap">
              {journalState.trades.length ? (
                <>
                  <div className="trade-row head trade-row-wide">
                    <span>Dir</span>
                    <span>Session</span>
                    <span>Model</span>
                    <span>Entry</span>
                    <span>Exit</span>
                    <span>Stop</span>
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
                      <span>{trade.stop || "-"}</span>
                      <span>{trade.plannedRR || "-"}</span>
                      <span
                        className={
                          Number.isFinite(Number.parseFloat(trade.r))
                            ? Number.parseFloat(trade.r) >= 0
                              ? "r-pos"
                              : "r-neg"
                            : ""
                        }
                      >
                        {trade.r || "-"}
                      </span>
                      <span>{trade.narrativeFit || "-"}</span>
                      <span>{trade.trigger || "-"}</span>
                      <span>{trade.notes || "-"}</span>
                      <button
                        type="button"
                        className="del"
                        aria-label={`Delete trade ${index + 1}`}
                        onClick={() => handleTradeDelete(index)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </>
              ) : (
                <div className="empty-note">No trades logged yet today.</div>
              )}
            </div>
          </section>
        ) : null}

        {activeView === "stats" ? (
          <>
            <section className="card">
              <div className="card-head">
                <div>
                  <div className="eyebrow">Performance</div>
                  <h2>{activeTicker} analytics</h2>
                  <p className="card-copy">
                    Aggregated across every saved day for this instrument. Switch instruments to compare.
                  </p>
                </div>
              </div>
              {analytics && analytics.trades ? (
                <div className="stats-grid">
                  <div className="stat-card">
                    <span className="card-label">Net R</span>
                    <strong className={analytics.netR > 0 ? "r-pos" : analytics.netR < 0 ? "r-neg" : ""}>
                      {analytics.netR}R
                    </strong>
                  </div>
                  <div className="stat-card">
                    <span className="card-label">Win rate</span>
                    <strong>{analytics.winRate}%</strong>
                  </div>
                  <div className="stat-card">
                    <span className="card-label">Profit factor</span>
                    <strong>{analytics.profitFactor === null ? "∞" : analytics.profitFactor}</strong>
                  </div>
                  <div className="stat-card">
                    <span className="card-label">Total trades</span>
                    <strong>{analytics.trades}</strong>
                  </div>
                  <div className="stat-card">
                    <span className="card-label">Avg win</span>
                    <strong className="r-pos">{analytics.avgWin}R</strong>
                  </div>
                  <div className="stat-card">
                    <span className="card-label">Avg loss</span>
                    <strong className="r-neg">{analytics.avgLoss}R</strong>
                  </div>
                  <div className="stat-card">
                    <span className="card-label">Best trade</span>
                    <strong className="r-pos">{analytics.bestTrade}R</strong>
                  </div>
                  <div className="stat-card">
                    <span className="card-label">Worst trade</span>
                    <strong className="r-neg">{analytics.worstTrade}R</strong>
                  </div>
                </div>
              ) : (
                <div className="empty-note">
                  No trades with an R value logged yet for {activeTicker}. Log trades to build analytics.
                </div>
              )}
            </section>

            {analytics && analytics.trades ? (
              <>
                <section className="card">
                  <div className="card-head">
                    <div>
                      <div className="eyebrow">Breakdown</div>
                      <h2>Where the R comes from</h2>
                    </div>
                  </div>
                  <div className="grid-2">
                    <div>
                      <div className="field-label">By session</div>
                      <div className="breakdown-table">
                        <div className="breakdown-row head">
                          <span>Session</span>
                          <span>Trades</span>
                          <span>Win rate</span>
                          <span>Net R</span>
                        </div>
                        {Object.entries(analytics.bySession)
                          .sort((a, b) => b[1].netR - a[1].netR)
                          .map(([name, bucket]) => (
                            <div key={name} className="breakdown-row">
                              <span>{name}</span>
                              <span>{bucket.trades}</span>
                              <span>{bucket.trades ? Math.round((bucket.wins / bucket.trades) * 100) : 0}%</span>
                              <span className={bucket.netR >= 0 ? "r-pos" : "r-neg"}>{bucket.netR}R</span>
                            </div>
                          ))}
                      </div>
                    </div>
                    <div>
                      <div className="field-label">By model</div>
                      <div className="breakdown-table">
                        <div className="breakdown-row head">
                          <span>Model</span>
                          <span>Trades</span>
                          <span>Win rate</span>
                          <span>Net R</span>
                        </div>
                        {Object.entries(analytics.byModel)
                          .sort((a, b) => b[1].netR - a[1].netR)
                          .map(([name, bucket]) => (
                            <div key={name} className="breakdown-row">
                              <span>{name}</span>
                              <span>{bucket.trades}</span>
                              <span>{bucket.trades ? Math.round((bucket.wins / bucket.trades) * 100) : 0}%</span>
                              <span className={bucket.netR >= 0 ? "r-pos" : "r-neg"}>{bucket.netR}R</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="card">
                  <div className="card-head">
                    <div>
                      <div className="eyebrow">History</div>
                      <h2>Day by day</h2>
                      <p className="card-copy">Click a day to open its full journal.</p>
                    </div>
                  </div>
                  <div className="breakdown-table">
                    <div className="breakdown-row head day-row">
                      <span>Date</span>
                      <span>Trades</span>
                      <span>W / L</span>
                      <span>Readiness</span>
                      <span>Net R</span>
                    </div>
                    {analytics.byDay
                      .filter((entry) => entry.trades || entry.day === currentDateStr)
                      .map((entry) => (
                        <button
                          key={entry.day}
                          type="button"
                          className="breakdown-row day-row day-row-btn"
                          onClick={() => {
                            handleHistoryChange(entry.day);
                            setActiveView("today");
                          }}
                        >
                          <span>{entry.day}{entry.day === currentDateStr ? " (today)" : ""}</span>
                          <span>{entry.trades}</span>
                          <span>{entry.wins} / {entry.losses}</span>
                          <span>{entry.readiness}%</span>
                          <span className={entry.netR >= 0 ? "r-pos" : "r-neg"}>{entry.netR}R</span>
                        </button>
                      ))}
                  </div>
                </section>
              </>
            ) : null}
          </>
        ) : null}

        {activeView === "journal" ? (
          <section className="card">
            <div className="card-head">
              <div>
                <div className="eyebrow">Journal</div>
                <h2>Context, mood and review</h2>
                <p className="card-copy">Your personal state and journaling — separate from market profiling.</p>
              </div>
            </div>
            <div className="grid-2">
              <Field label="Mood">
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
              </Field>
              <Field label="Key level / nPOC reference">
                <input
                  value={journalState.keyLevel}
                  onChange={(event) =>
                    persistState({ ...journalState, keyLevel: event.target.value }, { sync: false })
                  }
                  onBlur={() => persistState({ ...journalState, keyLevel: journalState.keyLevel })}
                  placeholder="Weekly VAH, daily nPOC, open drive edge"
                />
              </Field>
              <Field label="Macro theme">
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
              </Field>
              <Field label="Playbook focus">
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
              </Field>
              <Field label="Rule of day" wide>
                <input
                  value={journalState.ruleOfDay}
                  onChange={(event) =>
                    persistState({ ...journalState, ruleOfDay: event.target.value }, { sync: false })
                  }
                  onBlur={() => persistState({ ...journalState, ruleOfDay: journalState.ruleOfDay })}
                  placeholder="No second entry after first stop. Wait for confirmation."
                />
              </Field>
              <Field label="Bias notes" wide>
                <textarea
                  value={journalState.biasNotes}
                  onChange={(event) =>
                    persistState({ ...journalState, biasNotes: event.target.value }, { sync: false })
                  }
                  onBlur={() => persistState({ ...journalState, biasNotes: journalState.biasNotes })}
                  placeholder="Why this bias, what confirms it, and what invalidates it."
                />
              </Field>
              <Field label="Trade narrative" wide>
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
                  placeholder="The story you traded, what you expected, and where you deviated."
                />
              </Field>
              <Field label="Execution review" wide>
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
              </Field>
            </div>
            <div className="footer-actions">
              <button className="btn btn-ghost" type="button" onClick={() => queueSync(journalState, { immediate: true })}>
                Sync now
              </button>
              <button className="btn btn-ghost" type="button" onClick={handleCopyMarkdown}>
                Copy for Notion
              </button>
              {syncState.pageUrl ? (
                <a className="notion-link" href={syncState.pageUrl} target="_blank" rel="noreferrer">
                  Open Notion
                </a>
              ) : null}
            </div>
            <div className="backup-bar">
              <div>
                <div className="field-label">Local backup</div>
                <p className="backup-copy">All data lives in this browser. Export a JSON backup or restore one.</p>
              </div>
              <div className="backup-actions">
                <button className="btn btn-ghost" type="button" onClick={handleExportBackup}>
                  Export JSON
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => importInputRef.current?.click()}>
                  Import JSON
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json"
                  className="visually-hidden"
                  onChange={handleImportBackup}
                />
              </div>
            </div>
            <div className="sync-message" role="status">{syncState.message}</div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
