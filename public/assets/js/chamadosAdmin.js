(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  function fmtDate(d) {
    if (!d) return "-";
    try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return "-"; }
  }
  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function setAlert(type, msg) {
    const el = $("pageAlert");
    if (!el) return;
    if (!msg) { el.classList.add("d-none"); el.innerHTML = ""; return; }
    el.className = `alert alert-${type} d-flex align-items-start gap-2`;
    el.innerHTML = `<i data-lucide="${type === "danger" ? "alert-triangle" : "info"}" style="width:18px;height:18px;"></i>
      <div>${escapeHtml(msg)}</div>`;
    el.classList.remove("d-none");
    try { lucide.createIcons(); } catch {}
  }

  let TICKETS = [];
  let USERS = [];
  let SECTORS = [];
  let CURRENT_ID = null;

  let modalTicket, modalDetails;

  const q = $("q");
  const statusFilter = $("statusFilter");
  const urgFilter = $("urgFilter");
  const btnRefresh = $("btnRefresh");
  const btnOpenCreate = $("btnOpenCreate");

  const ticketsGrid = $("ticketsGrid");
  const ticketsEmpty = $("ticketsEmpty");

  const ticketForm = $("ticketForm");
  const modalTicketTitle = $("modalTicketTitle");
  const createErr = $("createErr");
  const btnSaveTicket = $("btnSaveTicket");

  const fTitulo = $("fTitulo");
  const fSolicitanteAberto = $("fSolicitanteAberto");
  const fDescricao = $("fDescricao");
  const fStatus = $("fStatus");
  const fUrgente = $("fUrgente");
  const fPrazoDias = $("fPrazoDias");
  const fSolicitanteId = $("fSolicitanteId");
  const fResponsavelId = $("fResponsavelId");
  const fSetorId = $("fSetorId");
  const fFiles = $("fFiles");
  const selectedFiles = $("selectedFiles");

  const detailsBody = $("detailsBody");

  document.addEventListener("DOMContentLoaded", async () => {
    if (!validateTokenOrRedirect()) return;
    mountSidebar("chamados");

    const btnSidebarToggle = $("btnSidebarToggle");
    if (btnSidebarToggle) btnSidebarToggle.addEventListener("click", () => document.body.classList.toggle("sidebar-collapsed"));

    const btnLogoutTop = $("btnLogoutTop");
    if (btnLogoutTop) btnLogoutTop.addEventListener("click", () => { API.clearAuth(); window.location.href="/admin/login.html"; });

    const mt = $("moduleTitle");
    if (mt) mt.textContent = "Chamados";
    const who = $("whoamiTop");
    const me = API.getUser() || {};
    if (who) who.textContent = me.nome || me.email || "Admin";

    modalTicket = new bootstrap.Modal($("modalTicket"));
    modalDetails = new bootstrap.Modal($("modalDetails"));

    bindEvents();

    try {
      await loadUsersAndSectors();
      await loadTickets();
      render();
    } catch (e) {
      setAlert("danger", e.message || "Falha ao carregar chamados.");
    }
    try { lucide.createIcons(); } catch {}
  });

  function bindEvents() {
    if (btnRefresh) btnRefresh.addEventListener("click", async () => { await loadTickets(); render(); });
    if (btnOpenCreate) btnOpenCreate.addEventListener("click", () => openCreate());
    [q, statusFilter, urgFilter].forEach((el) => {
      if (!el) return;
      el.addEventListener("input", render);
      el.addEventListener("change", render);
    });
    if (btnSaveTicket) btnSaveTicket.addEventListener("click", onSave);

    if (fFiles) fFiles.addEventListener("change", () => {
      const files = Array.from(fFiles.files || []);
      if (!selectedFiles) return;
      selectedFiles.innerHTML = files.length
        ? files.map(f => `<span class="chip">${escapeHtml(f.name)} <small class="text-muted">(${Math.round(f.size/1024)} KB)</small></span>`).join("")
        : `<span class="text-muted">Nenhum arquivo selecionado.</span>`;
    });
  }

  async function loadUsersAndSectors() {
    try { USERS = await API.request("/api/users"); } catch { USERS = []; }
    try { SECTORS = await API.request("/api/sectors"); } catch { SECTORS = []; }
    fillSelect(fSolicitanteId, USERS, "Selecione o solicitante...");
    fillSelect(fResponsavelId, USERS, "Selecione o responsável...");
    fillSelect(fSetorId, SECTORS, "Selecione o setor...", "nome");
  }

  function fillSelect(selectEl, list, placeholder, labelKey="nome") {
    if (!selectEl) return;
    const options = [`<option value="">${escapeHtml(placeholder)}</option>`];
    (list || []).forEach((item) => {
      const label = item[labelKey] || item.email || item._id;
      options.push(`<option value="${item._id}">${escapeHtml(label)}</option>`);
    });
    selectEl.innerHTML = options.join("");
  }

  async function loadTickets() {
    setAlert(null, null);
    const data = await API.request("/api/tickets");
    TICKETS = Array.isArray(data) ? data : (data.items || []);
  }

  function applyFilters(list) {
    let out = [...(list || [])];
    const qq = (q && q.value ? q.value.trim().toLowerCase() : "");
    const st = statusFilter && statusFilter.value ? statusFilter.value : "";
    const urg = urgFilter && urgFilter.value ? urgFilter.value : "";

    if (qq) {
      out = out.filter(t =>
        String(t.titulo || "").toLowerCase().includes(qq) ||
        String(t.descricao || "").toLowerCase().includes(qq) ||
        String(t.solicitanteAberto || "").toLowerCase().includes(qq) ||
        String((t.solicitante && (t.solicitante.nome || t.solicitante.email)) || "").toLowerCase().includes(qq) ||
        String((t.responsavel && (t.responsavel.nome || t.responsavel.email)) || "").toLowerCase().includes(qq)
      );
    }
    if (st) out = out.filter(t => String(t.status || "") === st);
    if (urg === "true") out = out.filter(t => !!t.urgente);
    if (urg === "false") out = out.filter(t => !t.urgente);

    out.sort((a, b) => {
      const au = a.urgente ? 1 : 0;
      const bu = b.urgente ? 1 : 0;
      if (au !== bu) return bu - au;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
    return out;
  }

  function render() {
    if (!ticketsGrid) return;
    const filtered = applyFilters(TICKETS);

    if (!filtered.length) {
      ticketsGrid.innerHTML = "";
      if (ticketsEmpty) ticketsEmpty.classList.remove("d-none");
      try { lucide.createIcons(); } catch {}
      return;
    }
    if (ticketsEmpty) ticketsEmpty.classList.add("d-none");

    ticketsGrid.innerHTML = filtered.map(renderCard).join("");

    ticketsGrid.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const action = btn.getAttribute("data-action");
        const id = btn.getAttribute("data-id");
        if (!id) return;
        if (action === "open") return openDetails(id);
        if (action === "edit") return openEdit(id);
        if (action === "delete") return onDelete(id);
        if (action === "status") return onStatus(id, btn.getAttribute("data-status"));
      });
    });

    ticketsGrid.querySelectorAll(".ticket-card").forEach((card) => {
      card.addEventListener("click", (ev) => {
        if (ev.target.closest("button") || ev.target.closest("a")) return;
        const id = card.getAttribute("data-id");
        if (id) openDetails(id);
      });
    });

    try { lucide.createIcons(); } catch {}
  }

  function renderCard(t) {
    const urgent = !!t.urgente;
    const solicitante = (t.solicitante && (t.solicitante.nome || t.solicitante.email)) || t.solicitanteAberto || "-";
    const responsavel = (t.responsavel && (t.responsavel.nome || t.responsavel.email)) || "-";
    const prazo = (t.prazoDias ?? "-");
    const anexosCount = Array.isArray(t.anexos) ? t.anexos.length : 0;

    return `
      <div class="ticket-card ${urgent ? "is-urgent" : ""}" data-id="${t._id}">
        <div class="ticket-head">
          <div class="d-flex align-items-center gap-2">
            <span class="badge badge-status">${escapeHtml(t.status || "-")}</span>
            ${urgent ? `<span class="urgent-chip"><i data-lucide="clock" style="width:14px;height:14px;"></i> Urgente</span>` : ``}
          </div>
          <div class="ticket-actions">
            <button class="icon-btn" data-action="open" data-id="${t._id}" title="Abrir">
              <i data-lucide="maximize-2" style="width:16px;height:16px;"></i>
            </button>
            <button class="icon-btn" data-action="edit" data-id="${t._id}" title="Editar">
              <i data-lucide="pencil" style="width:16px;height:16px;"></i>
            </button>
            <button class="icon-btn danger" data-action="delete" data-id="${t._id}" title="Excluir">
              <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
            </button>
          </div>
        </div>

        <div class="ticket-title">${escapeHtml(t.titulo || "Sem título")}</div>
        <div class="ticket-desc">${escapeHtml(t.descricao || "").slice(0, 220)}${(t.descricao || "").length > 220 ? "…" : ""}</div>

        <div class="ticket-meta">
          <div><span class="k">Solicitante:</span> ${escapeHtml(solicitante)}</div>
          <div><span class="k">Responsável:</span> ${escapeHtml(responsavel)}</div>
        </div>

        <div class="ticket-foot">
          <div class="d-flex align-items-center gap-2">
            <span class="muted"><i data-lucide="calendar" style="width:14px;height:14px;"></i> ${fmtDate(t.createdAt)}</span>
            <span class="muted"><i data-lucide="hourglass" style="width:14px;height:14px;"></i> Prazo: ${escapeHtml(String(prazo))} dia(s)</span>
            <span class="muted"><i data-lucide="paperclip" style="width:14px;height:14px;"></i> ${anexosCount}</span>
          </div>

          <div class="d-flex gap-1 flex-wrap">
            ${statusButton(t._id, "Pendente")}
            ${statusButton(t._id, "Em Andamento")}
            ${statusButton(t._id, "Aguardando Responsável")}
            ${statusButton(t._id, "Aguardando Solicitante")}
            ${statusButton(t._id, "Concluído")}
          </div>
        </div>
      </div>
    `;
  }

  function statusButton(id, status) {
    return `<button class="mini-btn" data-action="status" data-id="${id}" data-status="${escapeHtml(status)}" type="button">${escapeHtml(status)}</button>`;
  }

  function openCreate() {
    CURRENT_ID = null;
    if (modalTicketTitle) modalTicketTitle.textContent = "Novo chamado";
    if (createErr) createErr.classList.add("d-none");
    if (ticketForm) ticketForm.reset();
    if (selectedFiles) selectedFiles.innerHTML = `<span class="text-muted">Nenhum arquivo selecionado.</span>`;
    if (fStatus) fStatus.value = "Pendente";
    if (fUrgente) fUrgente.value = "false";
    if (fPrazoDias) fPrazoDias.value = "";
    modalTicket.show();
    try { lucide.createIcons(); } catch {}
  }

  async function openEdit(id) {
    try {
      const t = await API.request(`/api/tickets/${id}`);
      CURRENT_ID = t._id;
      if (modalTicketTitle) modalTicketTitle.textContent = "Editar chamado";
      if (createErr) createErr.classList.add("d-none");

      fTitulo && (fTitulo.value = t.titulo || "");
      fSolicitanteAberto && (fSolicitanteAberto.value = t.solicitanteAberto || "");
      fDescricao && (fDescricao.value = t.descricao || "");
      fStatus && (fStatus.value = t.status || "Pendente");
      fUrgente && (fUrgente.value = String(!!t.urgente));
      fPrazoDias && (fPrazoDias.value = (t.prazoDias ?? ""));

      fSolicitanteId && (fSolicitanteId.value = (t.solicitante && t.solicitante._id) ? t.solicitante._id : (t.solicitanteId || ""));
      fResponsavelId && (fResponsavelId.value = (t.responsavel && t.responsavel._id) ? t.responsavel._id : (t.responsavelId || ""));
      fSetorId && (fSetorId.value = (t.setor && t.setor._id) ? t.setor._id : (t.setorId || ""));

      if (fFiles) fFiles.value = "";
      if (selectedFiles) selectedFiles.innerHTML = `<span class="text-muted">Você pode anexar mais arquivos ao salvar.</span>`;

      modalTicket.show();
      try { lucide.createIcons(); } catch {}
    } catch (e) {
      setAlert("danger", e.message || "Falha ao abrir chamado.");
    }
  }

  async function openDetails(id) {
    try {
      const t = await API.request(`/api/tickets/${id}`);
      if (!detailsBody) return;
      const solicitante = (t.solicitante && (t.solicitante.nome || t.solicitante.email)) || t.solicitanteAberto || "-";
      const responsavel = (t.responsavel && (t.responsavel.nome || t.responsavel.email)) || "-";
      const setor = (t.setor && (t.setor.nome || t.setor.titulo)) || "-";
      const anexos = Array.isArray(t.anexos) ? t.anexos : [];

      detailsBody.innerHTML = `
        <div class="details-grid">
          <div class="details-item"><div class="lbl">Título</div><div class="val">${escapeHtml(t.titulo || "-")}</div></div>
          <div class="details-item"><div class="lbl">Solicitante (aberto)</div><div class="val">${escapeHtml(t.solicitanteAberto || "-")}</div></div>
          <div class="details-item"><div class="lbl">Solicitante</div><div class="val">${escapeHtml(solicitante)}</div></div>
          <div class="details-item"><div class="lbl">Responsável</div><div class="val">${escapeHtml(responsavel)}</div></div>
          <div class="details-item"><div class="lbl">Setor</div><div class="val">${escapeHtml(setor)}</div></div>
          <div class="details-item"><div class="lbl">Status</div><div class="val">${escapeHtml(t.status || "-")}</div></div>
          <div class="details-item"><div class="lbl">Urgente</div><div class="val">${t.urgente ? "Sim" : "Não"}</div></div>
          <div class="details-item"><div class="lbl">Prazo (dias)</div><div class="val">${escapeHtml(String(t.prazoDias ?? "-"))}</div></div>
          <div class="details-item wide"><div class="lbl">Descrição</div><div class="val pre">${escapeHtml(t.descricao || "-")}</div></div>
          <div class="details-item wide">
            <div class="lbl">Anexos (${anexos.length})</div>
            <div class="val">
              ${anexos.length ? anexos.map(a => `
                <a class="attach-row" href="${escapeHtml(a.url || "#")}" target="_blank" rel="noopener">
                  <i data-lucide="paperclip" style="width:16px;height:16px;"></i>
                  <span>${escapeHtml(a.originalName || a.filename || "arquivo")}</span>
                  <small class="text-muted ms-auto">${escapeHtml(a.mimeType || "")}</small>
                </a>`).join("") : `<span class="text-muted">Sem anexos.</span>`}
            </div>
          </div>
        </div>
      `;
      modalDetails.show();
      try { lucide.createIcons(); } catch {}
    } catch (e) {
      setAlert("danger", e.message || "Falha ao abrir detalhes.");
    }
  }

  async function onSave() {
    try {
      if (createErr) { createErr.classList.add("d-none"); createErr.textContent=""; }
      const payload = {
        titulo: (fTitulo.value || "").trim() || "Sem título",
        solicitanteAberto: (fSolicitanteAberto && fSolicitanteAberto.value ? fSolicitanteAberto.value.trim() : ""),
        descricao: (fDescricao.value || "").trim(),
        status: fStatus ? fStatus.value : "Pendente",
        urgente: fUrgente ? (fUrgente.value === "true") : false,
        prazoDias: fPrazoDias && fPrazoDias.value !== "" ? Number(fPrazoDias.value) : undefined,
        solicitante: (fSolicitanteId && fSolicitanteId.value) ? fSolicitanteId.value : undefined,
        responsavel: (fResponsavelId && fResponsavelId.value) ? fResponsavelId.value : undefined,
        setor: (fSetorId && fSetorId.value) ? fSetorId.value : undefined,
      };
const files = fFiles ? Array.from(fFiles.files || []) : [];

      if (!CURRENT_ID) {
        if (files.length) {
          const fd = new FormData();
          Object.entries(payload).forEach(([k,v]) => { if (v !== undefined) fd.append(k, String(v)); });
          files.forEach(f => fd.append("files", f));
          await API.upload("/api/tickets", fd, { method:"POST" });
        } else {
          await API.request("/api/tickets", { method:"POST", body: payload });
        }
      } else {
        await API.request(`/api/tickets/${CURRENT_ID}`, { method:"PUT", body: payload });
        if (files.length) {
          const fd = new FormData();
          files.forEach(f => fd.append("files", f));
          await API.upload(`/api/tickets/${CURRENT_ID}/attachments`, fd, { method:"POST" });
        }
      }

      modalTicket.hide();
      await loadTickets();
      render();
      setAlert("success", "Chamado salvo com sucesso!");
      setTimeout(() => setAlert(null, null), 1800);
    } catch (e) {
      if (createErr) { createErr.textContent = e.message || "Falha ao salvar."; createErr.classList.remove("d-none"); }
      else setAlert("danger", e.message || "Falha ao salvar.");
    }
  }

  async function onDelete(id) {
    if (!confirm("Excluir este chamado?")) return;
    try {
      await API.request(`/api/tickets/${id}`, { method:"DELETE" });
      await loadTickets();
      render();
      setAlert("success", "Chamado excluído.");
      setTimeout(() => setAlert(null, null), 1500);
    } catch (e) {
      setAlert("danger", e.message || "Falha ao excluir.");
    }
  }

  async function onStatus(id, status) {
    try {
      await API.request(`/api/tickets/${id}/status`, { method:"PATCH", body:{ status } });
      await loadTickets();
      render();
    } catch (e) {
      setAlert("danger", e.message || "Falha ao atualizar status.");
    }
  }

})();
