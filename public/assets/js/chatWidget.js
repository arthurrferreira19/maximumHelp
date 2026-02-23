// public/assets/js/chatWidget.js
// Maximum Chat (widget): conversas, grupos, anexos, respostas, reações e realtime (Socket.IO)

(function () {
  const EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "👀", "🔥"];

  const state = {
    me: null,
    socket: null,
    conversations: [],
    activeConvId: null,
    messagesByConv: new Map(),
    replyTo: null,
    groupSelected: new Set(),
    groupUsersCache: []
  };

  function meId() {
    return String(state.me?._id || state.me?.id || "");
  }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtTime(d) {
    try {
      const dt = new Date(d);
      return dt.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  }

  function convTitle(conv) {
    if (!conv) return "";
    const myId = meId();
    if (conv.type === "group") return conv.name || "Grupo";
    // direct
    const other = (conv.members || []).find((m) => String(m.user?._id || m.user) !== String(myId));
    return other?.userName || other?.userEmail || "Conversa";
  }

  async function ensureSocketIoClientLoaded() {
    if (window.io) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/socket.io/socket.io.js";
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }

  function openModal() {
    const modal = $("mhChatModal");
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    // esconde o botão flutuante enquanto o chat estiver aberto
    const fab = $("mhChatFab");
    if (fab) fab.classList.add("d-none");
    // marca badge como visualizado (sem zerar unread, isso depende do read)
    updateFabBadge();
  }

  function closeModal() {
    const modal = $("mhChatModal");
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    // volta o botão flutuante
    const fab = $("mhChatFab");
    if (fab) fab.classList.remove("d-none");
  }

  // Bootstrap modals (grupo/anexar chamado) precisam ficar acima do chat
  function elevateBootstrapModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add("mh-chat-bsmodal");

    const tagBackdrop = () => {
      const backs = Array.from(document.querySelectorAll(".modal-backdrop"));
      const b = backs[backs.length - 1];
      if (b) b.classList.add("mh-chat-backdrop");
    };

    // backdrop é inserido durante o show
    modalEl.addEventListener("show.bs.modal", () => setTimeout(tagBackdrop, 0));
    modalEl.addEventListener("shown.bs.modal", () => setTimeout(tagBackdrop, 0));
  }

  function updateFabBadge() {
    const badge = $("mhChatBadge");
    const total = state.conversations.reduce((acc, c) => acc + (c.unread || 0), 0);
    if (total > 0) {
      badge.textContent = total > 99 ? "99+" : String(total);
      badge.classList.remove("d-none");
    } else {
      badge.classList.add("d-none");
    }
  }

  function renderConversations(list) {
    const el = $("mhChatConversations");
    el.innerHTML = "";

    list.forEach((c) => {
      const title = c._title || c.name || "Conversa";
      const sub = c.lastMessage?.text
        ? c.lastMessage.text.slice(0, 42)
        : (c.lastMessage?.attachmentsCount ? "📎 Anexo" : "Sem mensagens");
      const pill = (title || "C").slice(0, 1).toUpperCase();

      const div = document.createElement("div");
      div.className = `mh-chat-conv ${String(state.activeConvId) === String(c._id) ? "active" : ""}`;
      div.innerHTML = `
        <div class="mh-chat-conv-left">
          <div class="mh-chat-pill">${esc(pill)}</div>
          <div style="min-width:0">
            <div class="mh-chat-conv-title text-truncate">${esc(title)}</div>
            <div class="mh-chat-conv-sub text-truncate">${esc(sub)}</div>
          </div>
        </div>
        ${c.unread ? `<div class="mh-chat-unread">${c.unread > 99 ? "99+" : c.unread}</div>` : ""}
      `;
      div.addEventListener("click", () => selectConversation(c._id));
      el.appendChild(div);
    });

    if (window.lucide) window.lucide.createIcons();
    updateFabBadge();
  }

  function renderMessages(convId) {
    const el = $("mhChatMessages");
    const msgs = state.messagesByConv.get(String(convId)) || [];
    el.innerHTML = "";

    msgs.forEach((m) => {
      const isMe = String(m.senderId?._id || m.senderId) === meId();
      const who = m.senderId?.nome || "Usuário";
      const avatar = (who || "U").slice(0, 1).toUpperCase();
      const meta = `${esc(who)} • ${esc(fmtTime(m.createdAt))}`;

      const bubble = document.createElement("div");
      bubble.className = `mh-msg ${isMe ? "me" : ""}`;
      bubble.innerHTML = `
        <div class="avatar">${esc(avatar)}</div>
        <div class="mh-bubble">
          <div class="mh-msg-actions">
            <button type="button" class="mh-act-reply" title="Responder"><i data-lucide="reply" class="ico"></i></button>
            <button type="button" class="mh-act-react" title="Reagir"><i data-lucide="smile" class="ico"></i></button>
          </div>
          <div class="meta">${meta}</div>
          ${m.replyTo ? `<div class="small text-muted" style="border-left:3px solid rgba(123,30,58,.35); padding-left:10px; margin-bottom:8px;">↪ ${esc((m.replyTo.text||"").slice(0,70) || "(mensagem)")}</div>` : ""}
          ${m.kind === "ticket" && m.ticket?.ticketId ? renderTicketHtml(m.ticket) : ""}
          ${m.text ? `<div class="text">${esc(m.text)}</div>` : ""}
          ${Array.isArray(m.attachments) && m.attachments.length ? `
            <div class="mh-attach-list">
              ${m.attachments
                .map((a) => `
                  <div class="mh-attach">
                    <i data-lucide="paperclip" class="ico"></i>
                    <a href="${esc(a.url)}" target="_blank" rel="noreferrer">${esc(a.originalName)}</a>
                    <span class="small text-muted">(${Math.round((a.size||0)/1024)} KB)</span>
                  </div>
                `)
                .join("")}
            </div>
          ` : ""}
          ${renderReactionsHtml(m)}
        </div>
      `;

      const btnReply = bubble.querySelector(".mh-act-reply");
      const btnReact = bubble.querySelector(".mh-act-react");
      btnReply.addEventListener("click", () => setReplyTo(m));
      btnReact.addEventListener("click", (e) => showQuickReactMenu(e.currentTarget, m));

      // reaction pills click
      bubble.querySelectorAll("[data-react-emoji]").forEach((pill) => {
        pill.addEventListener("click", () => {
          const emoji = pill.getAttribute("data-react-emoji");
          toggleReaction(m, emoji);
        });
      });

      el.appendChild(bubble);
    });

    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => { el.scrollTop = el.scrollHeight; }, 0);
  }

  function renderReactionsHtml(m) {
    const reactions = m.reactions || [];
    if (!reactions.length) return "";
    const meId = String(state.me?._id);
    const pills = reactions
      .map((r) => {
        const users = (r.users || []).map(String);
        const active = users.includes(meId);
        return `<span class="mh-react ${active ? "active" : ""}" data-react-emoji="${esc(r.emoji)}">${esc(r.emoji)} ${users.length}</span>`;
      })
      .join("");
    return `<div class="mh-reactions">${pills}</div>`;
  }

  function renderTicketHtml(ticket) {
    const base = window.location.pathname.includes("/admin/") ? "/admin/chamadosAdmin.html" : "/user/chamadosUser.html";
    const href = `${base}?open=${encodeURIComponent(ticket.ticketId)}`;
    return `
      <div class="mh-ticket">
        <div class="mh-ticket-top">
          <div class="mh-ticket-badge"><i data-lucide="ticket" class="ico"></i></div>
          <div style="min-width:0">
            <div class="mh-ticket-title text-truncate">${esc(ticket.title || "Chamado")}</div>
            <div class="mh-ticket-sub">Chamado anexado à conversa</div>
          </div>
        </div>
        <div class="mt-2">
          <a class="btn btn-sm btn-outline-secondary" style="border-radius:12px;" href="${esc(href)}">
            <i data-lucide="maximize-2" class="ico"></i>
            Abrir chamado
          </a>
        </div>
      </div>
    `;
  }

  function setReplyTo(m) {
    state.replyTo = m;
    const bar = $("mhChatReplyBar");
    $("mhChatReplyText").textContent = (m.text || "(mensagem)").slice(0, 120);
    bar.classList.remove("d-none");
  }

  function clearReplyTo() {
    state.replyTo = null;
    $("mhChatReplyBar").classList.add("d-none");
    $("mhChatReplyText").textContent = "";
  }

  function showQuickReactMenu(anchorBtn, msg) {
    // menu simples (sem depender de libs)
    const existing = document.getElementById("mhReactMenu");
    if (existing) existing.remove();

    const menu = document.createElement("div");
    menu.id = "mhReactMenu";
    menu.style.position = "fixed";
    menu.style.zIndex = 1300;
    menu.style.padding = "8px 10px";
    menu.style.borderRadius = "16px";
    menu.style.border = "1px solid rgba(18,20,32,0.16)";
    menu.style.background = "rgba(255,255,255,0.92)";
    menu.style.boxShadow = "0 18px 60px rgba(16,18,24,.18)";
    menu.style.display = "flex";
    menu.style.gap = "6px";

    EMOJIS.forEach((e) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mh-react";
      b.textContent = e;
      b.style.padding = "6px 10px";
      b.addEventListener("click", () => {
        toggleReaction(msg, e);
        menu.remove();
      });
      menu.appendChild(b);
    });

    const rect = anchorBtn.getBoundingClientRect();
    menu.style.left = Math.min(rect.left, window.innerWidth - 260) + "px";
    menu.style.top = Math.max(10, rect.top - 52) + "px";
    document.body.appendChild(menu);

    const onClickAway = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener("mousedown", onClickAway);
      }
    };
    document.addEventListener("mousedown", onClickAway);
  }

  async function toggleReaction(msg, emoji) {
    const meId = String(state.me?._id);
    const r = (msg.reactions || []).find((x) => x.emoji === emoji);
    const has = r ? (r.users || []).map(String).includes(meId) : false;
    await API.request(`/api/chat/messages/${msg._id}/react`, {
      method: "POST",
      body: { emoji, action: has ? "remove" : "add" }
    });
  }

  async function hydrateConversationNames(convs) {
    // Busca nomes dos participantes para mostrar no direct
    // Faz uma única busca "vazia" para cachear usuários
    const users = await API.request("/api/chat/users?search=");
    const byId = new Map((users.users || []).map((u) => [String(u._id), u]));

    convs.forEach((c) => {
      (c.members || []).forEach((m) => {
        const u = byId.get(String(m.user?._id || m.user));
        if (u) {
          m.userName = u.nome;
          m.userEmail = u.email;
        }
      });
      c._title = convTitle(c);
    });
    return convs;
  }

  function renderPeople(users) {
    const el = $("mhChatPeople");
    if (!el) return;
    el.innerHTML = "";

    users
      .filter((u) => String(u._id) !== meId())
      .slice(0, 18)
      .forEach((u) => {
        const div = document.createElement("div");
        div.className = "mh-chat-conv";
        div.innerHTML = `
          <div class="mh-chat-conv-left">
            <div class="mh-chat-pill">${esc((u.nome || "U").slice(0, 1).toUpperCase())}</div>
            <div style="min-width:0">
              <div class="mh-chat-conv-title text-truncate">${esc(u.nome)}</div>
              <div class="mh-chat-conv-sub text-truncate">${esc(u.email)} • ${esc(u.role || "")}</div>
            </div>
          </div>
          <div class="small text-muted">chat</div>
        `;
        div.addEventListener("click", async () => {
          const created = await API.request("/api/chat/conversations", {
            method: "POST",
            body: { type: "direct", otherUserId: u._id }
          });
          await loadConversations();
          await selectConversation(created.conversation._id);
        });
        el.appendChild(div);
      });

    if (window.lucide) window.lucide.createIcons();
  }

  async function loadPeople(initialSearch = "") {
    try {
      const data = await API.request(`/api/chat/users?search=${encodeURIComponent(initialSearch)}`);
      renderPeople(data.users || []);
    } catch {
      // ignora
    }
  }

  async function loadConversations() {
    const data = await API.request("/api/chat/conversations");
    const convs = await hydrateConversationNames(data.conversations || []);
    state.conversations = convs;
    renderConversations(convs);
  }

  async function selectConversation(convId) {
    state.activeConvId = String(convId);

    $("mhChatEmpty").classList.add("d-none");
    $("mhChatThread").classList.remove("d-none");

    const conv = state.conversations.find((c) => String(c._id) === String(convId));
    $("mhChatThreadTitle").textContent = conv?._title || conv?.name || "Conversa";
    const membersCount = conv?.members?.length || 0;
    $("mhChatThreadMeta").textContent = conv?.type === "group" ? `${membersCount} membros` : "Direto";

    // join room
    state.socket?.emit?.("chat:join", { conversationId: String(convId) });

    // messages
    const data = await API.request(`/api/chat/conversations/${convId}/messages?limit=60`);
    state.messagesByConv.set(String(convId), data.messages || []);
    renderMessages(convId);

    // mark read
    await API.request(`/api/chat/conversations/${convId}/read`, { method: "POST" });
    // zerar unread local
    state.conversations = state.conversations.map((c) =>
      String(c._id) === String(convId) ? { ...c, unread: 0 } : c
    );
    renderConversations(state.conversations);
    clearReplyTo();
  }

  async function sendCurrentMessage() {
    const convId = state.activeConvId;
    if (!convId) return;
    const text = $("mhChatText").value;
    const files = $("mhChatFiles").files;

    if (!text.trim() && (!files || !files.length)) return;

    const fd = new FormData();
    fd.append("text", text);
    if (state.replyTo?._id) fd.append("replyTo", state.replyTo._id);
    Array.from(files || []).slice(0, 5).forEach((f) => fd.append("files", f));

    const token = API.getToken();
    const res = await fetch(`/api/chat/conversations/${convId}/messages`, {
      method: "POST",
      headers: { Authorization: token ? `Bearer ${token}` : "" },
      body: fd
    });
    if (!res.ok) {
      const t = await res.text();
      let msg = `Erro HTTP ${res.status}`;
      try { msg = JSON.parse(t)?.message || msg; } catch {}
      throw new Error(msg);
    }

    $("mhChatText").value = "";
    $("mhChatFiles").value = "";
    clearReplyTo();
  }

  async function handleSearchInput() {
    const q = $("mhChatSearch").value.trim();
    if (!q) {
      renderConversations(state.conversations);
      await loadPeople("");
      return;
    }

    // filtra conversas por título
    const convFiltered = state.conversations.filter((c) => (c._title || "").toLowerCase().includes(q.toLowerCase()));
    renderConversations(convFiltered);

    await loadPeople(q);
  }

  async function openGroupModal() {
    const modalEl = document.getElementById("mhChatGroupModal");
    if (!modalEl || !window.bootstrap?.Modal) return;
    elevateBootstrapModal(modalEl);
    const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

    state.groupSelected = new Set();
    $("mhChatGroupName").value = "";
    $("mhChatGroupSearch").value = "";

    const data = await API.request("/api/chat/users?search=");
    state.groupUsersCache = (data.users || []).filter((u) => String(u._id) !== String(state.me?._id));
    renderGroupUsers(state.groupUsersCache);
  }

  function renderGroupUsers(users) {
    const el = $("mhChatGroupUsers");
    el.innerHTML = "";

    users.forEach((u) => {
      const picked = state.groupSelected.has(String(u._id));
      const card = document.createElement("div");
      card.className = "mh-chat-userpick";
      card.innerHTML = `
        <div>
          <div class="who">${esc(u.nome)}</div>
          <div class="mail">${esc(u.email)} • ${esc(u.role || "")}</div>
        </div>
        <button class="btn btn-sm ${picked ? "btn-mh" : "btn-outline-secondary"}" type="button">
          ${picked ? "Selecionado" : "Adicionar"}
        </button>
      `;
      card.querySelector("button").addEventListener("click", () => {
        const id = String(u._id);
        if (state.groupSelected.has(id)) state.groupSelected.delete(id);
        else state.groupSelected.add(id);
        renderGroupUsers(users);
      });
      el.appendChild(card);
    });
  }

  async function createGroup() {
    const name = $("mhChatGroupName").value.trim() || "Novo Grupo";
    const memberIds = Array.from(state.groupSelected);
    // regra: grupo precisa de no mínimo 3 pessoas (incluindo você)
    if (memberIds.length < 2) {
      alert("Grupo precisa de no mínimo 3 pessoas (você + 2 membros).");
      return;
    }

    const data = await API.request("/api/chat/conversations", {
      method: "POST",
      body: { type: "group", name, memberIds }
    });

    // fechar modal
    const modalEl = document.getElementById("mhChatGroupModal");
    window.bootstrap?.Modal?.getOrCreateInstance(modalEl)?.hide();

    await loadConversations();
    await selectConversation(data.conversation._id);
  }

  // ---------------------------
  // Ticket attach
  // ---------------------------
  async function openTicketModal() {
    if (!state.activeConvId) return;
    const modalEl = document.getElementById("mhChatTicketModal");
    if (!modalEl || !window.bootstrap?.Modal) return;
    elevateBootstrapModal(modalEl);
    const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);

    $("mhChatTicketSearch").value = "";
    const scopeSel = $("mhChatTicketScope");
    if (scopeSel) scopeSel.value = "mine";
    renderTicketList([]);
    modal.show();
    await searchTickets("");
  }

  function renderTicketList(tickets) {
    const el = $("mhChatTicketList");
    if (!el) return;
    el.innerHTML = "";
    if (!tickets.length) {
      el.innerHTML = `<div class="text-muted small">Nenhum chamado encontrado.</div>`;
      return;
    }

    tickets.slice(0, 20).forEach((t) => {
      const card = document.createElement("div");
      card.className = "mh-chat-ticket";
      card.innerHTML = `
        <div style="min-width:0">
          <div class="title text-truncate">${esc(t.titulo)}</div>
          <div class="sub text-truncate">${esc(t.status)} • ${esc(t.prioridade)} • ${esc(t.setorNome || "")}</div>
        </div>
        <button type="button" class="btn btn-sm btn-mh" style="border-radius:12px;">Anexar</button>
      `;
      card.querySelector("button").addEventListener("click", async () => {
        await attachTicketToConversation(t._id, t.titulo);
        window.bootstrap?.Modal?.getOrCreateInstance(document.getElementById("mhChatTicketModal"))?.hide();
      });
      el.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
  }

  async function searchTickets(q) {
    const scope = $("mhChatTicketScope")?.value || "mine";
    const data = await API.request(`/api/chat/tickets?search=${encodeURIComponent(q || "")}&scope=${encodeURIComponent(scope)}`);
    renderTicketList(data.tickets || []);
  }

  async function attachTicketToConversation(ticketId, title) {
    const convId = state.activeConvId;
    if (!convId) return;

    const fd = new FormData();
    fd.append("text", "");
    fd.append("ticketId", ticketId);
    fd.append("ticketTitle", title || "");

    const token = API.getToken();
    const res = await fetch(`/api/chat/conversations/${convId}/messages`, {
      method: "POST",
      headers: { Authorization: token ? `Bearer ${token}` : "" },
      body: fd
    });
    if (!res.ok) {
      const t = await res.text();
      let msg = `Erro HTTP ${res.status}`;
      try { msg = JSON.parse(t)?.message || msg; } catch {}
      throw new Error(msg);
    }
  }

  function wireUI() {
    $("mhChatFab")?.addEventListener("click", openModal);
    $("mhChatClose")?.addEventListener("click", closeModal);

    // clique fora fecha
    $("mhChatModal")?.addEventListener("click", (e) => {
      if (e.target?.id === "mhChatModal") closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });

    $("mhChatSearch")?.addEventListener("input", debounce(handleSearchInput, 280));

    // anexar chamado
    $("mhChatAttachTicket")?.addEventListener("click", openTicketModal);
    $("mhChatTicketSearch")?.addEventListener(
      "input",
      debounce(() => searchTickets($("mhChatTicketSearch").value.trim()), 260)
    );
    $("mhChatTicketScope")?.addEventListener("change", () => searchTickets($("mhChatTicketSearch").value.trim()));

    $("mhChatComposer")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await sendCurrentMessage();
      } catch (err) {
        alert(err.message || "Falha ao enviar");
      }
    });

    $("mhChatCancelReply")?.addEventListener("click", clearReplyTo);
    $("mhChatMarkRead")?.addEventListener("click", async () => {
      if (!state.activeConvId) return;
      await API.request(`/api/chat/conversations/${state.activeConvId}/read`, { method: "POST" });
      state.conversations = state.conversations.map((c) =>
        String(c._id) === String(state.activeConvId) ? { ...c, unread: 0 } : c
      );
      renderConversations(state.conversations);
    });

    $("mhChatNewGroup")?.addEventListener("click", openGroupModal);
    $("mhChatGroupSearch")?.addEventListener(
      "input",
      debounce(() => {
        const q = $("mhChatGroupSearch").value.trim().toLowerCase();
        const filtered = !q
          ? state.groupUsersCache
          : state.groupUsersCache.filter((u) =>
              (u.nome || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q)
            );
        renderGroupUsers(filtered);
      }, 220)
    );
    $("mhChatCreateGroupBtn")?.addEventListener("click", createGroup);
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function upsertMessage(convId, message) {
    const key = String(convId);
    const msgs = state.messagesByConv.get(key) || [];
    if (msgs.some((m) => String(m._id) === String(message._id))) return;
    msgs.push(message);
    state.messagesByConv.set(key, msgs);
  }

  async function connectSocket() {
    await ensureSocketIoClientLoaded();
    const token = API.getToken();
    if (!token) return;

    state.socket = window.io({
      auth: { token },
      transports: ["websocket", "polling"]
    });

    state.socket.on("connect", () => {
      // ok
    });

    state.socket.on("connect_error", () => {
      // silencioso
    });

    state.socket.on("chat:conversation_created", async () => {
      await loadConversations();
    });

    state.socket.on("chat:new_message", async ({ conversationId, message }) => {
      if (!conversationId || !message) return;

      // adiciona
      upsertMessage(conversationId, message);

      // atualiza conversa (unread)
      const isActive = String(state.activeConvId) === String(conversationId) && document.getElementById("mhChatModal")?.classList.contains("open");
      state.conversations = state.conversations.map((c) => {
        if (String(c._id) !== String(conversationId)) return c;
        const unread = isActive ? 0 : (c.unread || 0) + (String(message.senderId?._id || message.senderId) === meId() ? 0 : 1);
        return {
          ...c,
          unread,
          lastMessageAt: message.createdAt,
          lastMessage: {
            _id: message._id,
            text: message.text,
            senderId: message.senderId?._id || message.senderId,
            createdAt: message.createdAt,
            attachmentsCount: (message.attachments || []).length
          }
        };
      });

      renderConversations(state.conversations);

      if (isActive) {
        renderMessages(conversationId);
        await API.request(`/api/chat/conversations/${conversationId}/read`, { method: "POST" });
      }
    });

    state.socket.on("chat:message_reaction", ({ conversationId, messageId, reactions }) => {
      if (!conversationId || !messageId) return;
      const msgs = state.messagesByConv.get(String(conversationId)) || [];
      const idx = msgs.findIndex((m) => String(m._id) === String(messageId));
      if (idx >= 0) {
        msgs[idx].reactions = reactions || [];
        state.messagesByConv.set(String(conversationId), msgs);
        if (String(state.activeConvId) === String(conversationId)) renderMessages(conversationId);
      }
    });
  }

  async function init() {
    // exige login
    const token = API.getToken();
    const me = API.getUser();
    if (!token || !me) return;
    state.me = me;

    wireUI();
    await loadConversations();
    await loadPeople("");
    await connectSocket();

    // se a lista estiver vazia, mostra empty
    if (!state.activeConvId) {
      $("mhChatEmpty").classList.remove("d-none");
      $("mhChatThread").classList.add("d-none");
    }
  }

  window.MHChat = { init };
})();
