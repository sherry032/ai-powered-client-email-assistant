const DEFAULTS = {
  model: "gpt-4.1-mini",
  tone: "warm",
  businessProfile: "",
  signature: "",
  useBackend: true,
  backendUrl: "http://127.0.0.1:8000",
  appApiToken: ""
};

const LOG_PREFIX = "[CMA background]";

chrome.runtime.onInstalled.addListener(async () => {
  console.info(LOG_PREFIX, "installed/updated; initializing defaults");
  chrome.contextMenus.create({
    id: "draft-client-reply",
    title: "Draft client reply",
    contexts: ["editable", "selection"]
  });

  await chrome.storage.sync.set({
    useBackend: true,
    backendUrl: DEFAULTS.backendUrl
  });
  console.info(LOG_PREFIX, "backend defaults saved", { backendUrl: DEFAULTS.backendUrl });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, {
    type: "CMA_OPEN_ASSISTANT",
    selectedText: info.selectionText || ""
  });
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "open-assistant" || !tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "CMA_OPEN_ASSISTANT" });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.info(LOG_PREFIX, "message received", {
    type: message?.type,
    tabId: sender.tab?.id,
    url: sender.tab?.url
  });

  if (message?.type === "CMA_GENERATE_REPLY") {
    generateReply(message.payload)
      .then((result) => {
        console.info(LOG_PREFIX, "reply generated", {
          chars: result.reply.length,
          source: result.source,
          requestId: result.requestId
        });
        sendResponse({ ok: true, ...result });
      })
      .catch((error) => {
        console.error(LOG_PREFIX, "generate failed", error);
        sendResponse({ ok: false, error: error.message || String(error) });
      });
    return true;
  }

  if (message?.type === "CMA_DEBUG_STATE") {
    getSettings()
      .then((settings) => sendResponse({
        ok: true,
        version: chrome.runtime.getManifest().version,
        useBackend: settings.useBackend,
        backendUrl: settings.backendUrl,
        hasAppApiToken: Boolean(settings.appApiToken)
      }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (message?.type === "CMA_COLLECT_CONTEXT") {
    collectContextFromTab(message.tabId)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => {
        console.error(LOG_PREFIX, "context collection failed", error);
        sendResponse({ ok: false, error: error.message || String(error) });
      });
    return true;
  }

  if (message?.type === "CMA_INSERT_REPLY" && sender.tab?.id) {
    chrome.tabs.sendMessage(sender.tab.id, {
      type: "CMA_INSERT_TEXT",
      text: message.text
    });
    sendResponse({ ok: true });
  }

  return false;
});

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  const local = await chrome.storage.local.get({ appApiToken: "", authUser: null });
  const settings = { ...DEFAULTS, ...stored, appApiToken: local.appApiToken, authUser: local.authUser };
  console.info(LOG_PREFIX, "settings loaded", {
    useBackend: settings.useBackend,
    backendUrl: settings.backendUrl,
    hasAppApiToken: Boolean(settings.appApiToken),
    model: settings.model,
    tone: settings.tone
  });
  return settings;
}

async function generateReply(payload) {
  const settings = await getSettings();
  console.info(LOG_PREFIX, "generate requested", {
    useBackend: settings.useBackend,
    hasBackendUrl: Boolean(settings.backendUrl),
    contextChars: payload?.context?.length || 0,
    intent: payload?.intent,
    sourceUrl: payload?.sourceUrl
  });

  if (settings.useBackend && settings.backendUrl) {
    return callBackend(payload, settings);
  }

  console.error(LOG_PREFIX, "backend disabled or missing URL; refusing silent fallback", {
    useBackend: settings.useBackend,
    backendUrl: settings.backendUrl
  });
  throw new Error("Backend is disabled or missing a URL. Open extension settings, enable backend drafts, save, then reload the extension.");
}

