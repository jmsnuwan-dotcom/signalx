const BASE = "https://fapi.binance.com";
const MAX_BARS = 16;

function pct(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return ((a - b) / b) * 100;
}

export default async function handler(req, res) {
  const symbol = String(req.query.symbol || "").trim().toUpperCase();
  const direction = String(req.query.direction || "").toUpperCase();
  const entry = Number(req.query.entry);
  const started = Number(req.query.started);

  if (!/^[A-Z0-9]{5,20}$/.test(symbol) || !["BUY", "SELL"].includes(direction)) {
    return res.status(400).json({ error: "Invalid research request." });
  }
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(started)) {
    return res.status(400).json({ error: "Invalid entry or timestamp." });
  }

  const url = `${BASE}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=15m&startTime=${Math.floor(started)}&limit=${MAX_BARS}`;

  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error("Binance Futures historical data unavailable.");

    const raw = await r.json();
    const bars = raw.map(x => ({
      openTime: Number(x[0]),
      high: Number(x[2]),
      low: Number(x[3]),
      close: Number(x[4]),
      closeTime: Number(x[6])
    })).filter(x => [x.openTime, x.high, x.low, x.close, x.closeTime].every(Number.isFinite));

    const closed = bars.filter(x => x.closeTime <= Date.now());
    if (!closed.length) {
      return res.status(200).json({ ready: false, bars: 0, symbol, direction, entry });
    }

    const maxHigh = Math.max(...closed.map(x => x.high));
    const minLow = Math.min(...closed.map(x => x.low));
    const last = closed.at(-1).close;

    const mfe = direction === "BUY" ? pct(maxHigh, entry) : pct(entry, minLow);
    const mae = direction === "BUY" ? pct(minLow, entry) : pct(entry, maxHigh);
    const finalReturn = direction === "BUY" ? pct(last, entry) : pct(entry, last);

    return res.status(200).json({
      ready: closed.length >= 4,
      bars: closed.length,
      symbol,
      direction,
      entry,
      mfe: mfe == null ? null : +mfe.toFixed(4),
      mae: mae == null ? null : +mae.toFixed(4),
      finalReturn: finalReturn == null ? null : +finalReturn.toFixed(4),
      measuredHours: +(closed.length * 0.25).toFixed(2),
      firstBar: closed[0].openTime,
      lastBar: closed.at(-1).openTime
    });
  } catch (error) {
    console.error("research:", error);
    return res.status(500).json({ error: error.message || "Research failed." });
  }
}
