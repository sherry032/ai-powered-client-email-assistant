# Client Message Assistant Chrome Extension

A Manifest V3 Chrome extension prototype for independent professionals who need help writing clear client messages, follow-ups, boundaries, payment reminders, and project replies.

## What It Does

- Opens from the extension popup, a floating in-page assistant, a context menu, or `Alt+Shift+M`.
- Reads selected text or the currently focused message box as draft context.
- Generates a client-ready reply with a chosen goal, tone, relationship, and must-include points.
- Inserts the draft into textareas, standard inputs, and contenteditable editors.
- Works offline with a simple fallback draft, or uses the Python backend when configured in settings.

## Load It In Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `/Users/sherryli/ai-email/extension`.
5. Open the extension settings page and enable the backend if you want real AI drafts.

## Run The Python Backend

```bash
cd /Users/sherryli/ai-email/backend
uv sync
cp .env.example .env
```

Edit `backend/.env` and set:

- `OPENAI_API_KEY` - your server-side OpenAI API key.
- `APP_API_TOKEN` - optional dev token for manual API testing.
- `SESSION_SECRET_KEY` - a long random secret for OAuth session cookies.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` - optional, required for Google sign-in.

Run the API:

```bash
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Then open the extension settings:

- Enable **Use backend for drafts**.
- Set backend URL to `http://127.0.0.1:8000`.
- Click **Sign In / Create Account**.
- Continue with Google, or log in/create an account with email and password.
- Chrome returns to the extension automatically and stores the token.

## Files

- `web/` - React account, pricing, and subscription dashboard.
- `extension/manifest.json` - Chrome extension manifest.
- `extension/background.js` - Context menus, keyboard shortcut, and OpenAI/fallback drafting.
- `extension/content.js` - Floating assistant and insertion into message fields.
- `extension/popup.html`, `extension/popup.css`, `extension/popup.js` - Browser action popup.
- `extension/options.html`, `extension/options.css`, `extension/options.js` - User settings.
- `backend/app/main.py` - FastAPI backend with OpenAI proxying, auth, CORS, validation, and rate limiting.

## Run The React Web App

```bash
cd /Users/sherryli/ai-email/web
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. The web app expects the backend at `http://127.0.0.1:8000` by default.

## Production Notes

The extension should not store your OpenAI API key. The included backend keeps `OPENAI_API_KEY` server-side and uses Chrome's web auth flow to issue extension auth tokens.

The backend stores users, password hashes, extension tokens, subscription status, and usage events in SQLite. New signups receive a trial based on `SIGNUP_TRIAL_DAYS`; draft generation requires an `active` or `trialing` subscription. Before shipping, replace the dev subscription endpoint with Stripe or another billing provider, add token revocation UI, and meter usage per plan.

Chrome Extension
  -> opens your React web app for login/signup/billing
  -> receives extension token via Chrome Identity callback

React Web App
  -> signup/login
  -> pricing/checkout
  -> account/subscription dashboard

Python Backend
  -> auth API
  -> Stripe webhooks
  -> subscription checks
  -> OpenAI API calls
