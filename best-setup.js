/*
 * SignalX V9 — Best Current Setup
 *
 * UI-only ranking layer.
 * It does NOT change the signal engine.
 *
 * It reads /api/top-signals and highlights the closest-to-valid setup.
 * A WAIT remains WAIT; this never converts WAIT into BUY/SELL.
 */
(() => {
  "use strict";

  let busy = false;

  const $ = (s) => document.querySelector(s);

  function scoreOf(x) {
    return Number(x?.confidence ?? x?.marketQuality ?? 0);
  }

  function blockersCount(x) {
    return Array.isArray(x?.blockers) ? x.blockers.length : 0;
  }

  function isTrade(x) {
    return x?.side === "BUY" || x?.side === "SELL";
  }

  function rank(a, b) {
    // Real BUY/SELL always outranks WAIT.
    const tradeDiff = Number(isTrade(b)) - Number(isTrade(a));
    if (tradeDiff) return tradeDiff;

    const confidenceDiff = scoreOf(b) - scoreOf(a);
    if (confidenceDiff) return confidenceDiff;

    return blockersCount(a) - blockersCount(b);
  }

  function clear(message = "Live market data unavailable.") {
    const box = $("#bestCurrentSetup");
    if (!box) return;

    box.innerHTML = `
      <div class="best-head">
        <div>
          <div class="best-kicker">⚠ LIVE DATA</div>
          <div class="best-symbol">DATA UNAVAILABLE</div>
        </div>
        <div class="best-side wait">WAIT</div>
      </div>
      <div class="best-reason">${escapeHtml(message)}</div>
      <div class="best-note">No current setup is shown until a fresh Binance Futures scan succeeds.</div>
    `;
  }

  function render(items) {
    if (!Array.isArray(items) || !items.length) {
      clear("No fresh signal candidates returned.");
      return;
    }

    const best = [...items].sort(rank)[0];
    if (!best) return;

    let box = $("#bestCurrentSetup");

    if (!box) {
      const topSignals = $("#topSignals");
      if (!topSignals) return;

      box = document.createElement("section");
      box.id = "bestCurrentSetup";
      box.className = "panel best-current-setup";

      // Put the best setup before the Top Signals list.
      topSignals.insertAdjacentElement("beforebegin", box);
    }

    const side = best.side || "WAIT";
    const trade = isTrade(best);

    const reason = trade
      ? (best.reason || best.confirmations?.join(" • ") || "Signal confirmed.")
      : (best.reason ||
         best.blockers?.slice(0, 3).join(" • ") ||
         "Quality gate not satisfied.");

    box.innerHTML = `
      <div class="best-head">
        <div>
          <div class="best-kicker">⭐ BEST CURRENT SETUP</div>
          <div class="best-symbol">${escapeHtml(best.symbol || "—")}</div>
        </div>
        <div class="best-side ${side.toLowerCase()}">${side}</div>
      </div>

      <div class="best-meta">
        <span>${escapeHtml(best.trend || "NEUTRAL")}</span>
        <span>${escapeHtml(best.strength || "WAIT")}</span>
        <strong>${scoreOf(best)}/100</strong>
      </div>

      <div class="best-reason">
        ${trade ? "✓ " : "⚠ "}
        ${escapeHtml(reason)}
      </div>

      ${
        trade
          ? `<div class="best-levels">
              <div><small>Entry</small><b>${escapeHtml(String(best.entry ?? "—"))}</b></div>
              <div><small>Stop Loss</small><b>${escapeHtml(String(best.sl ?? "—"))}</b></div>
              <div><small>Take Profit</small><b>${escapeHtml(String(best.tp ?? "—"))}</b></div>
            </div>`
          : `<div class="best-note">
              No forced trade. This is the closest current setup based on the
              existing engine output.
            </div>`
      }
    `;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function refreshBestSetup() {
    if (busy || document.hidden) return;
    busy = true;

    try {
      const res = await fetch(`/api/top-signals?_=${Date.now()}`, {
        cache: "no-store"
      });

      if (!res.ok) throw new Error("Top signals request failed.");

      const data = await res.json();
      render(data);
    } catch (e) {
      clear(e?.message || "Live market data unavailable.");
      console.debug("SignalX V9 best setup:", e);
    } finally {
      busy = false;
    }
  }

  const style = document.createElement("style");
  style.textContent = `
    .best-current-setup {
      margin: 12px 0;
      border-color: rgba(91, 141, 255, .30);
    }

    .best-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }

    .best-kicker {
      font-size: 10px;
      letter-spacing: .12em;
      font-weight: 800;
      color: #8fa6c4;
    }

    .best-symbol {
      margin-top: 5px;
      font-size: 20px;
      font-weight: 900;
    }

    .best-side {
      padding: 7px 10px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 900;
    }

    .best-side.buy {
      color: #4ade80;
      background: rgba(34,197,94,.12);
    }

    .best-side.sell {
      color: #fb7185;
      background: rgba(239,68,68,.12);
    }

    .best-side.wait {
      color: #cbd5e1;
      background: rgba(148,163,184,.12);
    }

    .best-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin-top: 10px;
      font-size: 10px;
      color: #8fa6c4;
    }

    .best-meta span,
    .best-meta strong {
      padding: 4px 7px;
      border-radius: 7px;
      background: rgba(15,23,42,.65);
    }

    .best-reason {
      margin-top: 10px;
      font-size: 11px;
      line-height: 1.5;
    }

    .best-levels {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-top: 10px;
    }

    .best-levels > div {
      padding: 8px;
      border-radius: 8px;
      background: rgba(15,23,42,.65);
    }

    .best-levels small,
    .best-levels b {
      display: block;
    }

    .best-levels small {
      color: #718a96;
      font-size: 9px;
    }

    .best-levels b {
      margin-top: 3px;
      font-size: 11px;
    }

    .best-note {
      margin-top: 10px;
      font-size: 10px;
      color: #8fa6c4;
    }

    @media (max-width: 520px) {
      .best-levels {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);

  window.addEventListener("top-signals:cleared", (event) => {
    clear(event?.detail?.message || "Live market data unavailable.");
  });

  function start() {
    // app.js owns the scanner refresh. This helper only renders its latest result.
    window.addEventListener("top-signals:updated", (event) => {
      if (Array.isArray(event.detail)) render(event.detail);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
