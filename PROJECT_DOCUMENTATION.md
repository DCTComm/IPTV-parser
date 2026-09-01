# Technical Project Documentation: IPTV-parser (PayPal Email Parser)

> **Document Version:** 1.0.0  
> **Last Updated:** 2026-09-01  
> **Repository:** `IPTV-parser`  
> **Target Environment:** Node.js (>=18), Standalone Daemon / Containerized (Docker / Coolify)

---

## 1. Project Overview

The **PayPal Email Parser** (`IPTV-parser`) is an automated backend integration service built in Node.js. Its primary mission is to continuously monitor a dedicated **Zoho Mail** inbox for transaction, invoice, and dispute notifications sent by PayPal (`service@paypal.com`), extract structured financial and operational data, and append records directly to a centralized **Zoho Sheet** workbook with automated routing to dedicated sub-worksheets.

### Key Capabilities
- **Automated Zoho Mail Polling**: Periodically queries Zoho Mail REST APIs for unread PayPal notification emails within a configurable lookback window.
- **HTML & Text Normalization**: Cleans and strips styling, scripts, and whitespace from rich HTML emails using Cheerio.
- **Rule-Based Template Classifier**: Accurately classifies emails into 10 discrete transaction and dispute categories.
- **Deterministic Field Extraction**: Extracts transaction IDs, invoice numbers, monetary amounts, currency codes, customer details, chargeback fees, and deadlines via regex parsers.
- **In-Memory & Sheet Deduplication**: Prevents duplicate entries using composite keys generated per transaction, invoice, or case ID.
- **Worksheet Routing**: Automatically appends all events to a master ledger (`Sheet1`) while copying invoice creation events to `Sent` and payment events to `Paid`.
- **Read / Label Flagging**: Marks parsed emails as read in Zoho Mail and assigns a persistent tag (`paypal-parsed`) to prevent redundant ingestion.

### Technologies & External Services
- **Runtime**: Node.js (ES Modules, `>=18`)
- **Dependencies**: `cheerio` (v1.0.0) for HTML parsing, `dotenv` (v16.4.7) for environment variable loading.
- **Zoho APIs**:
  - **Zoho Accounts (OAuth 2.0)**: Access token generation and token refresh cycles.
  - **Zoho Mail REST API**: Account discovery, message search, folder content fetching, mark-as-read, and tag assignment.
  - **Zoho Sheet Data API v2**: Worksheet creation, schema validation, CSV record appending, and duplicate verification.

---

## 2. Project Architecture

The service operates on a unidirectional pipeline architecture:

```
┌──────────────────────────────────────────────────────────────┐
│                     PayPal Notification                      │
│                  (from: service@paypal.com)                  │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                          Zoho Mail                           │
│     (Folder Search: sender:service@paypal.com - unread)      │
└──────────────────────────────┬───────────────────────────────┘
                               │  Zoho Mail REST API
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                    Mail Ingestion Module                     │
│                  (src/mailClient.js)                         │
│  - Fetches HTML / Plaintext payload                          │
│  - Strips HTML tags & normalizes text (src/normalize.js)     │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                  Email Classifier Module                     │
│                  (src/classifier.js)                         │
│  - Evaluates subject & body regex rules                      │
│  - Identifies template: invoice_sent, invoice_paid, etc.     │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                    Parser Engine Modules                     │
│                  (src/parsers/*.js)                          │
│  - Extracts amounts, currency, dates, IDs, customer info     │
│  - Assembles normalized row object                           │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                 Deduplication & Cache Engine                 │
│                  (src/sheetsClient.js)                       │
│  - Evaluates duplicateKey(row) against Sheet1 records        │
│  - Skips already-logged records                              │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                 Zoho Sheet Data API v2 Writer                │
│                  (src/sheetsClient.js)                       │
│  - Appends row to Master Worksheet (Sheet1)                  │
│  - Evaluates EXTRA_WORKSHEETS_BY_EMAIL_TYPE                  │
│  - Copies to 'Sent' (if invoice_sent) or 'Paid' (if paid)    │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                   Post-Processing Action                     │
│                  (src/mailClient.js)                         │
│  - Marks email as read in Zoho Mail                          │
│  - Assigns 'paypal-parsed' label / tag to email              │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Complete Folder Structure

```
IPTV-parser/
├── .dockerignore                 # Excludes local files from container builds
├── .env                          # Local environment variables (DO NOT COMMIT)
├── .env.example                  # Template configuration file with placeholder keys
├── .gitignore                    # Git exclusion rules (node_modules, .env, token.json)
├── Dockerfile                    # Production container image definition (Node 20 Alpine)
├── package-lock.json             # NPM lockfile for deterministic dependency trees
├── package.json                  # Manifest, dependencies, and CLI script definitions
├── PROJECT_DOCUMENTATION.md      # Complete system architecture and developer documentation
├── README.md                     # High-level overview and Coolify deployment notes
├── scripts/
│   ├── auth.js                   # Interactive OAuth 2.0 authorization trigger
│   ├── setupSheets.js            # Worksheet initialization & column header setter
│   └── showRefreshToken.js      # Utility to print refresh token for headless deployments
└── src/
    ├── classifier.js             # Rule engine mapping email text to template types
    ├── config.js                 # Global constants, env loader, column definitions
    ├── mailClient.js             # Zoho Mail API interface (search, fetch, tag, mark read)
    ├── main.js                   # CLI entry point, batch poller, polling loop orchestrator
    ├── normalize.js              # HTML stripping, whitespace cleanup, regex sanitization
    ├── sheetsClient.js           # Zoho Sheet Data API v2 client, routing, and deduplication
    ├── zohoApi.js                # Low-level Zoho HTTP client, token refresh, error formatting
    └── parsers/
        ├── base.js               # Shared regex definitions and helper extraction functions
        ├── caseEmails.js         # Parsers for dispute, chargeback, and case review emails
        ├── index.js              # Central parser dispatcher
        ├── invoiceEmails.js      # Parsers for invoice_sent, invoice_paid, invoice_update
        └── transfer.js           # Parser for bank transfer requests