async function callBackend(payload, settings) {
  const baseUrl = settings.backendUrl.replace(/\/+$/, "");
  const headers = { "Content-Type": "application/json" };
  if (!settings.appApiToken) {
    throw new Error("Please sign in from the extension settings page before generating drafts.");
  }
  headers.Authorization = `Bearer ${settings.appApiToken}`;
  const requestId = crypto.randomUUID();
  const url = `${baseUrl}/v1/draft-client-reply`;
  const body = {
    context: payload.context || "",
    intent: payload.intent || "Reply with next steps",
    tone: payload.tone || settings.tone || DEFAULTS.tone,
    points: payload.points || "",
    relationship: payload.relationship || "",
    business_profile: settings.businessProfile || "",
    signature: settings.signature || "",
    model: settings.model || DEFAULTS.model,
    source_url: payload.sourceUrl || null
  };

  console.info(LOG_PREFIX, "calling backend", {
    requestId,
    url,
    hasAuth: Boolean(headers.Authorization),
    contextChars: body.context.length,
    model: body.model
  });

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        "X-Request-ID": requestId,
        "X-Client-Version": chrome.runtime.getManifest().version
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    console.error(LOG_PREFIX, "backend fetch threw before response", {
      requestId,
      url,
      error: error.message || String(error)
    });
    throw error;
  }

  const data = await response.json().catch(() => ({}));
  console.info(LOG_PREFIX, "backend responded", {
    requestId,
    ok: response.ok,
    status: response.status,
    hasReply: Boolean(data.reply),
    detail: data.detail
  });

  if (!response.ok) {
    const detail = data?.detail || `Backend request failed (${response.status})`;
    throw new Error(detail);
  }

  if (!data.reply) throw new Error("The backend returned no draft text.");
  return {
    reply: data.reply.trim(),
    source: "backend",
    requestId,
    status: response.status
  };
}

function fallbackDraft(payload, settings) {
  const greeting = payload.relationship?.toLowerCase().includes("new") ? "Hi there," : "Hi,";
  const points = payload.points?.trim();
  const context = payload.context?.trim();
  const intent = payload.intent || "respond";
  const signature = settings.signature ? `\n\n${settings.signature}` : "";

  return [
    greeting,
    "",
    `Thanks for your message. I wanted to ${intent.toLowerCase()} with a clear next step.`,
    points ? `\n${points}` : "",
    context && !points ? "\nI have the context from your note and can move this forward." : "",
    "\nPlease let me know if that works for you.",
    signature
  ].join("").replace(/\n{3,}/g, "\n\n").trim();
}

async function collectContextFromTab(tabId) {
  if (!tabId) throw new Error("No active tab id available for context collection.");

  const frames = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: collectEmailContextInPage
  });

  const candidates = frames
    .map((frame) => ({ frameId: frame.frameId, ...(frame.result || {}) }))
    .filter((result) => result.context);

  const best = candidates.sort((a, b) => {
    const scoreA = contextScore(a);
    const scoreB = contextScore(b);
    return scoreB - scoreA;
  })[0] || {
    context: "",
    meta: { source: "none", chars: 0 }
  };

  console.info(LOG_PREFIX, "context collected", {
    frameCount: frames.length,
    candidateCount: candidates.length,
    bestMeta: best.meta
  });

  return best;
}

function contextScore(result) {
  const sourceBonus = {
    "gmail-opened-message": 10000,
    "gmail-thread": 8000,
    "selection": 7000,
    "visible-message": 4000,
    "main": 1000
  }[result.meta?.source] || 0;
  return sourceBonus + (result.context?.length || 0);
}

