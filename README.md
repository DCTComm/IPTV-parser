# PayPal Email Parser

Polls **Zoho Mail** for PayPal emails, classifies them into known templates, extracts fields, and appends rows to **Zoho Sheet**.

## Setup

1. Create a **Server-based Application** in the [Zoho API Console](https://api-console.zoho.com/)
2. Redirect URI: `http://localhost:3000/oauth/callback`
3. Scopes: `ZohoMail.messages.ALL`, `ZohoMail.accounts.READ`, `ZohoMail.tags.ALL`, `ZohoSheet.dataAPI.READ`, `ZohoSheet.dataAPI.UPDATE`
4. Create a Zoho Sheet and copy the resource ID from the URL into `.env`

```bash
npm install
copy .env.example .env
# edit .env with your credentials
npm run auth
npm run setup-sheets
```

## Usage

```bash
npm start                      # poll once (default: last 1 day)
npm start -- --days 7          # last 7 days
npm run poll                   # continuous polling
npm start -- --dry-run --days 7
```

## Deploying to Coolify

OAuth can't run in a container — there's no browser and no reachable
`localhost:3000`. Authorize locally once, then pass the refresh token as an
env var. The app bootstraps from it and refreshes access tokens on its own.

```bash
npm run auth                  # local, one time
npm run show-refresh-token    # copy the value it prints
```

In Coolify:

1. Point the app at this repo — the `Dockerfile` is picked up automatically.
   No start command needed; the image already runs `--loop`.
2. Set environment variables — same as `.env`, plus `ZOHO_REFRESH_TOKEN`.
   Do **not** upload `.env` or `token.json`.
3. Deploy. Healthy logs read `No new messages.` every `POLL_INTERVAL_SECONDS`.

`token.json` is not needed in the container. If `ZOHO_REFRESH_TOKEN` is missing
the app exits immediately with a message saying so, rather than hanging on a
login prompt nobody can answer.

Watch the Coolify logs for two lines. `error: <subject> -> ...` means one email
failed and the rest of the batch continued; it retries next cycle. `cycle
failed: ...` means an entire cycle died (network, token, Zoho outage) and the
poller kept running. Neither stops the service — if either repeats every cycle,
something needs attention.

To revoke access, delete the client in the Zoho API Console; the refresh token
dies with it.

## Project layout

```
src/                 # app code
scripts/auth.js      # OAuth login
scripts/setupSheets.js
.env.example
```

Do not commit `.env` or `token.json`.
