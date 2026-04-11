(() => {
  // ====== LEE CONFIG DESDE EL <script ... data-*> ======
  const currentScript = document.currentScript;

  const backendFromAttr = currentScript?.getAttribute("data-backend");
  const brandFromAttr = currentScript?.getAttribute("data-brand");
  const posFromAttr = currentScript?.getAttribute("data-position");
  const colorFromAttr = currentScript?.getAttribute("data-color");

  const CONFIG = {
    backendBaseUrl:
      backendFromAttr || "https://tmedia-global-ai.onrender.com",
    channel: "web",
    brandName: brandFromAttr || "Agente IA",
    position: posFromAttr === "left" ? "left" : "right",
    primaryColor: colorFromAttr || "#111827",
    externalUserIdStorageKey: "agente_ia_external_user_id",
    conversationIdStorageKey: "agente_ia_conversation_id",
    chatStartedStorageKey: "agente_ia_chat_started",
    requestTimeoutMs: 25000, // 25s
  };

  // ====== HELPERS ======
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

  function detectContactType(text) {
    const str = String(text || "");
    const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(str);
    const hasPhone = /(\+?\d{1,3}\s*)?(\d[\d\s().-]{7,}\d)/.test(str);

    if (hasEmail && hasPhone) return "email_phone";
    if (hasEmail) return "email";
    if (hasPhone) return "phone";
    return null;
  }

  // ====== FETCH ROBUSTO ======
  async function postMessage({ text, conversationId, externalUserId }) {
    const payload = {
      text,
      external_user_id: externalUserId,
      channel: CONFIG.channel,
    };

    if (conversationId) payload.conversation_id = conversationId;

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

      if (!data) {
        throw new Error("Respuesta no JSON del backend.");
      }

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

  // ====== UI (Shadow DOM) ======
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
    .header{padding:12px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;gap:10px;}
    .title{display:flex;flex-direction:column;gap:2px;}
    .title strong{font-size:14px;}
    .title span{font-size:12px;color:#6b7280;}
    .header-actions{display:flex;gap:8px;}
    .icon-btn{border:1px solid #e5e7eb;background:#fff;border-radius:10px;padding:8px 10px;cursor:pointer;font:inherit;}
    .icon-btn:hover{background:#f9fafb;}
    .messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;background:linear-gradient(to bottom, rgba(255,255,255,.9), rgba(255,255,255,.9));}
    .row{display:flex;width:100%;}
    .row.user{justify-content:flex-end;}
    .row.assistant{justify-content:flex-start;}
    .row.system{justify-content:center;}
    .bubble-msg{max-width:86%;padding:10px 12px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word;border:1px solid transparent;}
    .assistant .bubble-msg{background:#eef2ff;border-color:#dfe5ff;color:#111827;}
    .user .bubble-msg{background:#111827;border-color:#0f172a;color:#fff;}
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
      border-radius:999px; padding:10px 12px; background:#10b981; color:#fff; font-weight:600;
    }
    .footer{border-top:1px solid #e5e7eb;padding:10px;background:#fff;display:grid;gap:8px;}
    .input{width:100%;resize:none;min-height:44px;max-height:110px;border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;font:inherit;outline:none;}
    .input:focus{border-color:#c7d2fe;box-shadow:0 0 0 4px rgba(99,102,241,.10);}
    .actions{display:flex;justify-content:space-between;align-items:center;gap:10px;}
    .status{font-size:12px;color:#6b7280;}
    .send{border:1px solid transparent;border-radius:12px;padding:10px 12px;cursor:pointer;background:${CONFIG.primaryColor};color:#fff;font:inherit;}
    .send:disabled{opacity:.6;cursor:not-allowed;}
    .mini{font-size:12px;color:#6b7280;}
    @media (max-width:420px){.panel{width:calc(100vw - 36px);height:72vh;}}
  `;
  shadow.appendChild(style);

  const container = document.createElement("div");
  container.innerHTML = `
    <div class="bubble">
      <button class="btn" id="openBtn" type="button" aria-label="Abrir chat">
        <span>💬</span>
        <span>${CONFIG.brandName}</span>
      </button>
    </div>

    <div class="panel" id="panel" role="dialog" aria-label="Chat">
      <div class="header">
        <div class="title">
          <strong>${CONFIG.brandName}</strong>
          <span>Asistente virtual</span>
        </div>
        <div class="header-actions">
          <button class="icon-btn" id="newBtn" type="button" title="Nueva conversación">↻</button>
          <button class="icon-btn" id="closeBtn" type="button" title="Cerrar">✕</button>
        </div>
      </div>

      <div class="messages" id="messages" aria-live="polite"></div>

      <div class="footer">
        <textarea class="input" id="input" rows="2" placeholder="Escribe tu mensaje..."></textarea>
        <div class="actions">
          <div class="status" id="status">Listo</div>
          <button class="send" id="sendBtn" type="button">Enviar</button>
        </div>
        <div class="mini" id="mini"></div>
      </div>
    </div>
  `;
  shadow.appendChild(container);

  const el = {
    openBtn: shadow.getElementById("openBtn"),
    panel: shadow.getElementById("panel"),
    closeBtn: shadow.getElementById("closeBtn"),
    newBtn: shadow.getElementById("newBtn"),
    messages: shadow.getElementById("messages"),
    input: shadow.getElementById("input"),
    sendBtn: shadow.getElementById("sendBtn"),
    status: shadow.getElementById("status"),
    mini: shadow.getElementById("mini"),
  };

  function setStatus(text, isError = false) {
    el.status.textContent = text;
    el.status.style.color = isError ? "#b91c1c" : "";
  }

  function append(role, text) {
    const row = document.createElement("div");
    row.className = `row ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "bubble-msg";
    bubble.textContent = text;

    row.appendChild(bubble);
    el.messages.appendChild(row);
    el.messages.scrollTop = el.messages.scrollHeight;
  }

  function appendHandoffCard(handoff) {
    if (!handoff?.whatsapp_url) return;

    const row = document.createElement("div");
    row.className = "row assistant";

    const card = document.createElement("div");
    card.className = "handoff-card";
    card.innerHTML = `
      <strong>Seguir por WhatsApp</strong>
      <span>Te llevo con el contexto de este análisis para continuar sin empezar de cero.</span>
      <a class="handoff-link" href="${handoff.whatsapp_url}" target="_blank" rel="noopener noreferrer">Continuar en WhatsApp</a>
    `;

    row.appendChild(card);
    el.messages.appendChild(row);
    el.messages.scrollTop = el.messages.scrollHeight;
  }

  function setLoading(isLoading) {
    el.sendBtn.disabled = isLoading;
    el.input.disabled = isLoading;
    setStatus(isLoading ? "Enviando..." : "Listo");
  }

  function updateMini() {
    const conv = getConversationId();
    const ext = getOrCreateExternalUserId();
    el.mini.textContent = `conversation_id: ${conv || "—"} | external_user_id: ${ext}`;
  }

  function openPanel() {
    const wasOpen = el.panel.classList.contains("open");

    el.panel.classList.add("open");
    updateMini();

    if (!wasOpen) {
      pushDataLayer("chat_open");
    }

    if (el.messages.childElementCount === 0) {
      append("assistant", "Hola, soy tu agente IA. ¿En qué puedo ayudarte?");
    }

    setTimeout(() => el.input.focus(), 50);
  }

  function closePanel() {
    el.panel.classList.remove("open");
  }

  async function send() {
    const text = (el.input.value || "").trim();
    if (!text) return;

    const externalUserId = getOrCreateExternalUserId();
    const conversationId = getConversationId();
    const contactType = detectContactType(text);

    append("user", text);
    el.input.value = "";
    setLoading(true);
    updateMini();

    // Evento: primer mensaje de la conversación
    if (!hasChatStarted()) {
      setChatStarted(true);
      pushDataLayer("chat_start", {
        message_text: text,
      });
    }

    // Evento: cada mensaje enviado
    pushDataLayer("chat_message_sent", {
      message_text: text,
      contact_type: contactType,
    });

    // Evento: comparte contacto en el mensaje
    if (contactType) {
      pushDataLayer("contact_shared", {
        contact_type: contactType,
        message_text: text,
      });
    }

    try {
      const data = await postMessage({ text, conversationId, externalUserId });

      if (data?.conversation_id) {
        setConversationId(data.conversation_id);
      }

      append("assistant", data?.reply || "Sin respuesta del backend.");
      if (data?.handoff?.whatsapp_url) {
        appendHandoffCard(data.handoff);
      }
      updateMini();
      setStatus("OK");

      // Evento: lead generado (preferente por flag backend)
      if (data?.lead_generated === true) {
        pushDataLayer("lead_generated", {
          lead_score: data?.lead_score ?? null,
          interest_service: data?.interest_service ?? null,
          budget_range: data?.budget_range ?? null,
        });
      } else if (contactType) {
        // fallback si aún no devuelves lead_generated desde backend
        pushDataLayer("lead_generated", {
          lead_score: data?.lead_score ?? null,
          interest_service: data?.interest_service ?? null,
          budget_range: data?.budget_range ?? null,
          inferred: true,
        });
      }
    } catch (err) {
      append("system", `Error: ${err.message}`);
      setStatus("Error", true);

      pushDataLayer("chat_error", {
        error_message: err.message,
      });
    } finally {
      setLoading(false);
    }
  }

  // ====== EVENTS ======
  el.openBtn.addEventListener("click", () => {
    if (el.panel.classList.contains("open")) closePanel();
    else openPanel();
  });

  el.closeBtn.addEventListener("click", closePanel);

  el.newBtn.addEventListener("click", () => {
    clearConversationId();
    setChatStarted(false);

    append("system", "Nueva conversación iniciada.");
    updateMini();

    pushDataLayer("chat_new_conversation");
  });

  el.sendBtn.addEventListener("click", send);

  el.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  el.input.addEventListener("input", () => {
    el.input.style.height = "auto";
    el.input.style.height = `${Math.min(el.input.scrollHeight, 110)}px`;
  });

  updateMini();
})();
