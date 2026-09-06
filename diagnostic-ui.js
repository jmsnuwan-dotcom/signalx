/*
 SignalX V10 synchronized diagnostics helper.

 The API is the single source of truth.

 Expected API fields:
 response.diagnostics
 response.score
 response.confidence
 response.side
 response.entry
 response.sl
 response.tp

 This helper renders the diagnostics returned by the API.
*/

window.SignalXDiagnostics = {
  statusClass(status) {
    return status === "PASS"
      ? "pass"
      : status === "FAIL"
        ? "fail"
        : "warn";
  },

  render(data, root) {
    if (!root || !data?.diagnostics) {
      return;
    }

    const items = Object.entries(data.diagnostics);

    root.innerHTML = items.map(([name, diagnostic]) => `
      <div class="diagnostic-card">
        <div class="diagnostic-name">
          ${name}
        </div>

        <span class="diagnostic-status ${this.statusClass(diagnostic.status)}">
          ${diagnostic.status}
        </span>

        <div class="diagnostic-value">
          ${diagnostic.value ?? "—"}
        </div>

        ${
          diagnostic.detail
            ? `<div class="diagnostic-detail">${diagnostic.detail}</div>`
            : ""
        }
      </div>
    `).join("");

    root.dataset.score = data.score ?? "";
    root.dataset.confidence = data.confidence ?? "";
    root.dataset.signal = data.side ?? "WAIT";

    const diagnosticsSection = document.getElementById("diagnostics");

    if (diagnosticsSection) {
      diagnosticsSection.classList.remove("hidden");
    }

    const summary = document.getElementById("diagnosticSummary");

    if (summary) {
      const passed = items.filter(
        ([, item]) => item?.status === "PASS"
      ).length;

      const failed = items.filter(
        ([, item]) => item?.status === "FAIL"
      ).length;

      const warnings = items.filter(
        ([, item]) => item?.status !== "PASS" && item?.status !== "FAIL"
      ).length;

      summary.innerHTML = `
        <span>Score: <b>${data.score ?? "—"}/100</b></span>
        <span>Confidence: <b>${data.confidence ?? "—"}/100</b></span>
        <span>Signal: <b>${data.side ?? "WAIT"}</b></span>
        <span class="pass">PASS: ${passed}</span>
        <span class="fail">FAIL: ${failed}</span>
        <span class="warn">WARN: ${warnings}</span>
      `;
    }
  }
};

window.addEventListener("signal:updated", event => {
  const signal = event.detail;

  const root = document.getElementById("diagnosticGrid");

  if (!root) {
    return;
  }

  window.SignalXDiagnostics.render(signal, root);
});
window.addEventListener("signal:cleared", () => {
  const section = document.getElementById("diagnostics");
  const grid = document.getElementById("diagnosticGrid");
  const summary = document.getElementById("diagnosticSummary");
  if (grid) grid.innerHTML = "";
  if (summary) summary.innerHTML = "";
  if (section) section.classList.add("hidden");
});
