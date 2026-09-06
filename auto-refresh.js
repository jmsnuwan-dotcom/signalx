/*
 * SignalX Live Refresh — low noise mode
 *
 * - Full market + Top 15M scan: every 5 minutes.
 * - Selected symbol: every 60 seconds.
 * - No automatic button-click spam.
 * - No immediate refresh loop when returning to the tab unless the
 *   last full scan is older than 5 minutes.
 */
(() => {
  "use strict";

  const MARKET_INTERVAL_MS = 300_000;
  const SYMBOL_INTERVAL_MS = 60_000;
  let marketTimer = null;
  let symbolTimer = null;
  let marketBusy = false;
  let symbolBusy = false;
  let lastMarketUpdate = 0;

  const $ = (id) => document.getElementById(id);

  function setStatus(message) {
    let el = $("autoRefreshStatus");
    if (!el) {
      el = document.createElement("span");
      el.id = "autoRefreshStatus";
      el.style.cssText =
        "margin-left:10px;font-size:10px;color:#8fa6c4;white-space:nowrap;";
      const refresh = $("refreshBtn");
      refresh?.parentElement?.appendChild(el);
    }
    if (el) el.textContent = message;
  }

  async function getJson(url) {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {"cache-control": "no-cache"}
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Live refresh failed.");
    return data;
  }

  async function refreshMarket() {
    if (marketBusy || document.hidden) return;
    marketBusy = true;

    try {
      setStatus("Updating market…");

      const movers = await getJson("/api/movers");
      if (window.SignalXRenderMovers) {
        window.SignalXRenderMovers(movers);
      }

      const signals = await getJson("/api/top-signals");
      if (window.SignalXRenderTopSignals) {
        window.SignalXRenderTopSignals(signals);
      } else {
        window.dispatchEvent(
          new CustomEvent("top-signals:updated", {detail: signals})
        );
      }

      lastMarketUpdate = Date.now();
      setStatus("Live • market scan every 5m");
    } catch (error) {
      console.error("SignalX market refresh:", error);
      setStatus("Live data retry pending");
    } finally {
      marketBusy = false;
    }
  }

  async function refreshSelectedSymbol() {
    if (symbolBusy || document.hidden) return;

    const input = $("symbol");
    if (!input?.value?.trim()) return;

    symbolBusy = true;

    try {
      const symbol = input.value.trim().toUpperCase();
      const response = await getJson(
        "/api/signal?symbol=" + encodeURIComponent(symbol)
      );

      // app.js owns rendering; use the same event path as manual Analyze.
      if (typeof window.SignalXRenderSignal === "function") {
        window.SignalXRenderSignal(response);
      } else {
        window.dispatchEvent(
          new CustomEvent("signal:updated", {detail: response})
        );
      }
    } catch (error) {
      console.debug("SignalX selected-symbol refresh:", error);
    } finally {
      symbolBusy = false;
    }
  }

  function start() {
    clearInterval(marketTimer);
    clearInterval(symbolTimer);

    // app.js already performs the initial page load.
    marketTimer = setInterval(refreshMarket, MARKET_INTERVAL_MS);
    symbolTimer = setInterval(refreshSelectedSymbol, SYMBOL_INTERVAL_MS);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;

      if (Date.now() - lastMarketUpdate >= MARKET_INTERVAL_MS) {
        refreshMarket();
      } else {
        refreshSelectedSymbol();
      }
    });

    setStatus("Live • market 5m • symbol 60s");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, {once: true});
  } else {
    start();
  }
})();
