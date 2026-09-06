let lastSignal = null;

const $ = id => document.getElementById(id);

function clearSignalUI(message = "Live signal data unavailable.") {
  lastSignal = null;

  const signal = $("signal");
  if (signal) {
    signal.classList.add("hidden");
    signal.innerHTML = "";
  }

  const diagnostics = $("diagnostics");
  const diagnosticGrid = $("diagnosticGrid");
  const diagnosticSummary = $("diagnosticSummary");
  if (diagnosticGrid) diagnosticGrid.innerHTML = "";
  if (diagnosticSummary) diagnosticSummary.innerHTML = "";
  if (diagnostics) diagnostics.classList.add("hidden");

  document.getElementById("signalx-gate-audit")?.remove();

  window.dispatchEvent(new CustomEvent("signal:cleared", {
    detail: { message }
  }));
}

function showUnavailable(container, message) {
  if (!container) return;
  container.innerHTML = `
    <div class="error">
      <strong>DATA UNAVAILABLE</strong>
      <small>${String(message || "Live market data is temporarily unavailable.")}</small>
    </div>
  `;
}

async function api(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString(undefined, { maximumFractionDigits: 8 })
    : "-";
}

function renderMovers(items) {
  if (!Array.isArray(items) || !items.length) {
    $("movers").innerHTML = '<div class="loading">No movers available.</div>';
    return;
  }

  $("movers").innerHTML = items.map(item => `
    <button class="mover" data-symbol="${item.symbol}">
      <span>
        <b>${item.symbol}</b>
        <small class="muted">${item.volumeLabel || "24H volume"}</small>
      </span>
      <strong class="${item.change >= 0 ? "green" : "red"}">
        ${item.change >= 0 ? "+" : ""}${Number(item.change).toFixed(2)}%
      </strong>
    </button>
  `).join("");

  document.querySelectorAll(".mover").forEach(button => {
    button.onclick = () => {
      $("symbol").value = button.dataset.symbol;
      analyze();
    };
  });
}

window.SignalXRenderMovers = renderMovers;

async function loadMovers() {
  $("movers").innerHTML = '<div class="loading">Loading market data…</div>';

  try {
    renderMovers(await api("/api/movers"));
    $("status").textContent = "Live 24H market data loaded.";
  } catch (error) {
    $("movers").innerHTML = '<div class="error">Could not load market data.</div>';
    $("status").textContent = error.message;
  }
}

function signalBadge(signal) {
  if (signal.side === "BUY") return "🟢 BUY";
  if (signal.side === "SELL") return "🔴 SELL";
  return "⚪ WAIT";
}

function signalClass(signal) {
  return signal.side === "SELL"
    ? "sell"
    : signal.side === "WAIT"
      ? "wait"
      : "";
}

function renderSignal(signal) {
  lastSignal = signal;
  $("signal").classList.remove("hidden");

  const trade = signal.side !== "WAIT";
  const move = Number(signal.expectedMove);
  const score = Math.max(0, Math.min(100, Number(signal.score) || 0));
  const confidence = Math.max(0, Math.min(100, Number(signal.confidence) || 0));
  const sideClass = signalClass(signal);

  $("signal").innerHTML = `
    <div class="signal-head">
      <div class="signal-identity">
        <div class="coin-avatar">${String(signal.symbol || "?").slice(0,1)}</div>
        <div>
          <p class="eyebrow">MTF SCALP SIGNAL</p>
          <h2>${signal.symbol}</h2>
          <p class="muted">${signal.trend} trend • ${signal.strength || "WAIT"}</p>
        </div>
      </div>
      <div class="signal-badge ${sideClass}">${signalBadge(signal)}</div>
    </div>

    <div class="signal-main-grid">
      <div class="score-panel">
        <div class="score-ring-large" style="--score:${score * 3.6}deg">
          <div class="score-ring-inner">
            <strong>${score}</strong>
            <span>/100</span>
            <small>Signal Score</small>
          </div>
        </div>
        <div class="score-meta">
          <span>Confidence</span>
          <b>${confidence}/100</b>
        </div>
      </div>

      <div class="signal-metrics">
        <div class="metric">
          <span>Trend</span>
          <b class="${signal.trend === "BEARISH" ? "red" : signal.trend === "BULLISH" ? "green" : ""}">
            ${signal.trend || "NEUTRAL"}
          </b>
        </div>
        <div class="metric"><span>RSI</span><b>${Number(signal.rsi).toFixed(1)}</b></div>
        <div class="metric"><span>ADX</span><b>${Number(signal.adx).toFixed(1)}</b></div>
        <div class="metric"><span>Entry</span><b>${trade ? money(signal.entry) : "—"}</b></div>
        <div class="metric"><span>Stop Loss</span><b>${trade ? money(signal.sl) : "—"}</b></div>
        <div class="metric"><span>Take Profit</span><b>${trade ? money(signal.tp) : "—"}</b></div>
        <div class="metric"><span>Expected Move</span><b class="${signal.side === "SELL" ? "red" : signal.side === "BUY" ? "green" : ""}">
          ${trade ? `${move >= 0 ? "+" : ""}${move.toFixed(2)}%` : "—"}
        </b></div>
        <div class="metric"><span>Market Quality</span><b>${signal.marketQuality ?? "—"}/100</b></div>
      </div>
    </div>

    <div class="signal-reason ${sideClass}">
      ${signal.side === "BUY" ? "🟢" : signal.side === "SELL" ? "🔴" : "⚠"} 
      ${signal.reason || "Quality gate not satisfied."}
    </div>

    ${signal.mtf ? `
      <div class="mtf-strip">
        ${Object.entries(signal.mtf).map(([tf,v]) => `<div><span>${tf}</span><b class="${v === "BULLISH" ? "green" : v === "BEARISH" ? "red" : ""}">${v}</b></div>`).join("")}
      </div>
    ` : ""}
  `;

  window.dispatchEvent(
    new CustomEvent("signal:updated", {
      detail: signal
    })
  );
}

