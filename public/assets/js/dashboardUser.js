function showAlert(type, msg) {
  const el = document.getElementById("pageAlert");
  if (!el) return;
  if (!msg) { el.innerHTML = ""; return; }
  el.innerHTML = `
    <div class="alert alert-${type} fade-in" role="alert" style="border-radius:16px;">
      ${msg}
    </div>
  `;
}

async function loadKPIs() {
  try {
    const me = API.getUser();
    document.getElementById("userName").textContent = me?.nome || "Usuário";

    // Enquanto /api/tickets for ADMIN only, isso pode retornar 403.
    const tickets = await API.request(`/api/tickets`, { method: "GET" });

    const total = tickets.length;
    const open = tickets.filter(t => ["Pendente", "Em Andamento"].includes(t.status)).length;
    const done = tickets.filter(t => t.status === "Concluído").length;

    document.getElementById("kpiTotal").textContent = total;
    document.getElementById("kpiOpen").textContent = open;
    document.getElementById("kpiDone").textContent = done;

    showAlert("", "");
  } catch (err) {
    document.getElementById("kpiTotal").textContent = "—";
    document.getElementById("kpiOpen").textContent = "—";
    document.getElementById("kpiDone").textContent = "—";

    showAlert(
      "warning",
      "KPIs ainda não disponíveis para USER nesta fase. Próximo passo: liberar permissões para USER ver apenas seus chamados."
    );
  }
}

(function init() {
  if (!userValidateTokenOrRedirect()) return;

  userMountSidebar("dashboard");
  userSetupSidebarToggle();

  const me = API.getUser();
  document.getElementById("userName").textContent = me?.nome || "Usuário";

  document.getElementById("btnRefresh").addEventListener("click", loadKPIs);

  loadKPIs();
  if (window.lucide) window.lucide.createIcons();
})();
