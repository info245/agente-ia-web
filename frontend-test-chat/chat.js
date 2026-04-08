const CONFIG = {
  backendBaseUrl: "https://agente-ia-web-backend.onrender.com",
  channel: "web",
  externalUserIdStorageKey: "agente_ia_external_user_id",
  conversationIdStorageKey: "agente_ia_conversation_id",
};

const dom = {
  chatForm: document.getElementById("chatForm"),
  chatInput: document.getElementById("chatInput"),
  chatMessages: document.getElementById("chatMessages"),
  sendBtn: document.getElementById("sendBtn"),
  statusText: document.getElementById("statusText"),
  btnClearConversation: document.getElementById("btnClearConversation"),

  backendUrlText: document.getElementById("backendUrlText"),
  conversationIdText: document.getElementById("conversationIdText"),
  externalUserIdText: document.getElementById("externalUserIdText"),
  lastStepText: document.getElementById("lastStepText"),
};

function generateExternalUserId() {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `web_local_${randomPart}`;
}

function getOrCreateExternalUserId() {
  let externalUserId = localStorage.getItem(CONFIG.externalUserIdStorageKey);
  if (!externalUserId) {
    externalUserId = generateExternalUserId();
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

function setStatus(text, isError = false) {
  dom.statusText.textContent = text;
  dom.statusText.style.color = isError ? "#b91c1c" : "";
}

function updateDebugPanel({ conversationId = null, externalUserId = null, lastStep = null } = {}) {
  dom.backendUrlText.textContent = CONFIG.backendBaseUrl;
  dom.conversationIdText.textContent = conversationId || "—";
  dom.externalUserIdText.textContent = externalUserId || "—";
  dom.lastStepText.textContent = lastStep || "—";
}

function scrollMessagesToBottom() {
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

function appendMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `msg msg-${role}`;

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = text;

  wrapper.appendChild(bubble);
  dom.chatMessages.appendChild(wrapper);
  scrollMessagesToBottom();
}

function appendSystemMessage(text) {
  appendMessage("system", text);
}

function setLoading(isLoading) {
  dom.sendBtn.disabled = isLoading;
  dom.chatInput.disabled = isLoading;
  setStatus(isLoading ? "Enviando..." : "Listo");
}

async function sendMessageToBackend({ text, conversationId, externalUserId, channel }) {
  const payload = {
    text,
    external_user_id: externalUserId,
    channel: channel || "web",
  };

  if (conversationId) payload.conversation_id = conversationId;

  const response = await fetch(`${CONFIG.backendBaseUrl}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Respuesta no JSON del backend (status ${response.status})`);
  }

  if (!response.ok) {
    const message = data?.error || `Error HTTP ${response.status}`;
    const details = data?.details ? ` | ${data.details}` : "";
    throw new Error(`${message}${details}`);
  }

  return data;
}

async function handleSubmit(event) {
  event.preventDefault();

  const text = dom.chatInput.value.trim();
  if (!text) return;

  const externalUserId = getOrCreateExternalUserId();
  const currentConversationId = getConversationId();

  appendMessage("user", text);
  dom.chatInput.value = "";
  dom.chatInput.focus();

  setLoading(true);
  updateDebugPanel({ conversationId: currentConversationId, externalUserId, lastStep: "enviando" });

  try {
    const data = await sendMessageToBackend({
      text,
      conversationId: currentConversationId,
      externalUserId,
      channel: CONFIG.channel,
    });

    if (data?.conversation_id) setConversationId(data.conversation_id);

    appendMessage("assistant", data?.reply || "Sin respuesta del backend.");

    updateDebugPanel({
      conversationId: data?.conversation_id || getConversationId(),
      externalUserId,
      lastStep: data?.step || "ok",
    });

    setStatus("Mensaje enviado");
  } catch (error) {
    console.error(error);
    appendSystemMessage(`Error: ${error.message}`);
    setStatus("Error al enviar mensaje", true);

    updateDebugPanel({
      conversationId: getConversationId(),
      externalUserId,
      lastStep: "error",
    });
  } finally {
    setLoading(false);
  }
}

function handleClearConversation() {
  clearConversationId();
  appendSystemMessage("Nueva conversación iniciada. El próximo mensaje creará un nuevo conversation_id.");
  updateDebugPanel({ conversationId: null, externalUserId: getOrCreateExternalUserId(), lastStep: "conversation_cleared" });
  setStatus("Conversación reiniciada");
}

function autoResizeTextarea() {
  dom.chatInput.style.height = "auto";
  dom.chatInput.style.height = `${Math.min(dom.chatInput.scrollHeight, 180)}px`;
}

function init() {
  const externalUserId = getOrCreateExternalUserId();
  const conversationId = getConversationId();

  updateDebugPanel({ conversationId, externalUserId, lastStep: "init" });

  dom.chatForm.addEventListener("submit", handleSubmit);
  dom.btnClearConversation.addEventListener("click", handleClearConversation);
  dom.chatInput.addEventListener("input", autoResizeTextarea);

  dom.chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      dom.chatForm.requestSubmit();
    }
  });

  scrollMessagesToBottom();
}

init();