function collectEmailContextInPage() {
  const hostname = location.hostname;

  const selected = cleanText(window.getSelection()?.toString() || "");
  if (selected) return makeResult(selected, "selection");

  if (/mail\.google\.com$/.test(hostname)) {
    const gmail = collectGmailContext();
    if (gmail.context) return gmail;
  }

  const generic = collectGenericEmailContext();
  if (generic.context) return generic;

  return makeResult("", "none");

  function collectGmailContext() {
    const subject = firstText([
      "h2.hP",
      "h2[data-thread-perm-id]",
      "[data-thread-perm-id] h2",
      "[role='main'] h2"
    ]);

    const openedBodies = uniqueElements([
      ...document.querySelectorAll("div[data-message-id] div.a3s"),
      ...document.querySelectorAll("div.adn.ads div.a3s"),
      ...document.querySelectorAll("div.a3s.aiL"),
      ...document.querySelectorAll("div.a3s")
    ])
      .filter(isVisible)
      .map((body) => formatGmailMessage(body))
      .filter((text) => text.length > 20);

    if (openedBodies.length) {
      return makeResult(
        [subject ? `Subject: ${subject}` : "", ...openedBodies.slice(-8)].filter(Boolean).join("\n\n---\n\n"),
        "gmail-opened-message",
        {
          gmailBodies: document.querySelectorAll("div.a3s").length,
          gmailMessages: document.querySelectorAll("div[data-message-id]").length
        }
      );
    }

    const threadBlocks = uniqueElements([
      ...document.querySelectorAll("div[data-message-id]"),
      ...document.querySelectorAll("div.adn.ads"),
      ...document.querySelectorAll("div[role='listitem']")
    ])
      .filter(isVisible)
      .map((block) => cleanElementText(block))
      .filter((text) => text.length > 40)
      .slice(-8);

    return makeResult(
      [subject ? `Subject: ${subject}` : "", ...threadBlocks].filter(Boolean).join("\n\n---\n\n"),
      "gmail-thread",
      {
        gmailBodies: document.querySelectorAll("div.a3s").length,
        gmailMessages: document.querySelectorAll("div[data-message-id]").length
      }
    );
  }

  function formatGmailMessage(body) {
    const container = body.closest("div[data-message-id], div.adn.ads, div[role='listitem'], div.gs") || body;
    const sender = cleanText(
      container.querySelector(".gD")?.getAttribute("email")
      || container.querySelector(".gD")?.innerText
      || container.querySelector("[email]")?.getAttribute("email")
      || ""
    );
    const date = cleanText(
      container.querySelector(".g3")?.getAttribute("title")
      || container.querySelector(".g3")?.innerText
      || ""
    );
    const bodyText = cleanGmailBody(body);
    return [sender ? `From: ${sender}` : "", date ? `Date: ${date}` : "", bodyText]
      .filter(Boolean)
      .join("\n");
  }

  function cleanGmailBody(body) {
    const clone = body.cloneNode(true);
    clone.querySelectorAll([
      ".gmail_quote",
      ".gmail_extra",
      ".yj6qo",
      ".adL",
      "blockquote",
      "style",
      "script",
      "noscript"
    ].join(", ")).forEach((node) => node.remove());
    return cleanText(clone.innerText || clone.textContent || "");
  }

  function collectGenericEmailContext() {
    const blocks = uniqueElements([
      ...document.querySelectorAll("article"),
      ...document.querySelectorAll("[data-message-id]"),
      ...document.querySelectorAll("[role='article']"),
      ...document.querySelectorAll("[role='listitem']"),
      ...document.querySelectorAll(".message"),
      ...document.querySelectorAll(".email"),
      ...document.querySelectorAll(".thread")
    ])
      .filter(isVisible)
      .map((block) => cleanElementText(block))
      .filter((text) => text.length > 40)
      .slice(-8);

    if (blocks.length) return makeResult(blocks.join("\n\n---\n\n"), "visible-message");

    const main = cleanElementText(document.querySelector("[role='main'], main"));
    return makeResult(main, "main");
  }

  function cleanElementText(element) {
    if (!element) return "";
    const clone = element.cloneNode(true);
    clone.querySelectorAll([
      "textarea",
      "input",
      "select",
      "button",
      "[contenteditable='true']",
      "[contenteditable='plaintext-only']",
      "[role='textbox']",
      "[aria-label='Message Body']",
      ".gmail_quote",
      "blockquote",
      "style",
      "script",
      "noscript"
    ].join(", ")).forEach((node) => node.remove());
    return cleanText(clone.innerText || clone.textContent || "");
  }

  function firstText(selectors) {
    for (const selector of selectors) {
      const text = cleanText(document.querySelector(selector)?.innerText || "");
      if (text && text.toLowerCase() !== "gmail") return text;
    }
    return "";
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function uniqueElements(elements) {
    return Array.from(new Set(elements));
  }

  function cleanText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function limitText(text) {
    const cleaned = cleanText(text);
    if (cleaned.length <= 6000) return cleaned;
    return cleaned.slice(cleaned.length - 6000).replace(/^[^\n]*\n?/, "").trim();
  }

  function makeResult(text, source, extraMeta = {}) {
    const context = limitText(text);
    return {
      context,
      meta: {
        source,
        chars: context.length,
        hostname,
        url: location.href,
        ...extraMeta
      }
    };
  }
}
