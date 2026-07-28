import { DEFAULT_TICKERS, STORAGE_PREFIX } from "./defaults";

function readJson(key, fallbackValue) {
  if (typeof window === "undefined") {
    return fallbackValue;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : fallbackValue;
  } catch (error) {
    return fallbackValue;
  }
}

function writeJson(key, value) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
}

export function dayKey(ticker, day) {
  return `day:${ticker}:${day}`;
}

export function historyKey(ticker) {
  return `history:${ticker}`;
}

export function loadTickers() {
  return readJson("tickers", DEFAULT_TICKERS.slice());
}

export function saveTickers(tickers) {
  writeJson("tickers", tickers);
}

export function loadDay(ticker, day) {
  return readJson(dayKey(ticker, day), null);
}

export function saveDay(ticker, day, state) {
  writeJson(dayKey(ticker, day), state);
  const existing = readJson(historyKey(ticker), []);
  if (!existing.includes(day)) {
    const next = [...existing, day].sort().reverse();
    writeJson(historyKey(ticker), next);
  }
}

export function getHistory(ticker, currentDay) {
  return readJson(historyKey(ticker), []).filter((day) => day !== currentDay);
}

export function syncMetaKey(journalKey) {
  return `sync-meta:${journalKey}`;
}

export function loadSyncMeta(journalKey) {
  return readJson(syncMetaKey(journalKey), null);
}

export function saveSyncMeta(journalKey, meta) {
  writeJson(syncMetaKey(journalKey), meta);
}
