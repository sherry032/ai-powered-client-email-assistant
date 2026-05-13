# Client Message Assistant Backend

Python/FastAPI backend for the Chrome extension. The extension sends email context and drafting options here; this server calls OpenAI with a server-side API key and returns the draft.

## Local Setup

```bash
cd /Users/sherryli/ai-email/backend
uv sync
cp .env.example .env
```

Edit `.env` with your server-side `OPENAI_API_KEY`. `APP_API_TOKEN` is optional for manual API testing and local dev subscription updates.

For the local React app, keep both browser dev origins in `ALLOWED_ORIGINS`:

```text
ALLOWED_ORIGINS=chrome-extension://*,http://localhost:*,http://127.0.0.1:*
```

For Google sign-in, also set:

- `SESSION_SECRET_KEY` - a long random secret used by the OAuth session cookie.
- `GOOGLE_CLIENT_ID` - Google OAuth web client ID.
- `GOOGLE_CLIENT_SECRET` - Google OAuth web client secret.

In Google Cloud Console, add this backend callback URL to your OAuth web client:

```text
http://127.0.0.1:8000/extension/auth/google/callback
```

Run:

```bash
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

Connect the extension:

1. Open the Chrome extension settings.
2. Set backend URL to `http://127.0.0.1:8000`.
3. Click **Sign In / Create Account**.
4. Continue with Google, or log in/create an account with email and password.
5. Chrome returns to the extension automatically and stores the token.

The older pairing-code page is still available at `http://127.0.0.1:8000/extension/connect` as a fallback.

Draft endpoint:

```bash
curl http://127.0.0.1:8000/v1/draft-client-reply \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer replace-with-a-random-token-for-the-extension" \
  -d '{
    "context": "Client asks if the project can be done by Friday.",
    "intent": "Reply with next steps",
    "tone": "warm",
    "points": "Confirm Friday is possible if feedback arrives by Wednesday."
  }'
```

Mock checkout endpoint:

```bash
curl http://127.0.0.1:8000/v1/billing/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-extension-token" \
  -d '{"plan": "solo"}'
```

Dev subscription update:

```bash
curl http://127.0.0.1:8000/dev/subscription \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer replace-with-a-random-token-for-the-extension" \
  -d '{
    "email": "you@example.com",
    "status": "active",
    "days": 30
  }'
```

## Production Notes

- Keep `OPENAI_API_KEY` only on the server.
- Users, password hashes, extension tokens, subscription status, and usage events are stored in SQLite for this MVP.
- Move auth/subscription state to your production database when you deploy.
- Replace the dev subscription endpoint with Stripe or another billing provider webhook.
- Add token revocation UI.
- Store usage per user for billing and plan limits.
- Avoid storing raw email content unless the user explicitly opts in.

## Backend Structure

- `app/main.py` - FastAPI app assembly, middleware, and router registration.
- `app/core/config.py` - Environment-backed settings.
- `app/core/database.py` - SQLAlchemy engine, sessions, ORM models, and schema initialization.
- `app/auth/models.py` - Reusable auth and subscription request/response models.
- `app/auth/security.py` - Password and token hashing helpers.
- `app/auth/service.py` - Reusable SQLAlchemy-backed auth, token, subscription, and usage service functions.
- `app/auth/routes.py` - Reusable auth routes for Chrome extension sign-in and subscription status.
- `app/auth/pages.py` - Minimal auth HTML pages for the current MVP.
- `app/client_messages/routes.py` - App-specific client message reply generation routes and OpenAI calls.
- `app/billing/routes.py` - Billing checkout and portal routes for the MVP.

To reuse auth in another FastAPI app, copy `app/auth` plus `app/core/config.py` and `app/core/database.py`, then include `app.auth.routes.router` and use `Depends(app.auth.service.require_auth)` to protect routes.
