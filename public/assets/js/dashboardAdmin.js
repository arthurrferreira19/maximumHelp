let chartStatus = null;
let chart30d = null;

function destroyCharts() {
  if (chartStatus) { chartStatus.destroy(); chartStatus = null; }
  if (chart30d) { chart30d.destroy(); chart30d = null; }
}

function setKpi(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "—";
}

function renderTables(data) {
  const tbS = document.getElementById("tblSetores");
  const tbR = document.getElementById("tblResponsaveis");

  tbS.innerHTML = (data.rankingSetores?.length ? data.rankingSetores : [])
    .map((x) => `
      <tr>
        <td>${x.nome || "—"}</td>
        <td class="text-end"><strong>${x.abertos}</strong></td>
      </tr>
    `).join("") || `<tr><td colspan="2" style="color:var(--muted);">Sem dados</td></tr>`;

  tbR.innerHTML = (data.rankingResponsaveis?.length ? data.rankingResponsaveis : [])
    .map((x) => `
      <tr>
        <td>${x.nome || "—"}</td>
        <td style="color:var(--muted);">${x.email || "—"}</td>
        <td class="text-end"><strong>${x.abertos}</strong></td>
      </tr>
    `).join("") || `<tr><td colspan="3" style="color:var(--muted);">Sem dados</td></tr>`;
}

function renderCharts(charts) {
  destroyCharts();

  const statusCounts = charts?.statusCounts || [];
  const labelsS = statusCounts.map((x) => x.status);
  const valuesS = statusCounts.map((x) => x.total);

  const ctxStatus = document.getElementById("chartStatus");
  chartStatus = new Chart(ctxStatus, {
    type: "doughnut",
    data: {
      labels: labelsS,
      datasets: [{ data: valuesS }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" }
      }
    }
  });

  const perDay = charts?.perDay || [];
  const labelsD = perDay.map((x) => x.date);
  const valuesD = perDay.map((x) => x.total);

  const ctx30 = document.getElementById("chart30d");
  chart30d = new Chart(ctx30, {
    type: "line",
    data: {
      labels: labelsD,
      datasets: [{ data: valuesD, tension: 0.35 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: { beginAtZero: true }
      }
    }
  });
}

async function loadDashboard() {
  renderErrorBanner("dashError", "");
  try {
    const data = await API.request("/api/admin/dashboard/summary", { method: "GET", auth: true });

    setKpi("kpiTotal", data.kpis.total);
    setKpi("kpiAbertos", data.kpis.abertos);
    setKpi("kpiUrgentes", data.kpis.urgentes);
    setKpi("kpiAtrasados", data.kpis.atrasados);

    renderTables(data);
    renderCharts(data.charts);

  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      API.clearAuth();
      window.location.href = "/admin/login.html";
      return;
    }
    renderErrorBanner("dashError", err.message || "Falha ao carregar dashboard.");
  }
}

(function init() {
  validateTokenOrRedirect();
  mountSidebar("dashboard");
  showTopbarModule("Dashboard");
  setupSidebarToggle();
  lucide.createIcons();

  document.getElementById("btnLogoutTop")?.addEventListener("click", () => {
    API.clearAuth();
    window.location.href = "/admin/login.html";
  });

  document.getElementById("btnRefresh")?.addEventListener("click", loadDashboard);

  loadDashboard();
})();
