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
  signOutButton: document.querySelector("#signOutButton"),
  model: document.querySelector("#model"),
  tone: document.querySelector("#tone"),
  businessProfile: document.querySelector("#businessProfile"),
  signature: document.querySelector("#signature"),
  saveButton: document.querySelector("#saveButton"),
  status: document.querySelector("#status")
};

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
  elements.status.textContent = "Opening sign-in...";

  try {
    const baseUrl = backendUrl.replace(/\/+$/, "");
    const redirectUri = chrome.identity.getRedirectURL("auth");
    const authUrl = `${baseUrl}/extension/auth?redirect_uri=${encodeURIComponent(redirectUri)}`;
    const callbackUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    });

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
    elements.status.textContent = error.message || String(error);
  }
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
