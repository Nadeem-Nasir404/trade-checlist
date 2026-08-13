export const DEFAULT_TICKERS = ["NQ", "BTC", "XAUUSD", "EURUSD"];
export const STORAGE_PREFIX = "trade-journal-protocol:";

const INSTRUMENT_PROFILES = {
  index: {
    kind: "index",
    theme: "index",
    label: "Index futures",
    shortLabel: "Cash-session profile",
    rhythm: "Cash open and auction-driven",
    requiresSessionProfile: true,
    sessionProfileTitle: "Session profile map",
    sessionProfileSubtitle: "Value and cash-session positioning are part of the gate."
  },
  crypto: {
    kind: "crypto",
    theme: "crypto",
    label: "Crypto",
    shortLabel: "24/7 flow",
    rhythm: "24/7 rotation and liquidation flow",
    requiresSessionProfile: false,
    sessionProfileTitle: "Flow context map",
    sessionProfileSubtitle: "Cash-session profile is optional here. Focus on VWAP, daily open and liquidation flow."
  },
  metal: {
    kind: "metal",
    theme: "metal",
    label: "Gold",
    shortLabel: "London and NY profile",
    rhythm: "Session-driven with macro impulse",
    requiresSessionProfile: true,
    sessionProfileTitle: "Gold session profile",
    sessionProfileSubtitle: "Keep the profile read, but expect more reaction to session handoffs and macro catalysts."
  },
  fx: {
    kind: "fx",
    theme: "fx",
    label: "FX",
    shortLabel: "London and NY handoff",
    rhythm: "Session handoff and range delivery",
    requiresSessionProfile: true,
    sessionProfileTitle: "FX session profile",
    sessionProfileSubtitle: "Use profile and value, especially through London and New York handoffs."
  }
};

export function getInstrumentConfig(ticker = "") {
  const symbol = String(ticker || "").toUpperCase();

  if (symbol.includes("BTC") || symbol.includes("ETH") || symbol.includes("SOL")) {
    return INSTRUMENT_PROFILES.crypto;
  }

  if (symbol.includes("XAU") || symbol.includes("GC") || symbol.includes("GOLD")) {
    return INSTRUMENT_PROFILES.metal;
  }

  if (
    symbol.includes("NQ") ||
    symbol.includes("ES") ||
    symbol.includes("YM") ||
    symbol.includes("RTY") ||
    symbol.includes("MNQ") ||
    symbol.includes("MES")
  ) {
    return INSTRUMENT_PROFILES.index;
  }

  return INSTRUMENT_PROFILES.fx;
}

export function blankState() {
  return {
    sessionProfile: {
      vah: "",
      val: "",
      poc: "",
      vwap: "",
      lvn: "",
      yestClose: "",
      todayOpen: ""
    },
    dailyPrep: {
      waitFirstThirty: false,
      levelsMarked: false,
      eventRiskChecked: false
    },
    narrativeProfile: {
      prevCashClose: "",
      todayOpen: "",
      valueContext: "",
      profileLocation: "",
      auctionState: "",
      liquidityPath: "",
      dayType: "",
      profileNote: ""
    },
    bias: null,
    keyLevel: "",
    biasNotes: "",
    premarket: {
      marketBehavior: "",
      orderFlow: "",
      htfPoi: "",
      liquidityFocus: "",
      sessionLiquidity: "",
      profileLocation: "",
      auctionState: "",
      cvdState: "",
      tapeState: "",
      executionLane: "",
      initiative: "",
      response: "",
      mood: "",
      thesisNarrative: ""
    },
    macroTheme: "",
    playbookFocus: "",
    ruleOfDay: "",
    executionReview: "",
    trades: []
  };
}

export function normalizeState(input) {
  const base = blankState();
  const source = input || {};

  return {
    ...base,
    ...source,
    sessionProfile: {
      ...base.sessionProfile,
      ...(source.sessionProfile || {})
    },
    dailyPrep: {
      ...base.dailyPrep,
      ...(source.dailyPrep || {})
    },
    narrativeProfile: {
      ...base.narrativeProfile,
      ...(source.narrativeProfile || {})
    },
    premarket: {
      ...base.premarket,
      ...(source.premarket || {})
    },
    trades: Array.isArray(source.trades) ? source.trades : base.trades
  };
}

