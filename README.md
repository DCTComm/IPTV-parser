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

## Project layout

```
src/                 # app code
scripts/auth.js      # OAuth login
scripts/setupSheets.js
.env.example
```

Do not commit `.env` or `token.json`.
