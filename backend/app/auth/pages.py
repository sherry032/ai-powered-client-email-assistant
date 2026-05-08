from html import escape as html_escape


def pairing_page() -> str:
    return """
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Connect Client Message Assistant</title>
  </head>
  <body>
    <main>
      <h1>Connect your extension</h1>
      <p>This fallback creates a one-time pairing code.</p>
      <label>Email <input id="email" type="email" autocomplete="email"></label>
      <button id="create" type="button">Create pairing code</button>
      <p id="status"></p>
      <strong id="code"></strong>
    </main>
    <script>
      const email = document.querySelector("#email");
      const status = document.querySelector("#status");
      const code = document.querySelector("#code");
      document.querySelector("#create").addEventListener("click", async () => {
        status.textContent = "Creating code...";
        try {
          const response = await fetch("/v1/extension/pairing-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email.value.trim() })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.detail || "Could not create code.");
          code.textContent = data.code;
          status.textContent = "Code created.";
        } catch (error) {
          status.textContent = error.message || String(error);
        }
      });
    </script>
  </body>
</html>
"""


def auth_page(redirect_uri: str) -> str:
    safe_redirect = html_escape(redirect_uri)
    return f"""
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sign in to Client Message Assistant</title>
    <style>
      body {{
        margin: 0;
        color: #17212b;
        background: #f6f8fa;
        font: 16px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }}
      main {{
        width: min(560px, calc(100vw - 32px));
        margin: 64px auto;
        padding: 28px;
        border: 1px solid #d8dee4;
        border-radius: 8px;
        background: #fff;
      }}
      h1 {{ margin: 0 0 8px; color: #17324d; font-size: 28px; }}
      p {{ color: #5c6875; }}
      .mode {{ display: flex; gap: 8px; margin-top: 20px; }}
      .mode label {{ display: flex; align-items: center; gap: 6px; margin-top: 0; }}
      label {{ display: grid; gap: 8px; margin-top: 20px; font-weight: 750; }}
      input {{
        border: 1px solid #d8dee4;
        border-radius: 8px;
        padding: 12px;
        font: inherit;
      }}
      button {{
        margin-top: 16px;
        border: 0;
        border-radius: 8px;
        padding: 12px 16px;
        color: #fff;
        background: #17324d;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
      }}
      .google {{
        width: 100%;
        color: #17212b;
        background: #fff;
        border: 1px solid #d8dee4;
      }}
      .divider {{
        margin: 20px 0 4px;
        color: #7a8794;
        text-align: center;
      }}
      .error {{ color: #be4d32; }}
    </style>
  </head>
  <body>
    <main>
      <h1>Sign in</h1>
      <p>Log in or create an account to connect Client Message Assistant to this browser.</p>
      <button id="google" class="google" type="button">Continue with Google</button>
      <p class="divider">or use email</p>
      <div class="mode">
        <label><input name="mode" type="radio" value="login" checked> Log in</label>
        <label><input name="mode" type="radio" value="signup"> Create account</label>
      </div>
      <label>Email
        <input id="email" type="email" autocomplete="email" placeholder="you@example.com">
      </label>
      <label>Password
        <input id="password" type="password" autocomplete="current-password" placeholder="At least 8 characters">
      </label>
      <button id="connect" type="button">Connect extension</button>
      <p id="status"></p>
    </main>
    <script>
      const redirectUri = "{safe_redirect}";
      const google = document.querySelector("#google");
      const email = document.querySelector("#email");
      const password = document.querySelector("#password");
      const button = document.querySelector("#connect");
      const status = document.querySelector("#status");
      google.addEventListener("click", () => {{
        window.location.href = `/extension/auth/google/start?redirect_uri=${{encodeURIComponent(redirectUri)}}`;
      }});
      button.addEventListener("click", async () => {{
        status.textContent = "Connecting...";
        status.className = "";
        const mode = document.querySelector("input[name='mode']:checked").value;
        try {{
          const response = await fetch("/v1/extension/auth-token", {{
            method: "POST",
            headers: {{ "Content-Type": "application/json" }},
            body: JSON.stringify({{
              email: email.value.trim(),
              password: password.value,
              mode
            }})
          }});
          const data = await response.json();
          if (!response.ok) throw new Error(data.detail || "Could not sign in.");
          const params = new URLSearchParams({{
            token: data.token,
            email: data.user.email,
            user_id: data.user.id
          }});
          window.location.href = `${{redirectUri}}#${{params.toString()}}`;
        }} catch (error) {{
          status.textContent = error.message || String(error);
          status.className = "error";
        }}
      }});
    </script>
  </body>
</html>
"""