export function dateStr(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateStr(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function fmtDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

export function formatClock(date, timeZone) {
  return date.toLocaleTimeString("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

export function createJournalKey(ticker, day) {
  return `${ticker.toLowerCase()}::${day}`;
}

export function getSetupVerdict(sessionProfile, ticker) {
  const instrument = getInstrumentConfig(ticker);

  if (!instrument.requiresSessionProfile) {
    return {
      label: "Optional",
      tone: "muted",
      detail: "Session profile is optional here. Use VWAP, daily open and liquidation flow instead."
    };
  }

  const { yestClose, todayOpen } = sessionProfile;

  if (!yestClose || !todayOpen) {
    return {
      label: "Pending",
      tone: "muted",
      detail: "Set yesterday's close and today's open to unlock the profile conclusion."
    };
  }

  if (yestClose === "outside" && todayOpen === "outside") {
    return {
      label: "Highest probability",
      tone: "bull",
      detail: "Closed out and opened out. Strongest continuation potential if orderflow agrees."
    };
  }

  if (
    (yestClose === "inside" && todayOpen === "outside") ||
    (yestClose === "outside" && todayOpen === "inside")
  ) {
    return {
      label: "High probability",
      tone: "warn",
      detail: "One side is outside and the other is inside. Good opportunity if acceptance or reclaim confirms."
    };
  }

  return {
    label: "Chop / no trade",
    tone: "bear",
    detail: "Closed in and opened in. Expect rotation unless orderflow shows a clear break from balance."
  };
}

export function getOrderflowConclusion(state, ticker) {
  const safeState = normalizeState(state);
  const instrument = getInstrumentConfig(ticker);
  const setup = getSetupVerdict(safeState.sessionProfile, ticker);
  const reasons = [];

  const continuationRead =
    ["Displacement with follow-through", "Trend auction"].includes(safeState.premarket.orderFlow) &&
    ["Aligned with price", "Loading before break"].includes(safeState.premarket.cvdState) &&
    ["Fast tape with size", "Big prints defending level"].includes(safeState.premarket.tapeState) &&
    ["Trend / continuation", "Wait for confirmation"].includes(safeState.premarket.executionLane);

  const reversalRead =
    ["Absorption at level", "Sweep then reclaim", "Failed breakout"].includes(safeState.premarket.orderFlow) &&
    ["Aggression absorbed", "Aligned with price"].includes(safeState.premarket.cvdState) &&
    ["Big prints defending level", "Exhaustion into level"].includes(safeState.premarket.tapeState) &&
    ["Mean reversion / fade", "Wait for confirmation"].includes(safeState.premarket.executionLane);

  if (safeState.sessionProfile.vah || safeState.sessionProfile.val || safeState.sessionProfile.poc) {
    reasons.push("Previous day profile references are marked");
  }

  if (instrument.requiresSessionProfile) {
    reasons.push(`Profile matrix says ${setup.label.toLowerCase()}`);
  } else {
    reasons.push("Flow context is being used instead of a hard cash-session matrix");
  }

  if (safeState.premarket.htfPoi) {
    reasons.push(`HTF POI: ${safeState.premarket.htfPoi}`);
  }

  if (safeState.premarket.orderFlow) {
    reasons.push(`Orderflow: ${safeState.premarket.orderFlow}`);
  }

  if (safeState.premarket.initiative) {
    reasons.push(`Initiative: ${safeState.premarket.initiative}`);
  }

  if (safeState.premarket.response) {
    reasons.push(`Response: ${safeState.premarket.response}`);
  }

  if (safeState.premarket.executionLane === "No trade / buffer") {
    return {
      label: "Stand aside",
      tone: "bear",
      detail: "Execution lane says no trade. Keep tracking context but do not force a setup.",
      reasons
    };
  }

  if (safeState.premarket.cvdState === "Diverging from price" || safeState.premarket.tapeState === "Noise only") {
    return {
      label: "Wait for confirmation",
      tone: "warn",
      detail: "Orderflow is not clean enough yet. Let price confirm before committing.",
      reasons
    };
  }

  if (instrument.requiresSessionProfile && setup.label === "Chop / no trade") {
    return {
      label: "Rotation / low conviction",
      tone: "bear",
      detail: "Profile matrix is in the chop quadrant. Only trade if orderflow cleanly breaks balance.",
      reasons
    };
  }

  if (continuationRead && setup.label === "Highest probability") {
    return {
      label: "Continuation favored",
      tone: "bull",
      detail: "Closed out and opened out with supportive orderflow. Favor continuation over fading strength.",
      reasons
    };
  }

  if (continuationRead) {
    return {
      label: "Trend pressure building",
      tone: "bull",
      detail: "Orderflow supports continuation. Look for acceptance above or below value before size.",
      reasons
    };
  }

  if (reversalRead) {
    return {
      label: "Reversal favored",
      tone: "warn",
      detail: "Absorption or reclaim behavior is showing up. Wait for confirmation, then fade the failed move.",
      reasons
    };
  }

  return {
    label: "Context built, trigger pending",
    tone: "muted",
    detail: "The market profile is mapped, but orderflow still needs a cleaner read before the day is actionable.",
    reasons
  };
}

export function getBiasConclusion(state, ticker) {
  const safeState = normalizeState(state);
  const instrument = getInstrumentConfig(ticker);
  const setup = getSetupVerdict(safeState.sessionProfile, ticker);
  const progress = getProtocolProgress(safeState, ticker);
  const complete = progress.completedStages === progress.totalStages;

  let long = 0;
  let short = 0;
  const longReasons = [];
  const shortReasons = [];
  const cautions = [];

  const pushLong = (reason) => {
    long += 1;
    longReasons.push(reason);
  };
  const pushShort = (reason) => {
    short += 1;
    shortReasons.push(reason);
  };

  // --- Narrative / profile selections ---
  const prevClose = safeState.narrativeProfile.prevCashClose;
  if (prevClose === "Closed above prior value") pushLong("Closed above prior value");
  if (prevClose === "Closed below prior value") pushShort("Closed below prior value");

  const todayOpen = safeState.narrativeProfile.todayOpen;
  if (todayOpen === "Opened above value") pushLong("Opened above value");
  if (todayOpen === "Opened below value") pushShort("Opened below value");

  if (safeState.narrativeProfile.valueContext === "Acceptance above value") {
    pushLong("Acceptance above value");
  }
  if (safeState.narrativeProfile.valueContext === "Rotating back into value") {
    cautions.push("Price rotating back into value");
  }

  const auction = safeState.narrativeProfile.auctionState;
  if (auction === "Trend day building") pushLong("Trend day building");
  if (auction === "Trend down building") pushShort("Trend down building");
  if (auction === "Failed auction") cautions.push("Failed auction — reversal behavior likely");
  if (auction === "Balanced auction") cautions.push("Balanced auction — direction unclear");

  const path = safeState.narrativeProfile.liquidityPath;
  if (path === "Sweep highs first") pushLong("Draw on liquidity above (sweep highs first)");
  if (path === "Sweep lows first") pushShort("Draw on liquidity below (sweep lows first)");
  if (path === "No clean path yet") cautions.push("No clean liquidity path yet");

  // --- Orderflow selections ---
  const initiative = safeState.premarket.initiative;
  if (initiative === "Buyers in control") pushLong("Buyers in control");
  if (initiative === "Sellers in control") pushShort("Sellers in control");
  if (initiative === "Initiative failed") cautions.push("Initiative failed");

  const response = safeState.premarket.response;
  if (response === "Acceptance above level") pushLong("Acceptance above level");
  if (response === "Acceptance below level") pushShort("Acceptance below level");

  // --- Confirmation / divergence modifiers ---
  let confirmations = 0;
  const cvd = safeState.premarket.cvdState;
  if (cvd === "Aligned with price" || cvd === "Loading before break") confirmations += 1;
  if (cvd === "Diverging from price") cautions.push("CVD diverging from price");
  if (cvd === "Aggression absorbed") cautions.push("Aggression absorbed — reversal risk");

  const tape = safeState.premarket.tapeState;
  if (tape === "Fast tape with size" || tape === "Big prints defending level") confirmations += 1;
  if (tape === "Exhaustion into level") cautions.push("Exhaustion into level");
  if (tape === "Noise only") cautions.push("Tape is noise only");

  const lane = safeState.premarket.executionLane;
  const net = long - short;

  // --- Hard veto: user marked no-trade lane ---
  if (lane === "No trade / buffer") {
    return {
      direction: "none",
      label: "Stand aside",
      conviction: "none",
      detail: "Execution lane is set to no trade / buffer. Track the market, but do not force a setup today.",
      reasons: [],
      cautions,
      aligned: null,
      complete,
      long,
      short
    };
  }

  // --- Direction from net score ---
  let direction = "neutral";
  if (net >= 2) direction = "long";
  if (net <= -2) direction = "short";

  // --- Conviction score ---
  let score = Math.abs(net) + confirmations;
  if (setup.label === "Highest probability") score += 1;
  if (instrument.requiresSessionProfile && setup.label === "Chop / no trade") score -= 1;
  if (safeState.narrativeProfile.profileLocation === "Mid-range / nowhere") score -= 1;
  if (cvd === "Diverging from price") score -= 1;
  if (lane === "Wait for confirmation") score -= 1;

  let conviction = "none";
  if (direction !== "neutral") {
    if (score >= 5) conviction = "high";
    else if (score >= 3) conviction = "medium";
    else conviction = "low";
  }

  // --- Alignment with the user's chosen bias ---
  let aligned = null;
  if (safeState.bias && direction !== "neutral") {
    aligned =
      (safeState.bias === "bullish" && direction === "long") ||
      (safeState.bias === "bearish" && direction === "short");
  }

  const label =
    direction === "long" ? "Long bias" : direction === "short" ? "Short bias" : "No clear bias";

  let detail;
  if (direction === "long") {
    detail = "Profile and orderflow selections point up. Only look for longs at your levels — skip shorts unless the map changes.";
  } else if (direction === "short") {
    detail = "Profile and orderflow selections point down. Only look for shorts at your levels — skip longs unless the map changes.";
  } else {
    detail = "Selections point both ways or context is incomplete. Stand aside or let the open reveal direction first.";
  }

  if (aligned === false) {
    detail += " Note: this conflicts with the bias you picked — trust the map or stand aside.";
  }

  if (!complete) {
    detail += " Conclusion is provisional until all 4 stages are complete.";
  }

  return {
    direction,
    label,
    conviction,
    detail,
    reasons: direction === "short" ? shortReasons : longReasons,
    cautions,
    aligned,
    complete,
    long,
    short
  };
}

function buildConclusionContext(state, ticker) {
  const safeState = normalizeState(state);
  const biasConclusion = getBiasConclusion(safeState, ticker);
  const orderflow = getOrderflowConclusion(safeState, ticker);
  const setup = getSetupVerdict(safeState.sessionProfile, ticker);
  const progress = getProtocolProgress(safeState, ticker);

  const numericTrades = safeState.trades
    .map((trade) => Number.parseFloat(trade.r))
    .filter((value) => Number.isFinite(value));
  const netR = Number(numericTrades.reduce((sum, value) => sum + value, 0).toFixed(2));
  const wins = numericTrades.filter((value) => value > 0).length;
  const losses = numericTrades.filter((value) => value < 0).length;
  const winRate = numericTrades.length ? Math.round((wins / numericTrades.length) * 100) : 0;

  const narrativeFitCounts = safeState.trades.reduce((acc, trade) => {
    const key = trade.narrativeFit || "Unset";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    bias: safeState.bias,
    biasConclusion,
    orderflow,
    setup,
    progress,
    readiness: calculateMetrics(safeState, ticker).readiness,
    executionLane: safeState.premarket.executionLane,
    cvdState: safeState.premarket.cvdState,
    tapeState: safeState.premarket.tapeState,
    dayType: safeState.narrativeProfile.dayType,
    tradesCount: safeState.trades.length,
    netR,
    wins,
    losses,
    winRate,
    narrativeFitCounts
  };
}

export const CONCLUSION_RULES = [
  {
    id: "no-trade-veto",
    when: (ctx) => ctx.executionLane === "No trade / buffer",
    explain: "Execution lane is set to 'No trade / buffer'",
    verdict: "STAND ASIDE",
    tone: "bear",
    title: "No-trade day",
    detail:
      "The execution lane says no trade. Keep tracking the map and context, but do not take any setups today.",
    reasons: ["Execution lane: No trade / buffer"]
  },
  {
    id: "cvd-divergence-veto",
    when: (ctx) => ctx.cvdState === "Diverging from price",
    explain: "CVD / delta is diverging from price",
    verdict: "WAIT FOR CONFIRMATION",
    tone: "warn",
    title: "Orderflow is not confirming",
    detail:
      "CVD is diverging from price. The move is not backed by aggression — wait for price to confirm before committing.",
    reasons: ["CVD diverging from price"]
  },
  {
    id: "bias-conflict",
    when: (ctx) => Boolean(ctx.bias) && ctx.biasConclusion.aligned === false,
    explain: "Locked bias conflicts with the market map",
    verdict: "TRUST THE MAP",
    tone: "warn",
    title: "Your bias fights the data",
    detail:
      "The profile and orderflow point one way but your locked bias points the other. Trust the map or stand aside — do not force it.",
    reasons: (ctx) => [
      `Locked bias: ${formatBiasLabel(ctx.bias)}`,
      `Map direction: ${ctx.biasConclusion.label}`
    ]
  },
  {
    id: "full-alignment-go",
    when: (ctx) =>
      Boolean(ctx.bias) &&
      ctx.biasConclusion.aligned === true &&
      ctx.biasConclusion.conviction === "high" &&
      ctx.orderflow.tone === "bull" &&
      ctx.netR >= 0,
    explain: "Bias, profile, orderflow and execution all agree",
    verdict: "GO — EXECUTE THE PLAN",
    tone: "bull",
    title: "Everything aligns",
    detail:
      "Your bias, the profile matrix, orderflow and execution results all agree. Follow the plan, stay in the lane, and do not over-trade.",
    reasons: (ctx) => [
      "Bias aligned with map",
      "High conviction",
      "Orderflow supports the direction",
      ctx.netR > 0 ? "Execution is profitable" : "Execution is flat so far"
    ]
  },
  {
    id: "continuation",
    when: (ctx) => ctx.setup.label === "Highest probability" && ctx.orderflow.tone === "bull",
    explain: "Profile is highest probability and orderflow favors continuation",
    verdict: "CONTINUATION FAVORED",
    tone: "bull",
    title: "Trade with strength",
    detail:
      "Closed out and opened out with supportive orderflow. Favor continuation longs at your levels; skip fading strength.",
    reasons: ["Profile matrix: Highest probability", "Orderflow: continuation"]
  },
  {
    id: "reversal",
    when: (ctx) => ctx.orderflow.label === "Reversal favored" || ctx.orderflow.tone === "warn",
    explain: "Orderflow shows absorption or a failed move",
    verdict: "REVERSAL / FADE ONLY",
    tone: "warn",
    title: "Wait for the failed move",
    detail:
      "Absorption or sweep-then-reclaim is showing. Only fade a failed breakout with confirmation — do not chase.",
    reasons: ["Orderflow: reversal read"]
  },
  {
    id: "rotation",
    when: (ctx) => ctx.setup.label === "Chop / no trade" || ctx.setup.tone === "bear",
    explain: "Profile matrix is in the chop quadrant",
    verdict: "ROTATION / LOW CONVICTION",
    tone: "bear",
    title: "Stay small",
    detail:
      "The profile is chop. Trade only a clean break of balance with orderflow confirmation — keep size small.",
    reasons: ["Profile matrix: Chop / no trade"]
  },
  {
    id: "incomplete",
    when: (ctx) => ctx.progress.completedStages < ctx.progress.totalStages,
    explain: "Not all protocol stages are complete",
    verdict: "PROVISIONAL",
    tone: "muted",
    title: "Finish the protocol first",
    detail:
      "This conclusion is provisional until all four stages are complete. Fill the remaining inputs and re-run.",
    reasons: (ctx) => [`${ctx.progress.completedStages}/${ctx.progress.totalStages} stages complete`]
  },
  {
    id: "default",
    when: () => true,
    explain: "Context is built but no dominant edge",
    verdict: "CONTEXT BUILT — TRIGGER PENDING",
    tone: "muted",
    title: "Wait for your trigger",
    detail:
      "The map is ready but no dominant edge shows yet. Wait for a clean setup at your levels with orderflow confirmation.",
    reasons: ["Context collected", "No dominant edge yet"]
  }
];

export function buildFinalConclusion(state, ticker) {
  const ctx = buildConclusionContext(state, ticker);
  const rule = CONCLUSION_RULES.find((item) => item.when(ctx));

  const warnings = [];
  if (ctx.netR < 0) warnings.push(`Net ${ctx.netR}R on the day — execution needs review`);
  if (ctx.narrativeFitCounts["Counter narrative"]) {
    warnings.push(`${ctx.narrativeFitCounts["Counter narrative"]} counter-narrative trade(s) logged`);
  }
  if (ctx.cvdState === "Diverging from price") warnings.push("CVD diverging from price");

  const reasons =
    typeof rule.reasons === "function" ? rule.reasons(ctx) : rule.reasons || [];

  return {
    ...rule,
    reasons,
    ctx,
    warnings,
    signals: [
      { key: "Readiness", value: `${ctx.readiness}%` },
      { key: "Bias", value: formatBiasLabel(ctx.bias) },
      { key: "Profile map", value: ctx.setup.label },
      { key: "Orderflow", value: ctx.orderflow.label },
      { key: "Trades", value: String(ctx.tradesCount) },
      { key: "Net R", value: `${ctx.netR}R` },
      { key: "Win rate", value: `${ctx.winRate}%` }
    ]
  };
}

function boolCount(values) {
  return values.filter(Boolean).length;
}

export function getProtocolProgress(state, ticker) {
  const safeState = normalizeState(state);
  const instrument = getInstrumentConfig(ticker);

  const dailyPrepComplete = Boolean(
    safeState.bias &&
      safeState.dailyPrep.waitFirstThirty &&
      safeState.dailyPrep.levelsMarked &&
      safeState.dailyPrep.eventRiskChecked
  );

  const profileComplete = Boolean(
    dailyPrepComplete &&
      safeState.sessionProfile.vah &&
      safeState.sessionProfile.val &&
      safeState.sessionProfile.poc &&
      safeState.sessionProfile.vwap &&
      safeState.sessionProfile.lvn &&
      (!instrument.requiresSessionProfile ||
        (safeState.sessionProfile.yestClose && safeState.sessionProfile.todayOpen))
  );

  const narrativeComplete = Boolean(
    profileComplete &&
      safeState.narrativeProfile.prevCashClose &&
      safeState.narrativeProfile.todayOpen &&
      safeState.narrativeProfile.valueContext &&
      safeState.narrativeProfile.profileLocation &&
      safeState.narrativeProfile.auctionState &&
      safeState.narrativeProfile.liquidityPath &&
      safeState.narrativeProfile.dayType
  );

  const orderflowComplete = Boolean(
    narrativeComplete &&
      safeState.premarket.htfPoi &&
      safeState.premarket.orderFlow &&
      safeState.premarket.cvdState &&
      safeState.premarket.tapeState &&
      safeState.premarket.executionLane &&
      safeState.premarket.initiative &&
      safeState.premarket.response
  );

  const stages = [
    {
      id: "daily-prep",
      label: "Daily Prep",
      complete: dailyPrepComplete,
      unlocked: true
    },
    {
      id: "profile-map",
      label: "Profile Map",
      complete: profileComplete,
      unlocked: dailyPrepComplete
    },
    {
      id: "narrative-builder",
      label: "Narrative Builder",
      complete: narrativeComplete,
      unlocked: profileComplete
    },
    {
      id: "orderflow-conclusion",
      label: "Orderflow Conclusion",
      complete: orderflowComplete,
      unlocked: narrativeComplete
    }
  ];

  const completedStages = stages.filter((stage) => stage.complete).length;

  return {
    stages,
    completedStages,
    totalStages: stages.length
  };
}

export function getGoNoGo(state, ticker) {
  const safeState = normalizeState(state);
  const blockers = [];
  const instrument = getInstrumentConfig(ticker);
  const metrics = calculateMetrics(safeState, ticker);

  if (!safeState.bias) blockers.push("Bias not locked");
  if (!safeState.dailyPrep.waitFirstThirty) blockers.push("First 30-minute rule not confirmed");
  if (!safeState.dailyPrep.levelsMarked) blockers.push("Previous day levels not marked");
  if (!safeState.dailyPrep.eventRiskChecked) blockers.push("Event risk not reviewed");

  if (!safeState.sessionProfile.vah) blockers.push("VAH missing");
  if (!safeState.sessionProfile.val) blockers.push("VAL missing");
  if (!safeState.sessionProfile.poc) blockers.push("POC missing");
  if (!safeState.sessionProfile.vwap) blockers.push("VWAP missing");
  if (!safeState.sessionProfile.lvn) blockers.push("LVN notes missing");

  if (!safeState.narrativeProfile.prevCashClose) blockers.push("Previous close context missing");
  if (!safeState.narrativeProfile.todayOpen) blockers.push("Today open context missing");
  if (!safeState.narrativeProfile.valueContext) blockers.push("Value context missing");
  if (!safeState.narrativeProfile.profileLocation) blockers.push("Profile location missing");
  if (!safeState.narrativeProfile.auctionState) blockers.push("Auction state missing");
  if (!safeState.narrativeProfile.liquidityPath) blockers.push("Liquidity path missing");
  if (!safeState.narrativeProfile.dayType) blockers.push("Day type missing");

  if (instrument.requiresSessionProfile && !safeState.sessionProfile.yestClose) {
    blockers.push("Session profile close context missing");
  }
  if (instrument.requiresSessionProfile && !safeState.sessionProfile.todayOpen) {
    blockers.push("Session profile open context missing");
  }

  if (!safeState.premarket.htfPoi) blockers.push("HTF POI missing");
  if (!safeState.premarket.orderFlow) blockers.push("Orderflow read missing");
  if (!safeState.premarket.cvdState) blockers.push("CVD / delta read missing");
  if (!safeState.premarket.tapeState) blockers.push("Tape read missing");
  if (!safeState.premarket.executionLane) blockers.push("Execution lane missing");
  if (!safeState.premarket.initiative) blockers.push("Initiative read missing");
  if (!safeState.premarket.response) blockers.push("Response read missing");

  if (safeState.narrativeProfile.profileLocation === "Mid-range / nowhere") {
    blockers.push("Profile is mid-range");
  }

  if (safeState.premarket.cvdState === "Diverging from price") {
    blockers.push("CVD is diverging from price");
  }

  if (safeState.premarket.executionLane === "No trade / buffer") {
    blockers.push("Execution lane says no trade");
  }

  if (instrument.requiresSessionProfile && metrics.setup.label === "Chop / no trade") {
    blockers.push("Profile matrix says chop / no trade");
  }

  return {
    verdict: blockers.length ? "NO-GO" : "GO",
    blockers
  };
}

export function calculateMetrics(state, ticker) {
  const safeState = normalizeState(state);
  const instrument = getInstrumentConfig(ticker);
  const progressItems = [
    Boolean(safeState.bias),
    safeState.dailyPrep.waitFirstThirty,
    safeState.dailyPrep.levelsMarked,
    safeState.dailyPrep.eventRiskChecked,
    Boolean(safeState.sessionProfile.vah),
    Boolean(safeState.sessionProfile.val),
    Boolean(safeState.sessionProfile.poc),
    Boolean(safeState.sessionProfile.vwap),
    Boolean(safeState.sessionProfile.lvn),
    !instrument.requiresSessionProfile || Boolean(safeState.sessionProfile.yestClose),
    !instrument.requiresSessionProfile || Boolean(safeState.sessionProfile.todayOpen),
    Boolean(safeState.narrativeProfile.prevCashClose),
    Boolean(safeState.narrativeProfile.todayOpen),
    Boolean(safeState.narrativeProfile.valueContext),
    Boolean(safeState.narrativeProfile.profileLocation),
    Boolean(safeState.narrativeProfile.auctionState),
    Boolean(safeState.narrativeProfile.liquidityPath),
    Boolean(safeState.narrativeProfile.dayType),
    Boolean(safeState.premarket.htfPoi),
    Boolean(safeState.premarket.orderFlow),
    Boolean(safeState.premarket.cvdState),
    Boolean(safeState.premarket.tapeState),
    Boolean(safeState.premarket.executionLane),
    Boolean(safeState.premarket.initiative),
    Boolean(safeState.premarket.response)
  ];

  const checklistTotal = progressItems.length;
  const checklistDone = boolCount(progressItems);
  const readiness = checklistTotal ? Math.round((checklistDone / checklistTotal) * 100) : 0;

  const numericTrades = safeState.trades
    .map((trade) => Number.parseFloat(trade.r))
    .filter((value) => Number.isFinite(value));

  const netR = Number(numericTrades.reduce((sum, value) => sum + value, 0).toFixed(2));
  const wins = numericTrades.filter((value) => value > 0).length;
  const losses = numericTrades.filter((value) => value < 0).length;
  const winRate = numericTrades.length ? Math.round((wins / numericTrades.length) * 100) : 0;
  const bestTrade = numericTrades.length ? Math.max(...numericTrades) : 0;

  const setup = getSetupVerdict(safeState.sessionProfile, ticker);
  const protocol = getProtocolProgress(safeState, ticker);
  const conclusion = getOrderflowConclusion(safeState, ticker);
  const biasConclusion = getBiasConclusion(safeState, ticker);
  const executionScore = Math.min(
    100,
    Math.round(readiness * 0.68 + protocol.completedStages * 7 + (safeState.trades.length ? 4 : 0))
  );

  return {
    checklistDone,
    checklistTotal,
    readiness,
    netR,
    wins,
    losses,
    winRate,
    bestTrade,
    executionScore,
    setup,
    protocol,
    conclusion,
    biasConclusion
  };
}

export function formatBiasLabel(value) {
  if (!value) return "-";
  if (value === "bullish") return "Long";
  if (value === "bearish") return "Short";
  return "Neutral";
}

export function createMarkdown({ ticker, dateLabel, state }) {
  const safeState = normalizeState(state);
  const instrument = getInstrumentConfig(ticker);
  const metrics = calculateMetrics(safeState, ticker);
  const setup = metrics.setup;
  const conclusion = metrics.conclusion;
  const lines = [
    `## ${ticker} - ${dateLabel}`,
    "",
    `**Instrument style:** ${instrument.label}`,
    `**Profile matrix:** ${setup.label}`,
    `**Conclusion:** ${conclusion.label}`,
    `**Readiness:** ${metrics.readiness}%`,
    `**Bias:** ${formatBiasLabel(safeState.bias)}`,
    `**Day type:** ${safeState.narrativeProfile.dayType || "-"}`,
    `**Execution lane:** ${safeState.premarket.executionLane || "-"}`,
    `**Mood:** ${safeState.premarket.mood || "-"}`,
    "",
    "**Daily Prep:**",
    `- Wait first 30 minutes: ${safeState.dailyPrep.waitFirstThirty ? "Yes" : "No"}`,
    `- Previous day levels marked: ${safeState.dailyPrep.levelsMarked ? "Yes" : "No"}`,
    `- Event risk reviewed: ${safeState.dailyPrep.eventRiskChecked ? "Yes" : "No"}`,
    "",
    instrument.requiresSessionProfile ? "**Session Profile:**" : "**Flow Context:**",
    `- VAH: ${safeState.sessionProfile.vah || "-"}`,
    `- VAL: ${safeState.sessionProfile.val || "-"}`,
    `- POC: ${safeState.sessionProfile.poc || "-"}`,
    `- VWAP: ${safeState.sessionProfile.vwap || "-"}`,
    `- LVN / gap notes: ${safeState.sessionProfile.lvn || "-"}`,
    instrument.requiresSessionProfile
      ? `- Yesterday close vs value: ${safeState.sessionProfile.yestClose || "-"}`
      : `- Prior close vs flow: ${safeState.narrativeProfile.prevCashClose || "-"}`,
    instrument.requiresSessionProfile
      ? `- Today open vs value: ${safeState.sessionProfile.todayOpen || "-"}`
      : `- Daily open vs flow: ${safeState.narrativeProfile.todayOpen || "-"}`,
    "",
    "**Narrative Builder:**",
    `- Previous close context: ${safeState.narrativeProfile.prevCashClose || "-"}`,
    `- Today open: ${safeState.narrativeProfile.todayOpen || "-"}`,
    `- Value context: ${safeState.narrativeProfile.valueContext || "-"}`,
    `- Profile location: ${safeState.narrativeProfile.profileLocation || "-"}`,
    `- Auction state: ${safeState.narrativeProfile.auctionState || "-"}`,
    `- Liquidity path: ${safeState.narrativeProfile.liquidityPath || "-"}`,
    `- Profile note: ${safeState.narrativeProfile.profileNote || "-"}`,
    "",
    "**Orderflow Conclusion:**",
    `- HTF POI: ${safeState.premarket.htfPoi || "-"}`,
    `- Orderflow: ${safeState.premarket.orderFlow || "-"}`,
    `- Initiative: ${safeState.premarket.initiative || "-"}`,
    `- Response: ${safeState.premarket.response || "-"}`,
    `- CVD / delta: ${safeState.premarket.cvdState || "-"}`,
    `- Tape state: ${safeState.premarket.tapeState || "-"}`,
    `- Liquidity focus: ${safeState.premarket.liquidityFocus || "-"}`,
    `- Session liquidity: ${safeState.premarket.sessionLiquidity || "-"}`,
    `- Conclusion detail: ${conclusion.detail}`,
    "",
    "**Journal Notes:**",
    `- Key level: ${safeState.keyLevel || "-"}`,
    `- Bias notes: ${safeState.biasNotes || "-"}`,
    `- Trade narrative: ${safeState.premarket.thesisNarrative || "-"}`,
    `- Macro theme: ${safeState.macroTheme || "-"}`,
    `- Playbook focus: ${safeState.playbookFocus || "-"}`,
    `- Rule of day: ${safeState.ruleOfDay || "-"}`,
    "",
    "**Trades:**"
  ];

  if (!safeState.trades.length) {
    lines.push("_none logged_");
  } else {
    lines.push("| Time | Session | Model | Dir | Entry | Exit | Stop | Planned RR | R | Narrative | Trigger | Notes |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
    safeState.trades.forEach((trade) => {
      lines.push(
        `| ${trade.loggedAt || "-"} | ${trade.session || "-"} | ${trade.model || "-"} | ${trade.dir} | ${trade.entry} | ${trade.exit || "-"} | ${trade.stop || "-"} | ${trade.plannedRR || "-"} | ${trade.r || "-"} | ${trade.narrativeFit || "-"} | ${trade.trigger || "-"} | ${trade.notes || "-"} |`
      );
    });
  }

  lines.push("", "**Execution Review:**", safeState.executionReview || "-");
  return lines.join("\n");
}

export function buildTodayClockState() {
  const now = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return {
    now,
    utcPercent: (utcMinutes / 1440) * 100,
    ny: formatClock(now, "America/New_York"),
    london: formatClock(now, "Europe/London"),
    pk: formatClock(now, process.env.NEXT_PUBLIC_TIMEZONE || "Asia/Karachi"),
    utc: formatClock(now, "UTC")
  };
}

export function computeAutoR({ dir, entry, exit, stop }) {
  const entryPrice = Number.parseFloat(entry);
  const exitPrice = Number.parseFloat(exit);
  const stopPrice = Number.parseFloat(stop);

  if (![entryPrice, exitPrice, stopPrice].every(Number.isFinite)) {
    return null;
  }

  const risk = dir === "Short" ? stopPrice - entryPrice : entryPrice - stopPrice;
  const reward = dir === "Short" ? entryPrice - exitPrice : exitPrice - entryPrice;

  if (risk <= 0) {
    return null;
  }

  return Number((reward / risk).toFixed(2));
}

function emptyAnalyticsBucket() {
  return { trades: 0, netR: 0, wins: 0, losses: 0 };
}

export function buildAnalytics(dayEntries, ticker) {
  const summary = {
    days: 0,
    tradedDays: 0,
    trades: 0,
    netR: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    avgWin: 0,
    avgLoss: 0,
    profitFactor: 0,
    bestTrade: 0,
    worstTrade: 0,
    bySession: {},
    byModel: {},
    byDay: []
  };

  const winValues = [];
  const lossValues = [];
  let grossWin = 0;
  let grossLoss = 0;

  const sorted = [...dayEntries].sort((a, b) => (a.day < b.day ? 1 : -1));

  sorted.forEach(({ day, state }) => {
    const safeState = normalizeState(state);
    const dayR = [];
    let dayHasData = false;

    if (
      safeState.bias ||
      safeState.trades.length ||
      safeState.sessionProfile.vah ||
      safeState.narrativeProfile.dayType
    ) {
      dayHasData = true;
    }

    safeState.trades.forEach((trade) => {
      const r = Number.parseFloat(trade.r);
      if (!Number.isFinite(r)) {
        return;
      }

      summary.trades += 1;
      summary.netR = Number((summary.netR + r).toFixed(2));
      dayR.push(r);

      if (r > 0) {
        summary.wins += 1;
        winValues.push(r);
        grossWin += r;
      } else if (r < 0) {
        summary.losses += 1;
        lossValues.push(r);
        grossLoss += Math.abs(r);
      }

      summary.bestTrade = Math.max(summary.bestTrade, r);
      summary.worstTrade = Math.min(summary.worstTrade, r);

      const sessionKey = trade.session || "Unspecified";
      const modelKey = trade.model || "Unspecified";

      if (!summary.bySession[sessionKey]) summary.bySession[sessionKey] = emptyAnalyticsBucket();
      if (!summary.byModel[modelKey]) summary.byModel[modelKey] = emptyAnalyticsBucket();

      [summary.bySession[sessionKey], summary.byModel[modelKey]].forEach((bucket) => {
        bucket.trades += 1;
        bucket.netR = Number((bucket.netR + r).toFixed(2));
        if (r > 0) bucket.wins += 1;
        if (r < 0) bucket.losses += 1;
      });
    });

    if (dayHasData) {
      summary.days += 1;
    }

    if (dayR.length) {
      summary.tradedDays += 1;
    }

    summary.byDay.push({
      day,
      trades: dayR.length,
      netR: Number(dayR.reduce((sum, value) => sum + value, 0).toFixed(2)),
      wins: dayR.filter((value) => value > 0).length,
      losses: dayR.filter((value) => value < 0).length,
      readiness: calculateMetrics(safeState, ticker).readiness
    });
  });

  summary.winRate = summary.trades ? Math.round((summary.wins / summary.trades) * 100) : 0;
  summary.avgWin = winValues.length
    ? Number((winValues.reduce((sum, value) => sum + value, 0) / winValues.length).toFixed(2))
    : 0;
  summary.avgLoss = lossValues.length
    ? Number((lossValues.reduce((sum, value) => sum + value, 0) / lossValues.length).toFixed(2))
    : 0;
  summary.profitFactor = grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? null : 0;

  return summary;
}
