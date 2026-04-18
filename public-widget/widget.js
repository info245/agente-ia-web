;(async () => {
  const currentScript = document.currentScript;

  const backendFromAttr = currentScript?.getAttribute("data-backend");
  const brandFromAttr = currentScript?.getAttribute("data-brand");
  const posFromAttr = currentScript?.getAttribute("data-position");
  const colorFromAttr = currentScript?.getAttribute("data-color");
  const accountIdFromAttr = currentScript?.getAttribute("data-account-id");
  const accountSlugFromAttr = currentScript?.getAttribute("data-account-slug");

  const CONFIG = {
    backendBaseUrl: backendFromAttr || "https://tmedia-global-ai.onrender.com",
    channel: "web",
    brandName: brandFromAttr || "Agente IA",
    position: posFromAttr === "left" ? "left" : "right",
    primaryColor: colorFromAttr || "#111827",
    accentColor: "#8d58ff",
    logoUrl: "",
    accountId: accountIdFromAttr || "",
    accountSlug: accountSlugFromAttr || "",
    externalUserIdStorageKey: "agente_ia_external_user_id",
    conversationIdStorageKey: "agente_ia_conversation_id",
    chatStartedStorageKey: "agente_ia_chat_started",
    requestTimeoutMs: 25000,
  };

  async function loadRemoteWidgetConfig() {
    try {
      const params = new URLSearchParams();
      if (CONFIG.accountId) params.set("account_id", CONFIG.accountId);
      else if (CONFIG.accountSlug) params.set("account_slug", CONFIG.accountSlug);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`${CONFIG.backendBaseUrl}/api/widget/config${suffix}`);
      const data = await res.json();
      if (!res.ok || !data?.ok) return;

      const remote = data.config || {};
      CONFIG.brandName = brandFromAttr || remote?.brand?.name || CONFIG.brandName;
      CONFIG.primaryColor =
        colorFromAttr || remote?.brand?.primary_color || CONFIG.primaryColor;
      CONFIG.accentColor = remote?.brand?.accent_color || CONFIG.accentColor;
      CONFIG.logoUrl = remote?.brand?.logo_url || CONFIG.logoUrl;
      CONFIG.accountId = CONFIG.accountId || remote?.account?.id || "";
      CONFIG.accountSlug = CONFIG.accountSlug || remote?.account?.slug || "";
    } catch (_error) {
      // fallback silencioso: el widget sigue funcionando con la config local
    }
  }

  await loadRemoteWidgetConfig();

  const uid = () => Math.random().toString(36).slice(2, 10);

  function getOrCreateExternalUserId() {
    let externalUserId = localStorage.getItem(CONFIG.externalUserIdStorageKey);
    if (!externalUserId) {
      externalUserId = `web_${uid()}`;
      localStorage.setItem(CONFIG.externalUserIdStorageKey, externalUserId);
    }
    return externalUserId;
  }

  function getConversationId() {
    return localStorage.getItem(CONFIG.conversationIdStorageKey);
  }

  function setConversationId(conversationId) {
    if (!conversationId) return;
    localStorage.setItem(CONFIG.conversationIdStorageKey, conversationId);
  }

  function clearConversationId() {
    localStorage.removeItem(CONFIG.conversationIdStorageKey);
    sessionStorage.removeItem("agente_ia_last_completed_signature");
  }

  function hasChatStarted() {
    return localStorage.getItem(CONFIG.chatStartedStorageKey) === "true";
  }

  function setChatStarted(value) {
    if (value) localStorage.setItem(CONFIG.chatStartedStorageKey, "true");
    else localStorage.removeItem(CONFIG.chatStartedStorageKey);
  }

  function pushDataLayer(eventName, payload = {}) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: eventName,
      chat_brand: CONFIG.brandName,
      chat_channel: CONFIG.channel,
      conversation_id: getConversationId() || null,
      external_user_id: getOrCreateExternalUserId(),
      ...payload,
    });
  }

  function buildCompletedSignature(payload) {
    if (!payload) return null;

    return JSON.stringify({
      conversation_id: payload.conversation_id || "",
      service: payload.interest_service || "",
      budget: payload.budget_range || "",
      phase: payload.phase || "",
      mode: payload.mode || "",
      completed: true,
    });
  }

  function pushChatCompleted(payload = {}) {
    const signature = buildCompletedSignature(payload);
    const lastSignature = sessionStorage.getItem(
      "agente_ia_last_completed_signature"
    );

    if (signature && signature === lastSignature) return;
    if (signature) {
      sessionStorage.setItem("agente_ia_last_completed_signature", signature);
    }

    pushDataLayer("chatbot_completed", {
      chat_completed: true,
      interest_service: payload.interest_service ?? null,
      budget_range: payload.budget_range ?? null,
      preferred_contact_channel: payload.preferred_contact_channel ?? null,
      conversation_mode: payload.mode ?? null,
      conversation_phase: payload.phase ?? null,
      lead_score: payload.lead_score ?? null,
    });
  }

  function detectContactType(text) {
    const str = String(text || "");
    const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(str);
    const hasPhone = /(\+?\d{1,3}\s*)?(\d[\d\s().-]{7,}\d)/.test(str);

    if (hasEmail && hasPhone) return "email_phone";
    if (hasEmail) return "email";
    if (hasPhone) return "phone";
    return null;
  }

  async function postMessage({ text, conversationId, externalUserId }) {
    const payload = {
      text,
      external_user_id: externalUserId,
      channel: CONFIG.channel,
    };

    if (conversationId) payload.conversation_id = conversationId;
    if (CONFIG.accountId) payload.account_id = CONFIG.accountId;
    else if (CONFIG.accountSlug) payload.account_slug = CONFIG.accountSlug;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);

    try {
      const res = await fetch(`${CONFIG.backendBaseUrl}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const rawText = await res.text();
      let data = null;

      try {
        data = JSON.parse(rawText);
      } catch {
        data = null;
      }

      if (!res.ok) {
        const msg = data?.error || `HTTP ${res.status}`;
        const details = data?.details ? ` | ${data.details}` : "";
        const extra = rawText && !data ? ` | ${rawText.slice(0, 200)}` : "";
        throw new Error(`${msg}${details}${extra}`);
      }

      if (!data) throw new Error("Respuesta no JSON del backend.");
      return data;
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error(
          "Timeout: el servidor tardó demasiado. Si usas Render Free, puede estar dormido. Prueba de nuevo."
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  const host = document.createElement("div");
  host.id = "agente-ia-widget-host";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const side = CONFIG.position === "left" ? "left" : "right";

  const style = document.createElement("style");
  style.textContent = `
    .btn{
      font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
      cursor:pointer;border:1px solid transparent;border-radius:999px;
      padding:12px 14px;background:${CONFIG.primaryColor};color:#fff;
      box-shadow:0 10px 30px rgba(0,0,0,.18);
      display:inline-flex;gap:10px;align-items:center;
    }
    .btn-logo,.brand-logo{
      width:22px;height:22px;border-radius:999px;object-fit:cover;display:block;
      background:rgba(255,255,255,.16);
      flex:0 0 auto;
    }
    .brand-logo{width:30px;height:30px;}
    .bubble{position:fixed;bottom:18px;${side}:18px;z-index:999999;}
    .panel{
      position:fixed;bottom:78px;${side}:18px;width:360px;
      max-width:calc(100vw - 36px);height:520px;
      max-height:calc(100vh - 120px);background:#fff;
      border:1px solid #e5e7eb;border-radius:16px;
      box-shadow:0 18px 50px rgba(0,0,0,.22);
      overflow:hidden;z-index:999999;display:none;
      font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
      color:#111827;
    }
    .panel.open{display:flex;flex-direction:column;}
    .header{
      padding:12px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;gap:10px;
      background:linear-gradient(135deg, ${CONFIG.primaryColor}, ${CONFIG.accentColor});
      color:#fff;
    }
    .brand-lockup{display:flex;align-items:center;gap:10px;}
    .title{display:flex;flex-direction:column;gap:2px;}
    .title strong{font-size:14px;}
    .title span{font-size:12px;color:rgba(255,255,255,.78);}
    .header-actions{display:flex;gap:8px;}
    .icon-btn{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.12);color:#fff;border-radius:10px;padding:8px 10px;cursor:pointer;font:inherit;}
    .icon-btn:hover{background:rgba(255,255,255,.2);}
    .messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;background:linear-gradient(to bottom, rgba(255,255,255,.9), rgba(255,255,255,.9));}
    .row{display:flex;width:100%;}
    .row.user{justify-content:flex-end;}
    .row.assistant{justify-content:flex-start;}
    .row.system{justify-content:center;}
    .bubble-msg{max-width:86%;padding:10px 12px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word;border:1px solid transparent;}
    .assistant .bubble-msg{background:#eef2ff;border-color:#dfe5ff;color:#111827;}
    .user .bubble-msg{background:${CONFIG.primaryColor};border-color:${CONFIG.primaryColor};color:#fff;}
    .system .bubble-msg{background:#fff7ed;border-color:#fed7aa;color:#9a3412;text-align:center;max-width:92%;}
    .handoff-card{
      width:min(100%, 290px); background:#ecfdf5; border:1px solid #a7f3d0; color:#065f46;
      border-radius:14px; padding:12px; display:grid; gap:8px;
      box-shadow:0 8px 24px rgba(16,185,129,.12);
    }
    .handoff-card strong{font-size:13px;}
    .handoff-card span{font-size:12px; color:#065f46;}
    .handoff-link{
      display:inline-flex; align-items:center; justify-content:center; text-decoration:none;
      border-radius:999px; padding:10px 12px; background:${CONFIG.accentColor}; color:#fff; font-weight:600;
    }
    .footer{border-top:1px solid #e5e7eb;padding:10px;background:#fff;display:grid;gap:8px;}
    .input{width:100%;resize:none;min-height:44px;max-height:110px;border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;font:inherit;outline:none;}
    .input:focus{border-color:${CONFIG.accentColor};box-shadow:0 0 0 4px rgba(99,102,241,.10);}
    .actions{display:flex;justify-content:space-between;align-items:center;gap:10px;}
    .status{font-size:12px;color:#6b7280;}
    .send{border:1px solid transparent;border-radius:12px;padding:10px 12px;cursor:pointer;background:${CONFIG.primaryColor};color:#fff;font:inherit;}
    .send:disabled{opacity:.6;cursor:not-allowed;}
    .mini{font-size:12px;color:#6b7280;}
    @media (max-width:420px){.panel{width:calc(100vw - 36px);height:72vh;}}
  `;
  shadow.appendChild(style);

  const logoMarkup = CONFIG.logoUrl
    ? `<img class="brand-logo" src="${CONFIG.logoUrl}" alt="${CONFIG.brandName}" />`
    : "";
  const buttonLogoMarkup = CONFIG.logoUrl
    ? `<img class="btn-logo" src="${CONFIG.logoUrl}" alt="${CONFIG.brandName}" />`
    : "";

  const container = document.createElement("div");
  container.innerHTML = `
    <div class="bubble">
      <button class="btn" id="openBtn" type="button" aria-label="Abrir chat">
        ${buttonLogoMarkup}
        <span>${CONFIG.brandName}</span>
      </button>
    </div>

    <div class="panel" id="panel" role="dialog" aria-label="Chat">
      <div class="header">
        <div class="brand-lockup">
          ${logoMarkup}
          <div class="title">
            <strong>${CONFIG.brandName}</strong>
            <span>Asistente virtual</span>
          </div>
        </div>
        <div class="header-actions">
          <button class="icon-btn" id="newBtn" type="button" title="Nueva conversación">↻</button>
          <button class="icon-btn" id="closeBtn" type="button" title="Cerrar">✕</button>
        </div>
      </div>
      <div class="messages" id="messages"></div>
      <div class="footer">
        <textarea id="input" class="input" placeholder="Escribe tu mensaje..." aria-label="Mensaje"></textarea>
        <div class="actions">
          <div class="status" id="status">Listo</div>
          <button class="send" id="sendBtn" type="button">Enviar</button>
        </div>
        <div class="mini">Esta conversación puede continuar por WhatsApp si hace falta.</div>
      </div>
    </div>
  `;
  shadow.appendChild(container);

  const $ = (id) => shadow.getElementById(id);
  const openBtn = $("openBtn");
  const panel = $("panel");
  const closeBtn = $("closeBtn");
  const newBtn = $("newBtn");
  const messages = $("messages");
  const input = $("input");
  const status = $("status");
  const sendBtn = $("sendBtn");

  function setStatus(text) {
    status.textContent = text || "Listo";
  }

  function appendMessage(role, text) {
    const row = document.createElement("div");
    row.className = `row ${role}`;
    const bubble = document.createElement("div");
    bubble.className = "bubble-msg";
    bubble.textContent = text;
    row.appendChild(bubble);
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
  }

  function appendHandoffCard(url, label = "Continuar por WhatsApp") {
    const row = document.createElement("div");
    row.className = "row assistant";
    row.innerHTML = `
      <div class="handoff-card">
        <strong>Seguimos por WhatsApp</strong>
        <span>Si prefieres, continuamos por un canal más directo.</span>
        <a class="handoff-link" href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>
      </div>
    `;
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
  }

  function openPanel() {
    panel.classList.add("open");
    input.focus();
  }

  function closePanel() {
    panel.classList.remove("open");
  }

  async function ensureGreeting() {
    if (hasChatStarted()) return;
    setStatus("Iniciando...");
    sendBtn.disabled = true;

    try {
      const data = await postMessage({
        text: "__start__",
        conversationId: getConversationId(),
        externalUserId: getOrCreateExternalUserId(),
      });

      if (data?.conversation_id) setConversationId(data.conversation_id);
      appendMessage("assistant", data?.reply || "¡Hola! ¿En qué te puedo ayudar?");
      setChatStarted(true);
      pushDataLayer("chat_started");
    } catch (error) {
      appendMessage("system", error.message || "No se pudo iniciar el chat.");
    } finally {
      setStatus("Listo");
      sendBtn.disabled = false;
    }
  }

  async function handleSend() {
    const text = String(input.value || "").trim();
    if (!text) return;

    appendMessage("user", text);
    input.value = "";
    setStatus("Pensando...");
    sendBtn.disabled = true;

    const contactType = detectContactType(text);
    if (contactType) {
      pushDataLayer("contact_shared", { contact_type: contactType });
    }

    try {
      const data = await postMessage({
        text,
        conversationId: getConversationId(),
        externalUserId: getOrCreateExternalUserId(),
      });

      if (data?.conversation_id) setConversationId(data.conversation_id);
      if (data?.reply) appendMessage("assistant", data.reply);

      if (data?.lead_generated) {
        pushDataLayer("lead_generated", {
          interest_service: data?.interest_service ?? null,
          budget_range: data?.budget_range ?? null,
          inferred: data?.inferred ?? null,
        });
      }

      if (data?.chat_completed) {
        pushChatCompleted({
          conversation_id: data?.conversation_id,
          interest_service: data?.interest_service,
          budget_range: data?.budget_range,
          preferred_contact_channel: data?.preferred_contact_channel,
          mode: data?.mode,
          phase: data?.phase,
          lead_score: data?.lead_score,
        });
      }

      if (data?.handoff_url) {
        appendHandoffCard(
          data.handoff_url,
          data?.handoff_label || "Continuar por WhatsApp"
        );
      }
    } catch (error) {
      appendMessage("system", error.message || "No se pudo enviar el mensaje.");
    } finally {
      setStatus("Listo");
      sendBtn.disabled = false;
      input.focus();
    }
  }

  openBtn.addEventListener("click", async () => {
    openPanel();
    await ensureGreeting();
  });
  closeBtn.addEventListener("click", closePanel);
  newBtn.addEventListener("click", async () => {
    clearConversationId();
    setChatStarted(false);
    messages.innerHTML = "";
    pushDataLayer("chat_reset");
    await ensureGreeting();
  });
  sendBtn.addEventListener("click", handleSend);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  });
})();
