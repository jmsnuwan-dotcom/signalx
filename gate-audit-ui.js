/*
 SignalX V12 Gate Audit UI

 Reads the gateAudit object returned by /api/signal.
 Does NOT change BUY/SELL/WAIT decisions.
 It creates the audit panel automatically, so index.html does not need
 another hard-coded section.
*/

(function () {
  "use strict";

  const STYLE_ID = "signalx-gate-audit-style";
  const PANEL_ID = "signalx-gate-audit";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID} {
        margin-top: 12px;
        padding: 14px;
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 12px;
        background: rgba(12,18,28,.92);
      }

      #${PANEL_ID} .gate-audit-head {
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        margin-bottom:12px;
      }

      #${PANEL_ID} h3 {
        margin:0;
        font-size:14px;
      }

      #${PANEL_ID} .gate-audit-sub {
        margin:3px 0 0;
        font-size:10px;
        opacity:.65;
      }

      #${PANEL_ID} .gate-audit-side {
        padding:4px 8px;
        border-radius:999px;
        font-size:10px;
        font-weight:700;
        background:rgba(255,255,255,.08);
      }

      #${PANEL_ID} .gate-audit-grid {
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:10px;
      }

      #${PANEL_ID} .gate-card {
        min-width:0;
        padding:10px;
        border:1px solid rgba(255,255,255,.08);
        border-radius:9px;
        background:rgba(255,255,255,.025);
      }

      #${PANEL_ID} .gate-card h4 {
        margin:0 0 7px;
        font-size:11px;
      }

      #${PANEL_ID} .gate-summary {
        display:flex;
        gap:7px;
        flex-wrap:wrap;
        margin-bottom:8px;
        font-size:9px;
      }

      #${PANEL_ID} .gate-summary span {
        padding:3px 6px;
        border-radius:6px;
        background:rgba(255,255,255,.06);
      }

      #${PANEL_ID} .gate-check {
        display:flex;
        align-items:flex-start;
        gap:6px;
        padding:3px 0;
        font-size:9px;
        line-height:1.25;
      }

      #${PANEL_ID} .gate-check.pass {
        color:#72e6a1;
      }

      #${PANEL_ID} .gate-check.fail {
        color:#ff6b78;
      }

      #${PANEL_ID} .gate-check .mark {
        width:12px;
        flex:0 0 12px;
        font-weight:800;
      }

      #${PANEL_ID} .gate-gap {
        margin-top:7px;
        padding-top:7px;
        border-top:1px solid rgba(255,255,255,.07);
        font-size:9px;
        opacity:.8;
      }

      #${PANEL_ID} .gate-ready {
        margin-top:8px;
        padding:5px 7px;
        border-radius:6px;
        font-size:9px;
        font-weight:700;
        text-align:center;
      }

      #${PANEL_ID} .gate-ready.ready {
        color:#72e6a1;
        background:rgba(55,200,120,.10);
      }

      #${PANEL_ID} .gate-ready.blocked {
        color:#ff9aa3;
        background:rgba(255,70,90,.08);
      }

      @media (max-width:600px) {
        #${PANEL_ID} .gate-audit-grid {
          grid-template-columns:1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    injectStyles();

    panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.className = "panel";

    const diagnostics = document.getElementById("diagnostics");
    const signalSection =
      document.querySelector("#signal") ||
      document.querySelector(".signal") ||
      document.querySelector('[class*="signal"]');

    if (diagnostics?.parentNode) {
      diagnostics.parentNode.insertBefore(panel, diagnostics.nextSibling);
    } else if (signalSection?.parentNode) {
      signalSection.parentNode.appendChild(panel);
    } else {
      document.body.appendChild(panel);
    }

    return panel;
  }

  function renderSide(title, audit) {
    if (!audit) return "";

    const passed = Array.isArray(audit.passed) ? audit.passed : [];
    const failed = Array.isArray(audit.failed) ? audit.failed : [];

    const checks = [
      ...passed.map(x => ({ name: x, pass: true })),
      ...failed.map(x => ({ name: x, pass: false }))
    ];

    return `
      <div class="gate-card">
        <h4>${escapeHtml(title)} Gate</h4>

        <div class="gate-summary">
          <span>${escapeHtml(audit.passedCount ?? passed.length)}/${escapeHtml(audit.totalCount ?? checks.length)} passed</span>
          <span>Score ${escapeHtml(audit.score ?? 0)}/100</span>
          <span>Gap ${escapeHtml(audit.scoreGap ?? 0)}</span>
        </div>

        ${checks.map(c => `
          <div class="gate-check ${c.pass ? "pass" : "fail"}">
            <span class="mark">${c.pass ? "✓" : "✕"}</span>
            <span>${escapeHtml(c.name)}</span>
          </div>
        `).join("")}

        <div class="gate-ready ${audit.ready ? "ready" : "blocked"}">
          ${audit.ready ? "GATE READY" : "GATE BLOCKED"}
        </div>
      </div>
    `;
  }

  function render(data) {
    const audit = data?.gateAudit;
    if (!audit) return;

    const panel = ensurePanel();
    const nearest = audit.nearestSide || "—";

    panel.innerHTML = `
      <div class="gate-audit-head">
        <div>
          <h3>Signal Gate Audit</h3>
          <p class="gate-audit-sub">
            Exact BUY/SELL gate conditions — diagnostic only
          </p>
        </div>
        <div class="gate-audit-side">
          Nearest: ${escapeHtml(nearest)}
        </div>
      </div>

      <div class="gate-audit-grid">
        ${renderSide("BUY", audit.BUY)}
        ${renderSide("SELL", audit.SELL)}
      </div>
    `;
  }

  window.SignalXGateAudit = { render };

  window.addEventListener("signal:updated", function (event) {
    render(event.detail);
  });

  // Useful if the script loads after app.js has already rendered a signal.
  if (window.lastSignal?.gateAudit) {
    render(window.lastSignal);
  }
})();

window.addEventListener("signal:cleared", () => {
  document.getElementById("signalx-gate-audit")?.remove();
});
