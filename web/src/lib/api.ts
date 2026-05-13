export function createApi(baseUrl: string, token: string) {
  const root = baseUrl.replace(/\/+$/, "");

  async function request<T>(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers);
    headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(`${root}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
    return data as T;
  }

  return {
    auth: (mode: AuthMode, email: string, password: string) =>
      request<AuthResponse>("/v1/extension/auth-token", {
        method: "POST",
        body: JSON.stringify({ mode, email, password })
      }),
    subscription: () => request<Subscription>("/v1/subscription"),
    checkout: (plan: PlanId) =>
      request<CheckoutResponse>("/v1/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan })
      })
  };
}
