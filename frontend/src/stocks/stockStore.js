import { getStock } from "../api.js";

function normSymbol(symbol) {
  return (symbol || "").trim().toUpperCase();
}

const DEFAULT_POLL_MS = 12000;
const DEFAULT_FRESH_MS = 10000;

/** @type {Map<string, any>} */
const store = new Map();

function getEntry(symbol) {
  const sym = normSymbol(symbol);
  if (!sym) return null;
  let e = store.get(sym);
  if (!e) {
    e = {
      symbol: sym,
      data: null,
      ts: 0,
      loading: false,
      error: "",
      inflight: null,
      subscribers: new Set(),
      intervalId: null,
      pollMs: DEFAULT_POLL_MS,
      freshMs: DEFAULT_FRESH_MS
    };
    store.set(sym, e);
  }
  return e;
}

function notify(entry) {
  const snap = {
    symbol: entry.symbol,
    data: entry.data,
    ts: entry.ts,
    loading: entry.loading,
    error: entry.error
  };
  entry.subscribers.forEach((cb) => {
    try {
      cb(snap);
    } catch {
      // ignore subscriber errors
    }
  });
}

function isFresh(entry) {
  return entry.data && Date.now() - entry.ts < entry.freshMs;
}

async function fetchOnce(entry) {
  if (!entry) return null;
  if (isFresh(entry)) return entry.data;
  if (entry.inflight) return entry.inflight;

  entry.loading = true;
  entry.error = "";
  notify(entry);

  entry.inflight = (async () => {
    try {
      const data = await getStock(entry.symbol);
      entry.data = data || null;
      entry.ts = Date.now();
      entry.loading = false;
      entry.error = "";
      return entry.data;
    } catch (e) {
      entry.loading = false;
      entry.error = e?.message || "Failed to fetch quote";
      return entry.data; // keep last known if any
    } finally {
      entry.inflight = null;
      notify(entry);
    }
  })();

  return entry.inflight;
}

function ensurePolling(entry) {
  if (!entry) return;
  if (entry.intervalId) return;
  entry.intervalId = window.setInterval(() => {
    // skip if nobody is listening
    if (!entry.subscribers.size) return;
    void fetchOnce(entry);
  }, entry.pollMs);
}

function maybeStopPolling(entry) {
  if (!entry) return;
  if (entry.subscribers.size) return;
  if (entry.intervalId) {
    window.clearInterval(entry.intervalId);
    entry.intervalId = null;
  }
}

export function subscribeStock(symbol, cb, { pollMs = DEFAULT_POLL_MS, freshMs = DEFAULT_FRESH_MS } = {}) {
  const entry = getEntry(symbol);
  if (!entry) return () => {};

  entry.pollMs = Math.max(5000, Number(pollMs) || DEFAULT_POLL_MS);
  entry.freshMs = Math.max(1000, Number(freshMs) || DEFAULT_FRESH_MS);

  entry.subscribers.add(cb);
  ensurePolling(entry);

  // Emit immediately from cache if possible, then fetch if stale.
  notify(entry);
  void fetchOnce(entry);

  return () => {
    entry.subscribers.delete(cb);
    maybeStopPolling(entry);
  };
}

export function getStockSnapshot(symbol) {
  const entry = getEntry(symbol);
  if (!entry) return { symbol: "", data: null, ts: 0, loading: false, error: "" };
  return { symbol: entry.symbol, data: entry.data, ts: entry.ts, loading: entry.loading, error: entry.error };
}