```

---

## 4. Application Entry Point

The main application entry point is **[`src/main.js`](file:///e:/New%20folder%20(3)/IPTV-parser/src/main.js)**.

### Core Functions
- **`main()`**: Parses process arguments and determines execution mode (`--once` vs `--loop`).
- **`runOnce({ dryRun, searchKey, days })`**:
  1. Instantiates `MailClient` and `SheetsClient`.
  2. Ensures worksheets (`Sheet1`, `Sent`, `Paid`) and headers exist unless `dryRun` is set.
  3. Queries Zoho Mail for PayPal messages within the specified lookback days.
  4. Sequentially executes `processMessage()` on every matched email.
  5. Returns an array of execution status strings.
- **`runLoop({ dryRun, interval, days })`**:
  - Enters an infinite polling loop executed every `interval` seconds (default: 300s).
  - Logs timestamped cycle starts and Node.js memory usage (`process.memoryUsage().rss`).
  - Traps and logs cycle-level exceptions to ensure unhandled network failures do not terminate the daemon.
- **`processMessage(mail, sheets, messageRef, { dryRun })`**:
  1. Fetches full email body (HTML / plain text).
  2. Normalizes text via `getEmailBody()`.
  3. Classifies email via `classifyEmail()`.
  4. Dispatches to matching parser (`parseEmail()`).
  5. Checks `sheets.isDuplicate()`. If duplicate, skips writing and marks message as processed in Zoho Mail.
  6. If `dryRun` is false, appends row to Zoho Sheet and applies label in Zoho Mail.

### What Happens When `npm start` Runs
When `npm start` is invoked:
1. Executes `node src/main.js --once`.
2. Loads `.env` via `src/config.js`.
3. Reads `token.json` (or refreshes access token if expired).
4. Connects to Zoho Sheet (`44mjx056139c257ea451a84fc15a9ebf7019c`) and verifies tabs.
5. Queries Zoho Mail for emails matching `sender:service@paypal.com` from the past 1 day without the `paypal-parsed` label.
6. Processes, logs, and exits with status code `0`.

---

## 5. Zoho OAuth Authentication

The OAuth authentication engine resides in **[`src/zohoApi.js`](file:///e:/New%20folder%20(3)/IPTV-parser/src/zohoApi.js)**.

### Authentication Flow
1. **Interactive Consent**:
   - `authorizeInteractive()` constructs the Zoho OAuth URL:
     `https://accounts.zoho.com/oauth/v2/auth?scope=<SCOPES>&client_id=<ID>&response_type=code&redirect_uri=http://localhost:3000/oauth/callback&access_type=offline&prompt=consent`
   - Spawns a temporary HTTP server on port 3000 listening for `/oauth/callback`.
   - Opens the default browser to the authorization URL.
   - If port 3000 is occupied or unreachable, prompts the user to paste the callback URL or `code` into the console.
