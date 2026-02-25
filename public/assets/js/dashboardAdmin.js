// public/assets/js/dashboardAdmin.js
(function () {
  const $ = (id) => document.getElementById(id);

  const STATUS_ORDER = [
    { key: "Pendente", cls: "st-pendente" },
    { key: "Em Andamento", cls: "st-andamento" },
    { key: "Aguardando Solicitante", cls: "st-sol" },
    { key: "Aguardando Fornecedor", cls: "st-forn" },
    { key: "Concluído", cls: "st-conc" },
  ];

  function esc(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normStatus(s) {
    const raw = String(s || "").trim();
    const key = raw
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const map = {
      "pendente": "Pendente",
      "em andamento": "Em Andamento",
      "aguardando solicitante": "Aguardando Solicitante",
      "aguardando fornecedor": "Aguardando Fornecedor",
      "aguardando forncedor": "Aguardando Fornecedor",
      "concluido": "Concluído",
      "concluído": "Concluído",
    };
    return map[key] || (raw || "Pendente");
  }

  function showAlert(type, msg) {
    const box = $("pageAlert");
    if (!box) return;
    if (!msg) { box.innerHTML = ""; return; }
    box.innerHTML = `
      <div class="alert alert-${type} fade-in" role="alert" style="border-radius:16px;">
        ${esc(msg)}
      </div>
    `;
  }

  function setText(id, v) {
    const el = $(id);
    if (el) el.textContent = (v === undefined || v === null) ? "—" : String(v);
  }

  function renderStatusBars(tickets) {
    const wrap = $("statusBars");
    if (!wrap) return;

    const total = Math.max(1, tickets.length);
    const counts = new Map();

    tickets.forEach(t => {
      const st = normStatus(t.status);
      counts.set(st, (counts.get(st) || 0) + 1);
    });

    wrap.innerHTML = STATUS_ORDER.map(s => {
      const count = counts.get(s.key) || 0;
      const pct = Math.round((count / total) * 100);

      return `
        <div>
          <div class="d-flex align-items-center justify-content-between" style="gap:10px;">
            <div class="d-flex align-items-center" style="gap:8px; font-weight:800;">
              <span class="dot ${s.cls}" style="width:10px;height:10px;border-radius:999px;display:inline-block;"></span>
              <span>${esc(s.key)}</span>
            </div>
            <div style="color:var(--muted); font-size:12px;"><strong>${count}</strong> • ${pct}%</div>
          </div>
          <div style="height:10px; border-radius:999px; background:rgba(148,163,184,.25); overflow:hidden; margin-top:6px;">
            <div class="${s.cls}" style="height:100%; width:${pct}%; border-radius:999px;"></div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderRecent(tickets) {
    const list = $("recentList");
    const empty = $("recentEmpty");
    if (!list || !empty) return;

    const recent = [...tickets]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 8);

    if (!recent.length) {
      empty.classList.remove("d-none");
      list.innerHTML = "";
      return;
    }

    empty.classList.add("d-none");
    list.innerHTML = recent.map(t => {
      const st = normStatus(t.status);
      const solicit = esc(t.solicitanteAberto || t.solicitante?.nome || t.solicitante?.email || "—");
      const title = esc(t.titulo || "Sem título");
      const setor = t.setor?.nome ? ` • ${esc(t.setor.nome)}` : "";
      const urg = t.urgente ? `<span class="badge" style="background:#ef4444;color:#fff;border-radius:999px;">URG</span>` : "";

      return `
        <a href="./chamadosAdmin.html#${esc(t._id)}" class="soft-card-sm p-3" style="text-decoration:none; color:inherit; display:block;">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div style="min-width:0;">
              <div style="font-weight:900; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${title}</div>
              <div style="color:var(--muted); font-size:12px; margin-top:2px;">
                ${solicit}${setor}
              </div>
            </div>
            <div class="d-flex align-items-center gap-2">
              ${urg}
              <span class="badge-accent">${esc(st)}</span>
              <i data-lucide="chevron-right" style="width:18px;height:18px;"></i>
            </div>
          </div>
        </a>
      `;
    }).join("");
  }

  async function load() {
    showAlert("", "");

    // ✅ Admin lista tudo
    const data = await API.request("/api/tickets", { method: "GET", auth: true });
    const tickets = Array.isArray(data) ? data : (data.items || []);

    const total = tickets.length;
    const done = tickets.filter(t => normStatus(t.status) === "Concluído").length;
    const open = tickets.filter(t => normStatus(t.status) !== "Concluído").length;
    const urg = tickets.filter(t => !!t.urgente && normStatus(t.status) !== "Concluído").length;

    setText("kTotal", total);
    setText("kOpen", open);
    setText("kUrg", urg);
    setText("kDone", done);

    renderStatusBars(tickets);
    renderRecent(tickets);

    // ✅ MUITO IMPORTANTE: recria ícones depois do render + sidebar
    try { window.lucide && lucide.createIcons(); } catch (e) {}
  }

  function bind() {
    $("btnRefresh")?.addEventListener("click", load);

    $("btnLogoutTop")?.addEventListener("click", () => {
      API.clearAuth();
      window.location.href = "./login.html";
    });
  }

  (async function init() {
    // ✅ usa o mesmo padrão do seu sistema
    if (typeof validateTokenOrRedirect === "function") {
      const ok = validateTokenOrRedirect();
      if (!ok) return;
    }

    if (typeof mountSidebar === "function") {
      mountSidebar("dashboard");
    }

    if (typeof setupSidebarToggle === "function") {
      setupSidebarToggle();
    }

    bind();

    // ✅ Ícones da sidebar/topbar
    try { window.lucide && lucide.createIcons(); } catch (e) {}

    await load();
  })().catch((err) => {
    showAlert("danger", err?.message || "Falha ao carregar dashboard.");
  });
})();