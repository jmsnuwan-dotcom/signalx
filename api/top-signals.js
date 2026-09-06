/*
 * SignalX V13 — Multi-stage market scanner + API stability layer
 *
 * Pipeline:
 *   1) Discover active Binance Futures USDT perpetuals.
 *   2) Apply 24H liquidity filter.
 *   3) Fast-screen the liquid universe with lightweight 15M data.
 *   4) Run the existing V12 buildSignal() engine on the strongest candidates.
 *   5) Return the best 12 results.
 *
 * Stability additions only:
 * - short-lived in-memory market snapshot cache
 * - short-lived 15M candle cache
 * - timeout + retry with exponential backoff
 * - controlled concurrency instead of large request bursts
 * - graceful handling of temporary Binance/API failures
 *
 * IMPORTANT: api/signal.js is not modified by this scanner.
 */

import { buildSignal } from "./signal.js";

const BASE = "https://fapi.binance.com";
const MIN_QUOTE_VOLUME_USDT = 5_000_000;
const FAST_SCREEN_LIMIT = 30;
const FAST_KLINE_LIMIT = 55;
const FAST_BATCH_SIZE = 10;
const FULL_BATCH_SIZE = 4;
const FINAL_RESULT_LIMIT = 12;

const REQUEST_TIMEOUT_MS = 8_000;
const REQUEST_RETRIES = 2;
const MARKET_CACHE_MS = 20_000;
const FAST_CACHE_MS = 45_000;

let marketCache = null;
const fastCache = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const avg = (values) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let value = avg(values.slice(0, period));
  for (let i = period; i < values.length; i++) {
    value = values[i] * k + value * (1 - k);
  }
  return value;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;

  let gains = 0;
  let losses = 0;

  for (let i = values.length - period; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    if (delta > 0) gains += delta;
    else losses -= delta;
  }

  return losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
}

function parseKlines(raw) {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((x) => ({
      open: Number(x[1]),
      high: Number(x[2]),
      low: Number(x[3]),
      close: Number(x[4]),
      volume: Number(x[5])
    }))
    .filter((x) =>
      Number.isFinite(x.open) &&
      Number.isFinite(x.high) &&
      Number.isFinite(x.low) &&
      Number.isFinite(x.close) &&
      Number.isFinite(x.volume)
    );
}

function qualityDistance(value, low, high) {
  if (!Number.isFinite(value)) return 0;
  if (value >= low && value <= high) return 1;
  const distance = value < low ? low - value : value - high;
  return Math.max(0, 1 - distance / 25);
}

function fastScreen(symbol, ticker, candles) {
  const closed = candles.slice(0, -1);
  if (closed.length < 50) return null;

  const closes = closed.map((x) => x.close);
  const price = closes.at(-1);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const R = rsi(closes, 14);

  if (![price, e20, e50, R].every(Number.isFinite)) return null;

  const volumeAvg = avg(closed.slice(-21, -1).map((x) => x.volume));
  const volumeRatio = volumeAvg ? closed.at(-1).volume / volumeAvg : 1;
  const move4h = ((price - closes.at(-17)) / closes.at(-17)) * 100;

  const last = closed.at(-1);
  const range = Math.max(last.high - last.low, Number.EPSILON);
  const bodyRatio = Math.abs(last.close - last.open) / range;
  const closePosition = (last.close - last.low) / range;
  const bullCandle = bodyRatio >= 0.40 && closePosition >= 0.62;
  const bearCandle = bodyRatio >= 0.40 && closePosition <= 0.38;

  const bullTrend = price > e20 && e20 > e50;
  const bearTrend = price < e20 && e20 < e50;

  const buyRsi = qualityDistance(R, 50, 68);
  const sellRsi = qualityDistance(R, 32, 50);
  const volumeScore = Math.min(1, Math.max(0, volumeRatio / 1.25));
  const buyMomentum = move4h > 0 ? Math.min(1, Math.abs(move4h) / 5) : 0;
  const sellMomentum = move4h < 0 ? Math.min(1, Math.abs(move4h) / 5) : 0;

  const buyScore =
    (bullTrend ? 32 : 0) +
    buyRsi * 24 +
    buyMomentum * 18 +
    volumeScore * 14 +
    (bullCandle ? 12 : 0);

  const sellScore =
    (bearTrend ? 32 : 0) +
    sellRsi * 24 +
    sellMomentum * 18 +
    volumeScore * 14 +
    (bearCandle ? 12 : 0);

  return {
    symbol,
    change24h: Number(ticker.priceChangePercent),
    volume24h: Number(ticker.quoteVolume),
    buyFast: +buyScore.toFixed(2),
    sellFast: +sellScore.toFixed(2),
    fastScore: +Math.max(buyScore, sellScore).toFixed(2)
  };
}

async function fetchJson(url, label) {
  let lastError = null;

  for (let attempt = 0; attempt <= REQUEST_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json" }
      });

      if (response.ok) return await response.json();

      const status = response.status;
      const retryable = status === 408 || status === 425 || status === 429 || status >= 500;
      lastError = new Error(`${label} HTTP ${status}`);

      if (!retryable || attempt === REQUEST_RETRIES) break;
    } catch (error) {
      lastError = error?.name === "AbortError"
        ? new Error(`${label} timeout`)
        : error;
    } finally {
      clearTimeout(timer);
    }

    await sleep(400 * 2 ** attempt);
  }

  throw lastError || new Error(`${label} request failed`);
}

