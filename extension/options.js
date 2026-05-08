const DEFAULTS = {
  model: "gpt-4.1-mini",
  tone: "warm",
  businessProfile: "",
  signature: "",
  useBackend: true,
  backendUrl: "http://127.0.0.1:8000",
  appApiToken: ""
};

const elements = {
  useBackend: document.querySelector("#useBackend"),
  backendUrl: document.querySelector("#backendUrl"),
  authStatus: document.querySelector("#authStatus"),
  subscriptionStatus: document.querySelector("#subscriptionStatus"),
  signInButton: document.querySelector("#signInButton"),
  openAuthPageButton: document.querySelector("#openAuthPageButton"),
  signOutButton: document.querySelector("#signOutButton"),
  model: document.querySelector("#model"),
  tone: document.querySelector("#tone"),
  businessProfile: document.querySelector("#businessProfile"),
  signature: document.querySelector("#signature"),
  saveButton: document.querySelector("#saveButton"),
  status: document.querySelector("#status")
};

const LOG_PREFIX = "[CMA options]";

loadSettings();

elements.saveButton.addEventListener("click", async () => {
  await chrome.storage.sync.set({
    useBackend: elements.useBackend.checked,
    backendUrl: elements.backendUrl.value.trim() || DEFAULTS.backendUrl,
    model: elements.model.value.trim() || DEFAULTS.model,
    tone: elements.tone.value,
    businessProfile: elements.businessProfile.value.trim(),
    signature: elements.signature.value.trim()
  });

  elements.status.textContent = "Saved.";
  window.setTimeout(() => {
    elements.status.textContent = "";
  }, 1800);
});

elements.signInButton.addEventListener("click", async () => {
  const backendUrl = elements.backendUrl.value.trim() || DEFAULTS.backendUrl;
  await chrome.storage.sync.set({ backendUrl, useBackend: true });
  elements.status.textContent = "Checking backend...";
  elements.signInButton.disabled = true;

  try {
    const baseUrl = backendUrl.replace(/\/+$/, "");
    await checkBackendHealth(baseUrl);
    elements.status.textContent = "Opening Chrome sign-in window...";

    if (!chrome.identity?.getRedirectURL || !chrome.identity?.launchWebAuthFlow) {
      throw new Error("Chrome Identity is unavailable. Reload the extension after granting the identity permission.");
    }

    const redirectUri = chrome.identity.getRedirectURL("auth");
    const authUrl = `${baseUrl}/extension/auth?redirect_uri=${encodeURIComponent(redirectUri)}`;
    console.info(LOG_PREFIX, "starting auth flow", { authUrl, redirectUri });

    const callbackUrl = await launchWebAuthFlow({
      url: authUrl,
      interactive: true
    }, 120000);
    console.info(LOG_PREFIX, "auth callback received", { callbackUrl });

    const auth = parseAuthCallback(callbackUrl);
    await chrome.storage.local.set({
      appApiToken: auth.token,
      authUser: {
        id: auth.userId,
        email: auth.email
      }
    });
    await chrome.storage.sync.set({ backendUrl: baseUrl, useBackend: true });

    elements.authStatus.textContent = `Signed in as ${auth.email}.`;
    updateAuthButtons(true);
    await refreshSubscriptionStatus();
    elements.status.textContent = "Signed in.";
  } catch (error) {
    console.error(LOG_PREFIX, "sign-in failed", error);
    elements.status.textContent = error.message || String(error);
  } finally {
    elements.signInButton.disabled = false;
  }
});

elements.openAuthPageButton.addEventListener("click", async () => {
  const baseUrl = (elements.backendUrl.value.trim() || DEFAULTS.backendUrl).replace(/\/+$/, "");
  const url = `${baseUrl}/extension/auth?redirect_uri=${encodeURIComponent(chrome.identity.getRedirectURL("auth"))}`;
  await chrome.tabs.create({ url });
});

elements.signOutButton.addEventListener("click", async () => {
  await chrome.storage.local.remove(["appApiToken", "authUser"]);
  elements.authStatus.textContent = "Signed out.";
  elements.subscriptionStatus.textContent = "";
  updateAuthButtons(false);
});

async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  const local = await chrome.storage.local.get({ appApiToken: "", authUser: null });
  elements.useBackend.checked = Boolean(settings.useBackend);
  elements.backendUrl.value = settings.backendUrl || DEFAULTS.backendUrl;
  elements.model.value = settings.model || DEFAULTS.model;
  elements.tone.value = settings.tone || DEFAULTS.tone;
  elements.businessProfile.value = settings.businessProfile || "";
  elements.signature.value = settings.signature || "";
  elements.authStatus.textContent = local.authUser?.email
    ? `Signed in as ${local.authUser.email}.`
    : "Not signed in. Create an account to generate AI drafts.";
  updateAuthButtons(Boolean(local.authUser?.email));
  if (local.authUser?.email) refreshSubscriptionStatus();
}

function updateAuthButtons(isSignedIn) {
  elements.signInButton.hidden = isSignedIn;
  elements.openAuthPageButton.hidden = isSignedIn;
  elements.signOutButton.hidden = !isSignedIn;
}

function parseAuthCallback(callbackUrl) {
  if (!callbackUrl) throw new Error("Sign-in did not return a callback URL.");
  const url = new URL(callbackUrl);
  const params = new URLSearchParams(url.hash.replace(/^#/, "") || url.search.replace(/^\?/, ""));
  const token = params.get("token");
  const email = params.get("email");
  const userId = params.get("user_id");

  if (!token || !email || !userId) {
    throw new Error("Sign-in callback was missing auth details.");
  }

  return { token, email, userId };
}

function launchWebAuthFlow(details, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Sign-in timed out. If no window opened, use Open Auth Page to test the backend page."));
    }, timeoutMs);

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      fn(value);
    };

    try {
      const maybePromise = chrome.identity.launchWebAuthFlow(details, (callbackUrl) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          finish(reject, new Error(lastError.message));
          return;
        }
        finish(resolve, callbackUrl);
      });

      if (maybePromise?.then) {
        maybePromise.then((callbackUrl) => {
          finish(resolve, callbackUrl);
        }).catch((error) => {
          finish(reject, error);
        });
      }
    } catch (error) {
      finish(reject, error);
    }
  });
}

async function checkBackendHealth(baseUrl) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  let response;
  try {
    response = await fetch(`${baseUrl}/health`, { signal: controller.signal });
  } catch (error) {
    throw new Error(`Backend is not reachable at ${baseUrl}. Start the backend and try again.`);
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Backend health check failed (${response.status}).`);
  }
}

async function refreshSubscriptionStatus() {
  const settings = await chrome.storage.sync.get({ backendUrl: DEFAULTS.backendUrl });
  const local = await chrome.storage.local.get({ appApiToken: "" });
  if (!local.appApiToken) {
    elements.subscriptionStatus.textContent = "";
    return;
  }

  try {
    const baseUrl = (settings.backendUrl || DEFAULTS.backendUrl).replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/v1/subscription`, {
      headers: { Authorization: `Bearer ${local.appApiToken}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `Subscription check failed (${response.status}).`);

    const endDate = new Date(data.current_period_end * 1000).toLocaleDateString();
    elements.subscriptionStatus.textContent = data.is_valid
      ? `Subscription ${data.status} through ${endDate}.`
      : `Subscription ${data.status}; drafts are disabled.`;
  } catch (error) {
    elements.subscriptionStatus.textContent = error.message || String(error);
  }
}
