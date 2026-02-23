function userValidateTokenOrRedirect() {
  const me = API.getUser();
  const token = API.getToken();

  if (!token || !me) {
    window.location.href = "/user/login.html";
    return false;
  }

  if (me.role !== "USER") {
    API.clearAuth();
    window.location.href = "/user/login.html";
    return false;
  }

  return true;
}

function userMountSidebar(activeKey = "dashboard") {
  const me = API.getUser() || { nome: "Usuário" };

  const el = document.getElementById("sidebar");
  el.innerHTML = `
    <div class="side-head">
      <div class="brand">
        <div class="brand-mark"></div>
        <div>
          <div class="brand-title">Maximum Help</div>
          <div class="brand-sub">Painel do Usuário</div>
        </div>
      </div>

      <div class="profile-card">
        <div class="avatar">${(me.nome || "U").slice(0,1).toUpperCase()}</div>
        <div>
          <div class="profile-name">${me.nome || "Usuário"}</div>
          <div class="profile-sub">Role: USER</div>
        </div>
      </div>
    </div>

    <div class="side-nav">
      <div class="nav-section">Navegação</div>
      <div class="nav-list">
        <a class="nav-linkx ${activeKey==="dashboard"?"active":""}" href="/user/dashboardUser.html">
          <i data-lucide="layout-dashboard" class="ico"></i>
          Dashboard
        </a>
        <a class="nav-linkx ${activeKey==="chamados"?"active":""}" href="/user/chamadosUser.html">
          <i data-lucide="ticket" class="ico"></i>
          Chamados
        </a>
      </div>

      <div class="nav-section mt-3">Conta</div>
      <div class="nav-list">
        <button class="nav-linkx w-100 text-start" id="btnLogoutUser" type="button">
          <i data-lucide="log-out" class="ico"></i>
          Sair
        </button>
      </div>
    </div>
  `;

  document.getElementById("btnLogoutUser").addEventListener("click", () => {
    API.clearAuth();
    window.location.href = "/user/login.html";
  });

  if (window.lucide) window.lucide.createIcons();
}

function userSetupSidebarToggle() {
  const btn = document.getElementById("btnSidebarToggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-collapsed");
  });
}
