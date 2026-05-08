# Client Message Assistant Backend

Python/FastAPI backend for the Chrome extension. The extension sends email context and drafting options here; this server calls OpenAI with a server-side API key and returns the draft.

## Local Setup

```bash
cd /Users/sherryli/ai-email/backend
uv sync
cp .env.example .env
```

Edit `.env` with your server-side `OPENAI_API_KEY`. `APP_API_TOKEN` is optional for manual API testing and local dev subscription updates.

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
4. Log in or create an account with email and password.
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
