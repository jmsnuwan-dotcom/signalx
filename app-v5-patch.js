
// SignalX V5 diagnostic UI patch
function renderV5Diagnostics(signal) {
  const el = document.getElementById("signal");
  if (!el) return;
  const trade = signal.side !== "WAIT";
  const list = arr => (arr || []).map(x => `<span class="diag-chip">${x}</span>`).join("");
  el.innerHTML = `
    <div class="signal-head">
      <div>
        <p class="eyebrow">15 MINUTE SIGNAL</p>
        <h2>${signal.symbol}</h2>
        <p class="muted">${signal.trend} trend • ${signal.strength} • ${signal.score}/100</p>
      </div>
      <div class="signal-badge ${signal.side==="SELL"?"sell":signal.side==="WAIT"?"wait":""}">
        ${signal.side==="BUY"?"🟢 BUY":signal.side==="SELL"?"🔴 SELL":"⚪ WAIT"}
      </div>
    </div>
    <div class="metrics">
      <div class="metric"><span>Entry</span><b>${trade ? signal.entry : "—"}</b></div>
      <div class="metric"><span>Stop Loss</span><b>${trade ? signal.sl : "—"}</b></div>
      <div class="metric"><span>Take Profit</span><b>${trade ? signal.tp : "—"}</b></div>
      <div class="metric"><span>Expected Move</span><b>${trade ? (signal.expectedMove>=0?"+":"")+signal.expectedMove+"%" : "—"}</b></div>
      <div class="metric"><span>RSI</span><b>${Number(signal.rsi).toFixed(1)}</b></div>
      <div class="metric"><span>ADX</span><b>${Number(signal.adx).toFixed(1)}</b></div>
    </div>
    <div class="diagnostic">
      <p class="small muted">✓ Confirmations</p><div class="diag-list">${list(signal.confirmations)}</div>
      <p class="small muted">⚠ Why WAIT / Risk flags</p><div class="diag-list">${list(signal.blockers)}</div>
    </div>`;
}

async function analyzeV5() {
  const input=document.getElementById("symbol");
  const status=document.getElementById("status");
  if(!input)return;
  const symbol=input.value.trim().toUpperCase();
  if(!symbol){status.textContent="Enter a symbol.";return;}
  status.textContent="Analyzing 1H + 15M quality conditions…";
  try{
    const r=await fetch("/api/signal?symbol="+encodeURIComponent(symbol));
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||"Signal failed.");
    window.lastSignal=data;
    renderV5Diagnostics(data);
    status.textContent="V5 quality analysis completed.";
  }catch(e){status.textContent=e.message}
}

const v5Analyze=document.getElementById("analyzeBtn");
if(v5Analyze)v5Analyze.onclick=analyzeV5;