2. **Code Sanitization**:
   - `extractOAuthCode()` automatically parses the authorization code whether the user pastes a raw code (`1000.xxxx`), query parameter (`?code=1000.xxxx`), or full redirect URL (`http://localhost:3000/oauth/callback?code=1000.xxxx...`).
3. **Token Exchange**:
   - Sends `POST https://accounts.zoho.com/oauth/v2/token` with `grant_type: "authorization_code"`.
   - Saves access token, refresh token, expiry timestamp, and API domain into `token.json`.
4. **Token Refreshing**:
   - `getAccessToken()` checks if the cached token is valid for at least another 60 seconds.
   - If expired, automatically requests a fresh access token using `grant_type: "refresh_token"`.

### Required OAuth Scopes
| Scope | Service | Purpose |
| :--- | :--- | :--- |
| `ZohoMail.messages.ALL` | Zoho Mail | Search, fetch, and update message read status |
| `ZohoMail.accounts.READ` | Zoho Mail | Discover user account ID |
| `ZohoMail.tags.ALL` | Zoho Mail | Create and apply processed labels to emails |
| `ZohoSheet.dataAPI.READ` | Zoho Sheet | List worksheets and fetch duplicate records |
| `ZohoSheet.dataAPI.UPDATE` | Zoho Sheet | Create worksheets and append CSV records |

### How to Reauthorize Safely
To replace an expired refresh token or authorize new scopes:
```powershell
npm run auth
```
*(No secrets are logged. Never commit `token.json` or `.env` to version control).*

---

## 6. Zoho Mail Integration