window.SignalXRenderSignal = renderSignal;

async function analyze() {
  const symbol = $("symbol").value.trim().toUpperCase();

  if (!symbol) {
    $("status").textContent = "Enter a Binance symbol.";
    return;
  }

  $("status").textContent = "Analyzing 1M + 3M + 5M + 15M candles…";

  try {
    const signal = await api(
      "/api/scalp-signal?symbol=" + encodeURIComponent(symbol)
    );

    renderSignal(signal);
    $("status").textContent = "MTF scalp analysis completed.";
  } catch (error) {
    clearSignalUI(error.message);
    $("status").textContent = `DATA UNAVAILABLE • ${error.message}`;
  }
}

function renderTopSignals(items) {
  const box = $("topSignals");

  if (!Array.isArray(items) || !items.length) {
    box.innerHTML =
      '<div class="loading">No signal candidates available.</div>';
    return;
  }

  box.innerHTML = items.map(signal => {
    const trade = signal.side !== "WAIT";
    const move = Number(signal.expectedMove);

    return `
      <button class="top-signal ${signal.side.toLowerCase()}" data-symbol="${signal.symbol}">
        <div>
          <b>${signal.symbol}</b>
          <small class="muted">${signal.trend} • ${signal.strength}</small>
        </div>

        <div class="top-signal-right">
          <strong>${signalBadge(signal)}</strong>
          <small>
            ${signal.confidence}/100
            ${trade ? `• ${move >= 0 ? "+" : ""}${move.toFixed(2)}%` : ""}
          </small>
        </div>
      </button>
    `;
  }).join("");

  // Feed every scanner WAIT candidate into research tracking.
  // This is observation only; it does not alter BUY/SELL/WAIT decisions.
  items.forEach(signal => {
    if (signal?.side === "WAIT" && window.SignalXResearch) {
      window.SignalXResearch.add(signal);
    }
  });

  document.querySelectorAll(".top-signal").forEach(button => {
    button.onclick = () => {
      $("symbol").value = button.dataset.symbol;
      analyze();

      window.scrollTo({
        top: $("signal").offsetTop - 80,
        behavior: "smooth"
      });
    };
  });
}

window.SignalXRenderTopSignals = renderTopSignals;

async function loadTopSignals() {
  $("topSignals").innerHTML =
    '<div class="loading">Analyzing top movers for scalp setups…</div>';

  try {
    const signals = await api("/api/top-signals");
    renderTopSignals(signals);
    window.dispatchEvent(new CustomEvent("top-signals:updated", { detail: signals }));
  } catch (error) {
    $("topSignals").innerHTML =
      `<div class="error"><strong>DATA UNAVAILABLE</strong><small>${String(error.message || "Top signal scan failed.")}</small></div>`;

    window.dispatchEvent(new CustomEvent("top-signals:cleared", {
      detail: { message: error.message }
    }));
  }
}

$("analyzeBtn").onclick = analyze;

$("scanBtn").onclick = loadTopSignals;

$("refreshBtn").onclick = () => {
  loadMovers();
  loadTopSignals();
};

let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredPrompt = event;

  $("installBtn").classList.remove("hidden");
});

$("installBtn").onclick = async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt = null;
    $("installBtn").classList.add("hidden");
  } else {
    alert("On iPhone/iPad: Safari → Share → Add to Home Screen.");
  }
};

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js")
    .catch(console.error);
}

loadMovers();
loadTopSignals();