async function getMarketSnapshot() {
  const now = Date.now();
  if (marketCache && now - marketCache.at < MARKET_CACHE_MS) {
    return marketCache.value;
  }

  const [info, tickers] = await Promise.all([
    fetchJson(`${BASE}/fapi/v1/exchangeInfo`, "Binance Futures exchangeInfo"),
    fetchJson(`${BASE}/fapi/v1/ticker/24hr`, "Binance Futures ticker")
  ]);

  if (!Array.isArray(info?.symbols) || !Array.isArray(tickers)) {
    throw new Error("Binance Futures market data malformed");
  }

  const value = { info, tickers };
  marketCache = { at: now, value };
  return value;
}

async function fetchFastScreen(item) {
  const now = Date.now();
  const cached = fastCache.get(item.symbol);

  if (cached && now - cached.at < FAST_CACHE_MS) {
    return cached.value;
  }

  try {
    const raw = await fetchJson(
      `${BASE}/fapi/v1/klines?symbol=${encodeURIComponent(item.symbol)}&interval=15m&limit=${FAST_KLINE_LIMIT}`,
      `15M ${item.symbol}`
    );

    const result = fastScreen(item.symbol, item, parseKlines(raw));
    if (result) fastCache.set(item.symbol, { at: now, value: result });
    return result;
  } catch (error) {
    console.debug(`Skipped ${item.symbol} — Binance Futures candle data unavailable.`);
    return null;
  }
}

async function mapBatches(items, batchSize, worker) {
  const results = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(worker));
    results.push(...batchResults);

    // Small pause between batches reduces burst pressure on Binance.
    if (i + batchSize < items.length) await sleep(150);
  }

  return results;
}

function finalRank(a, b) {
  const aTrade = a.side === "BUY" || a.side === "SELL";
  const bTrade = b.side === "BUY" || b.side === "SELL";

  if (aTrade !== bTrade) return Number(bTrade) - Number(aTrade);
  if (b.confidence !== a.confidence) return Number(b.confidence) - Number(a.confidence);
  if (b.marketQuality !== a.marketQuality) return Number(b.marketQuality) - Number(a.marketQuality);
  return Number(b.score) - Number(a.score);
}

export default async function handler(req, res) {
  const startedAt = Date.now();

  // Signal results must always come from the current successful scan.
  // Never allow an old CDN/browser response to survive a failed refresh.
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");

  try {
    const { info, tickers } = await getMarketSnapshot();

    const activeSymbols = new Set(
      info.symbols
        .filter(
          (s) =>
            s.status === "TRADING" &&
            s.quoteAsset === "USDT" &&
            (s.contractType === "PERPETUAL" || !s.contractType)
        )
        .map((s) => s.symbol)
    );

    const liquidUniverse = tickers
      .filter((t) => {
        const volume = Number(t.quoteVolume);
        const lastPrice = Number(t.lastPrice);
        return (
          activeSymbols.has(t.symbol) &&
          Number.isFinite(volume) &&
          volume >= MIN_QUOTE_VOLUME_USDT &&
          Number.isFinite(lastPrice) &&
          lastPrice > 0
        );
      })
      .map((t) => ({
        symbol: t.symbol,
        priceChangePercent: Number(t.priceChangePercent),
        quoteVolume: Number(t.quoteVolume),
        lastPrice: Number(t.lastPrice)
      }))
      .filter((t) => Number.isFinite(t.priceChangePercent));

    const screened = await mapBatches(
      liquidUniverse,
      FAST_BATCH_SIZE,
      fetchFastScreen
    );

    const fastCandidates = screened
      .filter(Boolean)
      .sort((a, b) => b.fastScore - a.fastScore)
      .slice(0, FAST_SCREEN_LIMIT);

    const fullResults = await mapBatches(
      fastCandidates,
      FULL_BATCH_SIZE,
      async (candidate) => {
        try {
          const signal = await buildSignal(candidate.symbol);
          return {
            ...signal,
            change24h: candidate.change24h,
            volume24h: candidate.volume24h,
            fastScore: candidate.fastScore
          };
        } catch (error) {
          const message = error?.message || "unknown error";
          if (/not enough candle history/i.test(message)) {
            console.debug(`Skipped ${candidate.symbol} — insufficient candle history`);
          } else if (/binance|market|exchange|candle|fetch|timeout/i.test(message)) {
            console.debug(`Skipped ${candidate.symbol} — Binance/API data unavailable.`);
          } else {
            console.debug(`Skipped ${candidate.symbol} — ${message}`);
          }
          return null;
        }
      }
    );

    const usable = fullResults
      .filter(Boolean)
      .sort(finalRank)
      .slice(0, FINAL_RESULT_LIMIT);

    // An empty result here means the live scan could not produce fresh
    // signal data. Do not return [] because the frontend could mistake
    // that for a valid empty market and keep stale UI state elsewhere.
    if (!usable.length) {
      throw new Error("No fresh Binance Futures signal data available.");
    }

    console.log("SignalX multi-stage scan", {
      universe: activeSymbols.size,
      liquid: liquidUniverse.length,
      fastScreened: screened.filter(Boolean).length,
      fullAnalyzed: fastCandidates.length,
      returned: usable.length,
      ms: Date.now() - startedAt
    });

    res.setHeader("X-SignalX-Data-State", "LIVE");
    return res.status(200).json(usable);
  } catch (error) {
    console.error("top-v13:", error);

    res.setHeader("X-SignalX-Data-State", "UNAVAILABLE");

    // Never convert an API outage into fake WAIT signals.
    return res.status(503).json({
      error: "Binance Futures market data temporarily unavailable. Please retry shortly.",
      code: "BINANCE_FUTURES_UNAVAILABLE"
    });
  }
}
