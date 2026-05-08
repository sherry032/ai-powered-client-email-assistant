const fields = {
  context: document.querySelector("#context"),
  intent: document.querySelector("#intent"),
  tone: document.querySelector("#tone"),
  points: document.querySelector("#points"),
  relationship: document.querySelector("#relationship"),
  result: document.querySelector("#result"),
  status: document.querySelector("#status"),
  generateButton: document.querySelector("#generateButton"),
  insertButton: document.querySelector("#insertButton"),
  refreshContextButton: document.querySelector("#refreshContextButton"),
  settingsButton: document.querySelector("#settingsButton")
};

let currentTabUrl = "";
const LOG_PREFIX = "[CMA popup]";

init();

async function init() {
  const settings = await chrome.storage.sync.get({
    tone: "warm",
    useBackend: true,
    backendUrl: "http://127.0.0.1:8000"
  });
  console.info(LOG_PREFIX, "init settings", {
    tone: settings.tone,
    useBackend: settings.useBackend,
    backendUrl: settings.backendUrl
  });
  fields.tone.value = settings.tone || "warm";
  logBackgroundState();

  refreshContext();
}

async function logBackgroundState() {
  try {
    const state = await chrome.runtime.sendMessage({ type: "CMA_DEBUG_STATE" });
    console.info(LOG_PREFIX, "background debug state", state);
  } catch (error) {
    console.warn(LOG_PREFIX, "background debug state unavailable", error);
  }
}

async function refreshContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabUrl = tab?.url || "";
  if (!tab?.id) return;

  chrome.runtime.sendMessage({ type: "CMA_COLLECT_CONTEXT", tabId: tab.id }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn(LOG_PREFIX, "context request failed", chrome.runtime.lastError.message);
      fields.status.textContent = "Could not read context from this tab. Refresh Gmail and try again.";
      return;
    }
    console.info(LOG_PREFIX, "context response", response?.meta || { chars: response?.context?.length || 0 });
    if (!response?.ok || !response.context) {
      fields.status.textContent = response?.error || "No email context found. Open an email thread or select text, then refresh.";
      return;
    }
    fields.context.value = response.context;
    fields.status.textContent = response.meta
      ? `Email context loaded (${response.meta.source}, ${response.meta.chars} chars).`
      : "Email context loaded.";
  });
}

fields.generateButton.addEventListener("click", async () => {
  console.info(LOG_PREFIX, "generate clicked", {
    contextChars: fields.context.value.length,
    sourceUrl: currentTabUrl
  });
  setBusy(true, "Drafting...");
  fields.insertButton.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "CMA_GENERATE_REPLY",
      payload: readPayload()
    });

    if (!response?.ok) throw new Error(response?.error || "Could not generate a draft.");
    if (!response.source) {
      console.warn(LOG_PREFIX, "background returned old response shape; trying direct backend call", response);
      fields.status.textContent = "Old service worker response; trying backend directly...";
      response.reply = await generateViaBackendDirectly(readPayload());
      response.source = "backend-direct";
      response.requestId = "popup-direct";
    }
    console.info(LOG_PREFIX, "generate response ok", {
      replyChars: response.reply?.length || 0,
      source: response.source,
      requestId: response.requestId,
      status: response.status
    });
    fields.result.value = response.reply;
    fields.insertButton.disabled = !response.reply;
    fields.status.textContent = response.source === "backend" || response.source === "backend-direct"
      ? `Draft ready from backend (${response.requestId}).`
      : "Draft ready.";
  } catch (error) {
    console.error(LOG_PREFIX, "generate failed", error);
    fields.status.textContent = error.message || String(error);
  } finally {
    setBusy(false);
  }
});

fields.insertButton.addEventListener("click", async () => {
  const text = fields.result.value.trim();
  if (!text) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    fields.status.textContent = "No active tab found.";
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: "CMA_INSERT_TEXT", text }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      fields.status.textContent = "Click into a message box, then try Insert again.";
      return;
    }
    fields.status.textContent = "Inserted into the active message box.";
  });
});

fields.settingsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

fields.refreshContextButton.addEventListener("click", () => {
  fields.status.textContent = "Reading email context...";
  refreshContext();
});

function readPayload() {
  return {
    context: fields.context.value.trim(),
    intent: fields.intent.value,
    tone: fields.tone.value,
    points: fields.points.value.trim(),
    relationship: fields.relationship.value.trim(),
    sourceUrl: currentTabUrl
  };
}

function setBusy(isBusy, message = "") {
  fields.generateButton.disabled = isBusy;
  fields.generateButton.textContent = isBusy ? "Generating..." : "Generate Draft";
  if (message) fields.status.textContent = message;
}

async function generateViaBackendDirectly(payload) {
  const settings = await chrome.storage.sync.get({
    model: "gpt-4.1-mini",
    tone: "warm",
    businessProfile: "",
    signature: "",
    useBackend: true,
    backendUrl: "http://127.0.0.1:8000"
  });
  const local = await chrome.storage.local.get({ appApiToken: "" });

  if (!settings.useBackend || !settings.backendUrl) {
    throw new Error("Backend is disabled or missing a URL in extension settings.");
  }
  if (!local.appApiToken) {
    throw new Error("Please sign in from the extension settings page before generating drafts.");
  }

  const baseUrl = settings.backendUrl.replace(/\/+$/, "");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${local.appApiToken}`
  };

  console.info(LOG_PREFIX, "direct backend fetch", {
    url: `${baseUrl}/v1/draft-client-reply`,
    hasAuth: Boolean(local.appApiToken),
    contextChars: payload.context.length
  });

  const response = await fetch(`${baseUrl}/v1/draft-client-reply`, {
    method: "POST",
    headers: {
      ...headers,
      "X-Request-ID": "popup-direct",
      "X-Client-Version": chrome.runtime.getManifest().version
    },
    body: JSON.stringify({
      context: payload.context || "",
      intent: payload.intent || "Reply with next steps",
      tone: payload.tone || settings.tone || "warm",
      points: payload.points || "",
      relationship: payload.relationship || "",
      business_profile: settings.businessProfile || "",
      signature: settings.signature || "",
      model: settings.model || "gpt-4.1-mini",
      source_url: payload.sourceUrl || null
    })
  });

  const data = await response.json().catch(() => ({}));
  console.info(LOG_PREFIX, "direct backend response", {
    ok: response.ok,
    status: response.status,
    hasReply: Boolean(data.reply),
    detail: data.detail
  });

  if (!response.ok) throw new Error(data.detail || `Backend request failed (${response.status})`);
  if (!data.reply) throw new Error("The backend returned no draft text.");
  return data.reply.trim();
}