The Zoho Mail interface is managed by **[`src/mailClient.js`](file:///e:/New%20folder%20(3)/IPTV-parser/src/mailClient.js)**.

### Endpoints and Methods
- **`GET /api/accounts`**: Retrieves the primary Zoho Mail account ID (`accountId`).
- **`GET /api/accounts/{accountId}/messages/search`**: Searches inbox using parameters:
  - `searchKey`: `sender:service@paypal.com`
  - `start`: Pagination start index (increments by limit 200).
  - `includeto`: `true`
  - `receivedTime`: Current timestamp.
- **`GET /api/accounts/{accountId}/folders/{folderId}/messages/{messageId}/content`**: Retrieves raw HTML/text email body.
- **`GET /api/accounts/{accountId}/labels`**: Queries existing user labels.
- **`POST /api/accounts/{accountId}/labels`**: Creates label `paypal-parsed` if it does not exist.
- **`PUT /api/accounts/{accountId}/updatemessage`**:
  - `mode: "markAsRead"` marks message as read.
  - `mode: "applyLabel"` assigns `paypal-parsed` tag to the message ID.

### Lookback & Filtering
- Messages older than `MAIL_LOOKBACK_DAYS` (calculated by `getLookbackCutoffMs()`) are skipped.
- Messages not from `PAYPAL_SENDER` or already tagged with `PROCESSED_LABEL` are ignored.

---

## 7. Email Classification

Implemented in **[`src/classifier.js`](file:///e:/New%20folder%20(3)/IPTV-parser/src/classifier.js)**.

### Classification Strategy
1. **Primary Rules Pass (`RULES`)**: Evaluates subject patterns and body patterns sequentially.
2. **Fallback Rules Pass (`BODY_FALLBACKS`)**: If subject rules miss, searches body text for unique signature phrases.
3. **Unknown Pass**: Returns `"unknown"` if no template matches. Unclassified emails are routed to the `_log` tab structure with a 500-character snippet.

### Classification Table
| Email Type | Primary Subject Patterns | Primary Body Patterns | Fallback Body Patterns |
| :--- | :--- | :--- | :--- |
| `invoice_sent` | `"we sent your invoice"` | `"your invoice is on the"`, `"way"` | `"we sent your invoice to"` |
| `invoice_paid` | `"paid for your invoice"` | `"you received a"`, `"payment"`, `"for your invoice"` | `"amount paid"`, `"invoice #"` |
| `invoice_update` | `"updated your invoice"` | `"your updated invoice is"` | `"amount due:"`, `"updated invoice"` |
| `case_open` | `"action required for case id"`, `"reminder: action required"` | `"please provide any additional information"` | `"please provide any additional information"` |
| `case_update` | `"update on case id"` | `"an update on your case"` | `"an update on your case"` |
| `case_final` | `"decided the case"` | `"we've decided the case"`, `"in your favor"` | `"we've decided the case"`, `"in your favor"` |
| `payment_review` | `"reviewing a payment you"` | `"we're reviewing a payment you received"` | `"we're reviewing a payment you received"` |
| `refund_requested` | `"your buyer has filed a case"` | `"your buyer has filed a chargeback"`, `"you have received a case"` | `"your buyer has filed a chargeback"` |
| `response_on_case` | `"your paypal case"` | `"thank you for your response"` | `"thank you for your response"` |
| `transfer_request` | `"transfer request is processing"` | `"we're transferring money to your bank"` | `"we're transferring money to your bank"` |

---

## 8. Email Parsers

Located in **[`src/parsers/`](file:///e:/New%20folder%20(3)/IPTV-parser/src/parsers/)**.

### Base Metadata (`baseMetadata`)
Every parser begins with common metadata fields:
- `gmail_message_id`: Message ID string from Zoho.
- `email_date`: Parsed date (`YYYY-MM-DD`).
- `subject`: Email subject line.
- `account_name`: Business or recipient name extracted after `Hello,` or `Dear`.
- `parsed_at`: UTC ISO timestamp.
- `email_type`: Matching classified template string.

### Parsers Summary

#### 1. `parseInvoiceSent(text, meta)` ([`invoiceEmails.js`](file:///e:/New%20folder%20(3)/IPTV-parser/src/parsers/invoiceEmails.js#L10))
- **Input**: Normalized email text + metadata.
- **Regex Patterns**:
  - `we sent your invoice to\s+(\S+@\S+)\s+for\s+([^\n]+)`
  - `invoice\s*#?\s*(\d+)` or `invoice\s*\((\d+)\)`
  - `AMOUNT_RE = /([\$£€][\d,]+\.\d{2})\s*(USD|GBP|EUR)?/i`
- **Extracted Fields**: `invoice_number`, `recipient_email`, `amount`, `currency`.

#### 2. `parseInvoicePaid(text, meta)` ([`invoiceEmails.js`](file:///e:/New%20folder%20(3)/IPTV-parser/src/parsers/invoiceEmails.js#L45))
- **Input**: Normalized email text + metadata.
- **Extraction Rules**:
  - Reads line following `Customer` label for `customer_name` and `customer_email`.
  - Extracts labeled currency amounts: `Invoice total`, `Amount paid`, `Fee/tax collected by PayPal`.
  - Searches for `Transaction ID` (17-character alphanumeric string).
  - Checks for `"Seller Protection - Eligible"`.
- **Extracted Fields**: `invoice_number`, `txn_id`, `customer_name`, `customer_email`, `line_items`, `invoice_total`, `amount_paid`, `fee`, `currency`, `seller_protection`.

#### 3. `parseInvoiceUpdate(text, meta)` ([`invoiceEmails.js`](file:///e:/New%20folder%20(3)/IPTV-parser/src/parsers/invoiceEmails.js#L123))
- **Extracted Fields**: `invoice_number`, `recipient_email`, `amount_due`, `currency`, `due_terms`.

#### 4. `parseCaseOpen(text, meta)` ([`caseEmails.js`](file:///e:/New%20folder%20(3)/IPTV-parser/src/parsers/caseEmails.js#L30))
- **Extracted Fields**: `case_id` (`PP-R-XXX-XXXX`), `buyer_name`, `buyer_email`, `buyer_txn_id`, `seller_txn_id`, `invoice_id`, `txn_date`, `txn_amount`, `disputed_amount`, `response_deadline`.

#### 5. `parseCaseUpdate(text, meta)` ([`caseEmails.js`](file:///e:/New%20folder%20(3)/IPTV-parser/src/parsers/caseEmails.js#L68))
- **Extracted Fields**: `case_id`, `buyer_name`, `buyer_email`, `buyer_txn_id`, `seller_txn_id`, `invoice_id`, `txn_date`, `txn_amount`, `disputed_amount`, `debit_reason`, `chargeback_fee`.

#### 6. `parseCaseFinal(text, meta)` ([`caseEmails.js`](file:///e:/New%20folder%20(3)/IPTV-parser/src/parsers/caseEmails.js#L12))
- **Extracted Fields**: `case_id`, `buyer_name`, `buyer_email`, `buyer_txn_id`, `seller_txn_id`, `invoice_id`, `txn_date`, `txn_amount`, `dispute_amount`, `outcome`.

#### 7. `parsePaymentReview(text, meta)` ([`caseEmails.js`](file:///e:/New%20folder%20(3)/IPTV-parser/src/parsers/caseEmails.js#L98))
- **Extracted Fields**: `case_id`, `dispute_amount`, `txn_id`, `txn_amount`, `txn_date`, `buyer_name`, `response_deadline`, `refund_deadline`.

#### 8. `parseRefundRequested(text, meta)` ([`caseEmails.js`](file:///e:/New%20folder%20(3)/IPTV-parser/src/parsers/caseEmails.js#L119))
- **Extracted Fields**: `case_id`, `txn_amount`, `disputed_amount`, `txn_date`, `buyer_name`, `txn_id`, `response_deadline`.

#### 9. `parseResponseOnCase(text, meta)` ([`caseEmails.js`](file:///e:/New%20folder%20(3)/IPTV-parser/src/parsers/caseEmails.js#L135))
- **Extracted Fields**: `case_id`, `buyer_name`, `txn_date`, `txn_amount`, `txn_id`, `dispute_amount`, `hold_amount`.

#### 10. `parseTransferRequest(text, meta)` ([`transfer.js`](file:///e:/New%20folder%20(3)/IPTV-parser/src/parsers/transfer.js#L7))
- **Extracted Fields**: `txn_id`, `transfer_date`, `amount`, `currency`, `bank_account`, `estimated_arrival`.

---

## 9. Zoho Sheet Integration

Managed by **[`src/sheetsClient.js`](file:///e:/New%20folder%20(3)/IPTV-parser/src/sheetsClient.js)**.

### Configuration
- **Sheet API URL**: `https://sheet.zoho.com/api/v2/{resourceId}`
- **Active Sheet Resource ID**: `44mjx056139c257ea451a84fc15a9ebf7019c`
- **Primary Worksheet Name**: `Sheet1`

### API Methods Used
| Method Parameter | Operation | Scope Required |
| :--- | :--- | :--- |
| `worksheet.list` | List existing worksheet tabs | `ZohoSheet.dataAPI.READ` |
| `worksheet.insert` | Create missing worksheet tab (`Sent`, `Paid`) | `ZohoSheet.dataAPI.UPDATE` |
| `worksheet.csvdata.set` | Set row 1 CSV header values | `ZohoSheet.dataAPI.UPDATE` |
| `worksheet.csvdata.append` | Append transaction rows in CSV format | `ZohoSheet.dataAPI.UPDATE` |
| `worksheet.records.fetch` | Query existing records for duplicate detection | `ZohoSheet.dataAPI.READ` |

### Master Columns Schema (24 Columns)
```text
email_date, subject, parsed_at, email_type, case_id, buyer_name, buyer_email, invoice_id, txn_date, txn_amount, dispute_amount, disputed_amount, chargeback_fee, txn_id, hold_amount, invoice_number, recipient_email, amount, currency, customer_name, customer_email, line_items, amount_paid, fee
```

---

## 10. Worksheet Routing

### Production Routing Table
| Email Event Type | Master Ledger (`Sheet1`) | Sub-Worksheet (`Sent`) | Sub-Worksheet (`Paid`) |
| :--- | :---: | :---: | :---: |
| `invoice_sent` | **YES** | **YES** | NO |
| `invoice_paid` | **YES** | NO | **YES** |
| `invoice_update` | **YES** | NO | NO |
| `case_open` | **YES** | NO | NO |
| `case_update` | **YES** | NO | NO |
| `case_final` | **YES** | NO | NO |
| `payment_review` | **YES** | NO | NO |
| `refund_requested`| **YES** | NO | NO |
| `response_on_case`| **YES** | NO | NO |
| `transfer_request`| **YES** | NO | NO |

### Routing Implementation in `appendRow()`
```javascript
// 1. Always append to Master Ledger (Sheet1)
await this.sheetRequest({
  method: "worksheet.csvdata.append",
  worksheet_name: this.worksheetName, // "Sheet1"
  data: csv,
});

// 2. Conditionally append to dedicated sub-worksheet
const extraWorksheetName = EXTRA_WORKSHEETS_BY_EMAIL_TYPE[row.email_type];
if (extraWorksheetName) {
  await this.sheetRequest({
    method: "worksheet.csvdata.append",
    worksheet_name: extraWorksheetName, // "Sent" or "Paid"
    data: csv,
  });
}
```

---

## 11. Duplicate Detection

Implemented in [`SheetsClient.duplicateKey()`](file:///e:/New%20folder%20(3)/IPTV-parser/src/sheetsClient.js#L23) and [`isDuplicate()`](file:///e:/New%20folder%20(3)/IPTV-parser/src/sheetsClient.js#L152).

### Key Generation Strategy
- **Transaction-based**: `txn:<txn_id>` (Used by `invoice_paid`, `payment_review`, etc.)
- **Case-based**: `case:<case_id>:<email_type>` (Used by disputes and chargebacks)
- **Invoice-based**: `inv:<email_type>:<invoice_number>:<email_date>` (Used by `invoice_sent`)
- **Fallback**: `sub:<email_date>|<subject>|<email_type>`

### Deduplication Process
1. On first check, `getDuplicateKeys()` loads the latest 1,000 records from `Sheet1`.
2. Generates composite keys for each record and stores them in a memory cache (`Set`).
3. If an incoming row's `duplicateKey` exists in the cache:
   - Writing to both `Sheet1` and `Sent`/`Paid` is skipped.
   - Message is marked processed in Zoho Mail.
   - Console logs `skip duplicate: <subject> (<tab>)`.
4. If unique, row is appended and its key is added to the in-memory cache.

---

## 12. Polling System

### Modes of Execution
- **Single Run (`npm start`)**: Executes `runOnce()`, processes unread emails from lookback window, prints summary, and exits with code `0`.
- **Continuous Polling (`npm run poll`)**: Executes `runLoop()`, running continuously every `POLL_INTERVAL_SECONDS` (default: 300 seconds).

### Memory & Error Resilience
- Logs RSS memory usage in MB at the start of every cycle.
- Traps network timeouts and API errors inside the loop so single-cycle failures do not terminate the background daemon.

---

## 13. CLI Arguments

Supported arguments in `src/main.js`:

| Argument | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `--once` | Boolean | `false` | Run a single polling pass and exit |
| `--loop` | Boolean | `false` | Run continuous polling loop |
| `--dry-run` | Boolean | `false` | Parse emails without writing to Zoho Sheet or marking read |
| `--days <N>` | Number | `1` (from `.env`) | Lookback search window in days |
| `--search-key <str>`| String | `sender:service@paypal.com` | Custom Zoho Mail search query |
| `--interval <N>` | Number | `300` (from `.env`)| Polling interval in seconds for loop mode |

---

## 14. Dry Run Mode

Invoked via:
```powershell
node src/main.js --once --dry-run --days 7
```

### Dry Run Behavior
- **Reads Zoho Mail**: **YES** (Fetches and inspects messages matching criteria).
- **Classifies & Parses**: **YES** (Executes full classification and regex parsing).
- **Checks Duplicates**: **YES** (Evaluates against existing `Sheet1` records).
- **Writes to Zoho Sheet**: **NO** (Bypasses `ensureTabs()` and `appendRow()`).
- **Modifies Zoho Mail**: **NO** (Does NOT apply labels or mark emails as read).

---

## 15. Setup Scripts

| Script | Command | Purpose |
| :--- | :--- | :--- |
| `scripts/auth.js` | `npm run auth` | Initiates interactive OAuth authorization in browser, captures code, and saves `token.json`. |
| `scripts/setupSheets.js` | `npm run setup-sheets` | Connects to `ZOHO_SHEET_RESOURCE_ID`, validates `Sheet1`, inserts `Sent` & `Paid` tabs, and writes 24 master column headers. |
| `scripts/showRefreshToken.js`| `npm run show-refresh-token`| Extracts and prints `refresh_token` from `token.json` for environment variable injection in headless container environments (Coolify / Docker). |

---

## 16. Environment Variables

Configured in `.env`:

| Variable | Required | Default / Example | Purpose |
| :--- | :---: | :--- | :--- |
| `ZOHO_DC` | Yes | `com` | Zoho data center domain suffix (`com`, `eu`, `in`, etc.) |
| `ZOHO_CLIENT_ID` | Yes | `<REDACTED>` | Zoho OAuth Application Client ID |
| `ZOHO_CLIENT_SECRET` | Yes | `<REDACTED>` | Zoho OAuth Application Client Secret |
| `ZOHO_REDIRECT_URI` | Yes | `http://localhost:3000/oauth/callback` | OAuth redirect URI registered in Zoho Console |
| `ZOHO_REFRESH_TOKEN` | Optional | `<REDACTED>` | Offline refresh token for headless container deployments |
| `ZOHO_MAIL_ACCOUNT_ID` | Optional | *(Auto-discovered)* | Zoho Mail Account ID (auto-fetched if left blank) |
| `ZOHO_SHEET_RESOURCE_ID`| Yes | `44mjx056139c257ea451a84fc15a9ebf7019c` | Active Zoho Sheet unique resource identifier |
| `ZOHO_WORKSHEET_NAME` | Yes | `Sheet1` | Primary master ledger worksheet name |
| `MAIL_SEARCH_KEY` | Yes | `sender:service@paypal.com` | Base search query for Zoho Mail message search |
| `MAIL_LOOKBACK_DAYS` | Yes | `1` | Default search lookback window in days |
| `PAYPAL_SENDER` | Yes | `service@paypal.com` | Filter to ensure incoming messages match PayPal sender |
| `PROCESSED_LABEL` | Yes | `paypal-parsed` | Label tag assigned to processed emails |
| `POLL_INTERVAL_SECONDS` | Yes | `300` | Delay between polling iterations in loop mode |
| `TOKEN_PATH` | Yes | `token.json` | Local filepath for caching OAuth tokens |

---

## 17. Current Zoho Sheet Configuration

- **Sheet Resource ID**: `44mjx056139c257ea451a84fc15a9ebf7019c`
- **Worksheet Tabs**:
  1. **`Sheet1`**: Master Ledger. Contains every parsed email event chronologically.
  2. **`Sent`**: Outgoing invoices tab (`invoice_sent`).
  3. **`Paid`**: Customer payment receipts tab (`invoice_paid`).

---

## 18. Error Handling & Diagnostics

- **Diagnostic Error Formatter (`formatZohoError`)**: Detects HTTP `401`/`403` or `"not authorized"` responses and provides actionable causes (scope missing, resource ID mismatch, account ownership).
- **Network Retry Engine (`fetchWithRetry`)**: Automatically retries idempotent network calls up to 3 times with exponential backoff on retryable network exceptions (`ETIMEDOUT`, `ECONNRESET`, `AbortError`, etc.).
- **Cycle Isolation**: Individual message failures in `runOnce()` are caught, logged, and left untagged in Zoho Mail so subsequent cycles will retry them without crashing the service.

---

## 19. Logging & Observability

- **Standard Logging**:
  - `poller started — interval 300s, lookback 1d, node v22.14.0, pid 1234`
  - `[2026-09-01T16:00:00.000Z] cycle start (rss 38 MB)`
  - `processed: <subject> -> <tab>`
  - `skip duplicate: <subject> (<tab>)`
  - `No new messages (searched last 1 day(s)).`
- **Security Check**:
  - `zohoApi.js` logs sanitized endpoint URLs and HTTP status codes.
  - Access tokens, refresh tokens, and client secrets are **NEVER** printed to console or written to application log files.

---

## 20. Security Review

| Check | Status | Notes |
| :--- | :---: | :--- |
| **`.env` File** | **PASS** | Listed in `.gitignore`. Secrets isolated from source control. |
| **`token.json` File** | **PASS** | Listed in `.gitignore`. Ephemeral local token cache. |
| **Hardcoded Secrets** | **PASS** | No tokens, passwords, or client secrets hardcoded in source. |
| **Logging Sanitization**| **PASS** | Error handlers and fetch logs sanitize headers and bodies. |
| **OAuth Consent Scopes**| **PASS** | Restricted to least-privilege Zoho Mail and Sheet scopes. |

**Overall Security Status:** **`PASS`**

---

## 21. End-to-End Data Flow Examples

### Scenario A: Invoice Sent
```
1. PayPal generates email -> Subject: "We sent your invoice (INV-1001)"
2. MailClient fetches message -> normalizeText() extracts body
3. classifyEmail() matches "we sent your invoice" -> returns "invoice_sent"
4. parseInvoiceSent() extracts invoice_number="INV-1001", amount="$100.00", recipient="client@example.com"
5. duplicateKey() generates "inv:invoice_sent:INV-1001:2026-09-01"
6. isDuplicate() checks Sheet1 -> false
7. appendRow() writes row to Sheet1 AND Sent
8. markProcessed() tags message with 'paypal-parsed' and marks as read
```

### Scenario B: Invoice Paid
```
1. PayPal generates email -> Subject: "Jane Doe paid for your invoice (INV-1001)"
2. MailClient fetches message -> normalizeText() extracts body
3. classifyEmail() matches "paid for your invoice" -> returns "invoice_paid"
4. parseInvoicePaid() extracts invoice_number="INV-1001", txn_id="4AB12345CD67890EF", amount_paid="$100.00"
5. duplicateKey() generates "txn:4AB12345CD67890EF"
6. isDuplicate() checks Sheet1 -> false
7. appendRow() writes row to Sheet1 AND Paid
8. markProcessed() tags message with 'paypal-parsed' and marks as read
```

---

## 22. Installation & Setup Guide

For a new developer setting up the repository:

```powershell
# 1. Clone repository & install dependencies
git clone <repo-url>
cd IPTV-parser
npm install

# 2. Configure environment variables
Copy-Item .env.example .env
# Edit .env with your ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET

# 3. Authenticate with Zoho (One-time)
npm run auth

# 4. Initialize Zoho Sheet tabs and headers
npm run setup-sheets

# 5. Execute first ingestion pass
npm start
```

---

## 23. Testing & Verification Guide

```powershell
# Test 1: Single run (last 1 day)
npm start

# Test 2: Historical lookback (last 7 days)
node src/main.js --once --days 7

# Test 3: Safe dry-run (no sheet writes)
node src/main.js --once --dry-run --days 30

# Test 4: Continuous daemon loop
npm run poll
```

---

## 24. Current Verification Status

### Live Production Routing Test Results (Resource ID: `44mjx056139c257ea451a84fc15a9ebf7019c`)
The routing engine was verified live using `SheetsClient.appendRow()`:

```text
==========================================
LIVE ROUTING VERIFICATION REPORT
==========================================
TEST-SENT-001 (invoice_sent):
  Sheet1 = YES (Row 2)
  Sent   = YES (Row 2)
  Paid   = NO

TEST-PAID-001 (invoice_paid):
  Sheet1 = YES (Row 3)
  Sent   = NO
  Paid   = YES (Row 2)
==========================================
```
*(These records are tagged with `[TEST]` in the subject line for visual identification).*

---

## 25. Known Issues & Recommendations

| Issue / Improvement | Severity | Description | Recommendation |
| :--- | :---: | :--- | :--- |
| **CLI Argument Passing via NPM** | `LOW` | Running `npm start -- --days 7` passes `--` as an argument on some shells. | Use direct Node command `node src/main.js --once --days 7` or update `parseArgs` to skip literal `"--"`. |
| **Duplicate Cache Record Limit** | `LOW` | `getDuplicateKeys()` fetches up to 1,000 records from `Sheet1`. | For long-running high-volume deployments, implement multi-page fetch or date-filtered duplicate queries. |
| **Label 401 Fallback** | `INFO` | If `ZohoMail.tags.ALL` scope is missing, label application logs a warning and falls back to mark-as-read. | Ensure all 5 scopes are selected during OAuth consent. |

---

## 26. Final Health Check Matrix

| Component | Status | Verification Notes |
| :--- | :---: | :--- |
| **Node.js Application** | **PASS** | Syntax validated, ES module imports clean, Node 18+ compatible |
| **Zoho OAuth** | **PASS** | Interactive consent + automatic refresh token rotation verified |
| **Zoho Mail Integration** | **PASS** | Account lookup, message search, and lookback filters functioning |
| **Zoho Sheet API v2** | **PASS** | Endpoints configured to `https://sheet.zoho.com/api/v2/{id}` |
| **Master Ledger (`Sheet1`)** | **PASS** | Headers set (24 columns), sequential appending active |
| **`Sent` Worksheet Routing** | **PASS** | Verified live write for `invoice_sent` records |
| **`Paid` Worksheet Routing** | **PASS** | Verified live write for `invoice_paid` records |
| **Duplicate Detection** | **PASS** | Composite keys evaluated against `Sheet1` prior to writes |
| **Email Parsers** | **PASS** | 10 regex-based parser modules operational |
| **Polling System** | **PASS** | Single-pass (`--once`) and continuous loop (`--loop`) verified |
| **Security Audit** | **PASS** | Secrets segregated into `.env` and `.gitignore`, no secrets in logs |

---

## 27. Developer Review Summary

- **Is the project currently working?** **YES**.
- **Is Zoho Mail working?** **YES** (Successfully queries mailbox without errors).
- **Is Zoho Sheet working?** **YES** (Data API v2 write and fetch calls confirmed).
- **Is the NEW Sheet being used?** **YES** (Resource ID: `44mjx056139c257ea451a84fc15a9ebf7019c`).
- **Is `invoice_sent` correctly routed to `Sent`?** **YES** (Appends to `Sheet1` + `Sent`).
- **Is `invoice_paid` correctly routed to `Paid`?** **YES** (Appends to `Sheet1` + `Paid`).
- **Are duplicate records prevented?** **YES** (Deduplication engine evaluates `Sheet1` prior to writes).
- **Are there any critical issues?** **None**. All systems and integration points are healthy and operational.
