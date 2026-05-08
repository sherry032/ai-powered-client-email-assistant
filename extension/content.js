let activeEditable = null;
let panel = null;
let fab = null;
const LOG_PREFIX = "[CMA content]";

document.addEventListener("focusin", (event) => {
  rememberEditable(event.target);
});

document.addEventListener("mousedown", (event) => {
  rememberEditable(event.target);
}, true);

document.addEventListener("input", (event) => {
  rememberEditable(event.target);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CMA_GET_CONTEXT") {
    const result = getEmailContextResult();
    console.info(LOG_PREFIX, "context requested", result.meta);
    sendResponse(result);
    return true;
  }

  if (message?.type === "CMA_INSERT_TEXT") {
    const ok = insertText(message.text || "");
    sendResponse({ ok });
    return true;
  }

  if (message?.type === "CMA_OPEN_ASSISTANT") {
    openPanel(message.selectedText || getEmailContext());
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

function ensureFab() {
  if (fab) return;
  fab = document.createElement("button");
  fab.className = "cma-fab";
  fab.type = "button";
  fab.title = "Open client message assistant";
  fab.textContent = "+";
  fab.addEventListener("click", () => openPanel(getEmailContext()));
  document.documentElement.appendChild(fab);
}

function openPanel(context = "") {
  ensurePanel();
  panel.hidden = false;
  panel.querySelector("[data-cma-context]").value = context || getEmailContext();
  panel.querySelector("[data-cma-result]").focus();
}

function ensurePanel() {
  if (panel) return;

  panel = document.createElement("aside");
  panel.className = "cma-inline-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="cma-inline-header">
      <p class="cma-inline-title">Client Message Assistant</p>
      <button class="cma-close" type="button" title="Close" aria-label="Close">x</button>
    </div>
    <div class="cma-inline-body">
      <label>Client message or context
        <textarea data-cma-context rows="5" placeholder="Paste or select the client message."></textarea>
      </label>
      <div class="cma-row">
        <label>Goal
          <select data-cma-intent>
            <option>Reply with next steps</option>
            <option>Ask for clarification</option>
            <option>Send a proposal follow-up</option>
            <option>Set a boundary</option>
            <option>Handle a delay</option>
            <option>Decline politely</option>
            <option>Request payment</option>
          </select>
        </label>
        <label>Tone
          <select data-cma-tone>
            <option value="warm">Warm</option>
            <option value="direct">Direct</option>
            <option value="polished">Polished</option>
            <option value="friendly">Friendly</option>
            <option value="firm">Firm</option>
          </select>
        </label>
      </div>
      <label>Must include
        <textarea data-cma-points rows="3" placeholder="Dates, deliverables, price, next step..."></textarea>
      </label>
      <label>Relationship
        <input data-cma-relationship type="text" placeholder="New lead, active client, overdue invoice...">
      </label>
      <div class="cma-actions">
        <button data-cma-generate class="cma-button" type="button">Generate Draft</button>
        <button data-cma-insert class="cma-button secondary" type="button" disabled>Insert</button>
      </div>
      <label>Draft
        <textarea data-cma-result rows="7" placeholder="Your draft will appear here."></textarea>
      </label>
      <p data-cma-status class="cma-status"></p>
    </div>
  `;

  panel.querySelector(".cma-close").addEventListener("click", () => {
    panel.hidden = true;
  });

  panel.querySelector("[data-cma-generate]").addEventListener("click", generateInlineDraft);
  panel.querySelector("[data-cma-insert]").addEventListener("click", () => {
    const text = panel.querySelector("[data-cma-result]").value.trim();
    const status = panel.querySelector("[data-cma-status]");
    if (!text) return;
    status.textContent = insertText(text) ? "Inserted." : "Click into a message box, then try again.";
  });

  chrome.storage.sync.get({ tone: "warm" }, (settings) => {
    panel.querySelector("[data-cma-tone]").value = settings.tone || "warm";
  });

  document.documentElement.appendChild(panel);
}

async function generateInlineDraft() {
  const generateButton = panel.querySelector("[data-cma-generate]");
  const insertButton = panel.querySelector("[data-cma-insert]");
  const status = panel.querySelector("[data-cma-status]");
  const result = panel.querySelector("[data-cma-result]");

  generateButton.disabled = true;
  generateButton.textContent = "Generating...";
  insertButton.disabled = true;
  status.textContent = "Drafting...";
  console.info(LOG_PREFIX, "inline generate clicked", {
    contextChars: panel.querySelector("[data-cma-context]").value.length,
    sourceUrl: location.href
  });

  try {
    const response = await chrome.runtime.sendMessage({
      type: "CMA_GENERATE_REPLY",
      payload: {
        context: panel.querySelector("[data-cma-context]").value.trim(),
        intent: panel.querySelector("[data-cma-intent]").value,
        tone: panel.querySelector("[data-cma-tone]").value,
        points: panel.querySelector("[data-cma-points]").value.trim(),
        relationship: panel.querySelector("[data-cma-relationship]").value.trim(),
        sourceUrl: location.href
      }
    });

    if (!response?.ok) throw new Error(response?.error || "Could not generate a draft.");
    console.info(LOG_PREFIX, "inline generate response ok", {
      replyChars: response.reply?.length || 0,
      source: response.source,
      requestId: response.requestId,
      status: response.status
    });
    result.value = response.reply;
    insertButton.disabled = !response.reply;
    status.textContent = response.source === "backend"
      ? `Draft ready from backend (${response.requestId}).`
      : "Draft ready.";
  } catch (error) {
    console.error(LOG_PREFIX, "inline generate failed", error);
    status.textContent = error.message || String(error);
  } finally {
    generateButton.disabled = false;
    generateButton.textContent = "Generate Draft";
  }
}

function findEditable(node) {
  if (!(node instanceof Element)) return null;
  return node.closest([
    "textarea",
    "input[type='text']",
    "input[type='email']",
    "input[type='search']",
    "input:not([type])",
    "[contenteditable]:not([contenteditable='false'])",
    "[role='textbox']",
    "[aria-multiline='true']"
  ].join(", "));
}

function insertText(text) {
  const target = getInsertTarget();
  if (!target || !text) return false;

  target.focus();

  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    target.setRangeText(text, start, end, "end");
    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (isRichTextEditable(target)) {
    const before = target.innerText;
    restoreEditableSelection(target);
    const inserted = document.execCommand("insertText", false, text);
    if (!inserted || target.innerText === before) {
      insertTextWithRange(target, text);
    }
    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    return true;
  }

  return false;
}

function rememberEditable(node) {
  if (panel?.contains(node)) return;
  const editable = findEditable(node);
  if (!editable || !isUsableEditable(editable)) return;
  activeEditable = editable;
  ensureFab();
}

function getInsertTarget() {
  if (isUsableEditable(activeEditable)) return activeEditable;

  const focused = findEditable(document.activeElement);
  if (isUsableEditable(focused)) return focused;

  const gmailCompose = document.querySelector([
    "div[role='textbox'][aria-label='Message Body']",
    "div[role='textbox'][g_editable='true']",
    "div[aria-label='Message Body'][contenteditable='true']",
    "div[aria-label='Message Body'][contenteditable='plaintext-only']"
  ].join(", "));
  if (isUsableEditable(gmailCompose)) return gmailCompose;

  const visibleEditable = Array.from(document.querySelectorAll([
    "textarea",
    "input[type='text']",
    "input[type='email']",
    "[contenteditable]:not([contenteditable='false'])",
    "[role='textbox']"
  ].join(", "))).find(isUsableEditable);

  return visibleEditable || null;
}

function isUsableEditable(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest(".cma-inline-panel")) return false;
  if (target.hasAttribute("disabled") || target.getAttribute("aria-disabled") === "true") return false;

  const style = window.getComputedStyle(target);
  if (style.display === "none" || style.visibility === "hidden") return false;

  const rect = target.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;

  return target.isContentEditable
    || target.getAttribute("contenteditable") === "plaintext-only"
    || target.getAttribute("role") === "textbox"
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLInputElement;
}

function isRichTextEditable(target) {
  return target.isContentEditable
    || target.getAttribute("contenteditable") === "plaintext-only"
    || target.getAttribute("role") === "textbox";
}

function restoreEditableSelection(target) {
  const selection = window.getSelection();
  const existingRange = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
  if (existingRange && target.contains(existingRange.commonAncestorContainer)) return;

  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function insertTextWithRange(target, text) {
  const selection = window.getSelection();
  const range = selection && selection.rangeCount ? selection.getRangeAt(0) : document.createRange();
  if (!target.contains(range.commonAncestorContainer)) {
    range.selectNodeContents(target);
    range.collapse(false);
  }

  range.deleteContents();
  const fragment = document.createDocumentFragment();
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (index > 0) fragment.appendChild(document.createElement("br"));
    fragment.appendChild(document.createTextNode(line));
  });
  range.insertNode(fragment);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function getSelectedOrNearbyText() {
  return getEmailContext();
}

function getEmailContext() {
  return getEmailContextResult().context;
}

function getEmailContextResult() {
  const selected = normalizeText(window.getSelection()?.toString() || "");
  if (selected) return contextResult(selected, "selection");

  const gmailContext = getGmailThreadContext();
  if (gmailContext) return contextResult(gmailContext, "gmail-thread");

  const visibleMessages = getVisibleMessageContext();
  if (visibleMessages) return contextResult(visibleMessages, "visible-messages");

  if (activeEditable) {
    const nearby = getNearbyConversationText(activeEditable);
    if (nearby) return contextResult(nearby, "nearby-editable");
    const value = normalizeText(getEditableText(activeEditable));
    if (value) return contextResult(value, "active-editable");
  }

  const candidates = [
    "[data-message-id]",
    "[role='main']",
    "main",
    ".gmail_quote",
    "article"
  ];

  for (const selector of candidates) {
    const element = document.querySelector(selector);
    const text = getCleanElementText(element);
    if (text && text.length > 20) return contextResult(text, `fallback:${selector}`);
  }

  return contextResult("", "none");
}

function getGmailThreadContext() {
  if (!/mail\.google\.com$/.test(location.hostname)) return "";

  const subject = getGmailSubject();
  const bodyMessages = getGmailBodyMessages();
  if (bodyMessages.length) {
    return [subject ? `Subject: ${subject}` : "", ...bodyMessages.slice(-8)]
      .filter(Boolean)
      .join("\n\n---\n\n");
  }

  const messageSelectors = ["div[data-message-id]", "div.adn.ads", "div[role='listitem']"];
  const messages = uniqueElements(messageSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))))
    .filter(isVisibleElement)
    .map((element) => extractMessageBlock(element))
    .filter((text) => text.length > 30);

  const limitedMessages = messages.slice(-8);
  return [subject ? `Subject: ${subject}` : "", ...limitedMessages].filter(Boolean).join("\n\n---\n\n");
}

function getGmailSubject() {
  const subjectSelectors = [
    "h2.hP",
    "h2[data-thread-perm-id]",
    "[data-thread-perm-id] h2",
    "[role='main'] h2"
  ];

  for (const selector of subjectSelectors) {
    const text = normalizeText(document.querySelector(selector)?.innerText || "");
    if (text && text.toLowerCase() !== "gmail") return text;
  }

  return "";
}

function getGmailBodyMessages() {
  const bodySelectors = [
    "div[data-message-id] div.a3s",
    "div.adn.ads div.a3s",
    "div.a3s.aiL",
    "div.a3s"
  ];

  const bodies = uniqueElements(bodySelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))))
    .filter(isVisibleElement)
    .filter((element) => !element.closest(".cma-inline-panel"))
    .map((body) => {
      const container = body.closest("div[data-message-id], div.adn.ads, div[role='listitem'], div.gs") || body;
      const sender = normalizeText(container.querySelector(".gD")?.getAttribute("email")
        || container.querySelector(".gD")?.innerText
        || container.querySelector("[email]")?.getAttribute("email")
        || "");
      const date = normalizeText(container.querySelector(".g3")?.getAttribute("title")
        || container.querySelector(".g3")?.innerText
        || "");
      const bodyText = extractGmailBodyText(body);
      return [
        sender ? `From: ${sender}` : "",
        date ? `Date: ${date}` : "",
        bodyText
      ].filter(Boolean).join("\n");
    })
    .filter((text) => text.length > 25);

  return Array.from(new Set(bodies));
}

function extractGmailBodyText(body) {
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

  return normalizeText(clone.innerText || clone.textContent || "");
}

function getVisibleMessageContext() {
  const selectors = [
    "article",
    "[data-message-id]",
    "[role='article']",
    "[role='listitem']",
    ".message",
    ".email",
    ".thread"
  ];

  const blocks = uniqueElements(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))))
    .filter(isVisibleElement)
    .filter((element) => !element.closest(".cma-inline-panel"))
    .map((element) => extractMessageBlock(element))
    .filter((text) => text.length > 40)
    .slice(-6);

  return blocks.join("\n\n---\n\n");
}

function getNearbyConversationText(editable) {
  const containers = [
    editable.closest("[role='dialog']"),
    editable.closest("[role='main']"),
    editable.closest("main"),
    editable.closest("article"),
    document.querySelector("[role='main']")
  ].filter(Boolean);

  for (const container of containers) {
    const text = getCleanElementText(container);
    if (text && text.length > 40) return text;
  }

  return "";
}

function extractMessageBlock(element) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll([
    ".cma-inline-panel",
    ".cma-fab",
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

  return normalizeText(clone.innerText || clone.textContent || "");
}

function getCleanElementText(element) {
  if (!element) return "";
  return extractMessageBlock(element);
}

function normalizeText(text) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function limitContext(text) {
  const normalized = normalizeText(text);
  if (normalized.length <= 6000) return normalized;
  return normalized.slice(normalized.length - 6000).replace(/^[^\n]*\n?/, "").trim();
}

function isVisibleElement(element) {
  if (!(element instanceof Element)) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function uniqueElements(elements) {
  return Array.from(new Set(elements));
}

function contextResult(text, source) {
  const context = limitContext(text);
  return {
    context,
    meta: {
      source,
      chars: context.length,
      hostname: location.hostname,
      gmailBodies: /mail\.google\.com$/.test(location.hostname) ? document.querySelectorAll("div.a3s").length : 0,
      gmailMessages: /mail\.google\.com$/.test(location.hostname) ? document.querySelectorAll("div[data-message-id]").length : 0
    }
  };
}

function getEditableText(target) {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) return target.value.trim();
  if (target.isContentEditable) return target.innerText.trim();
  return "";
}
