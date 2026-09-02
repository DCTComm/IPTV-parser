import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(ROOT_DIR, ".env") });

export const ZOHO_DC = process.env.ZOHO_DC || "com";
export const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID || "";
export const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET || "";
export const ZOHO_REDIRECT_URI =
  process.env.ZOHO_REDIRECT_URI || "http://localhost:3000/oauth/callback";
/** Set in deployments where token.json can't persist (containers) or for pre-shared refresh tokens. */
export const ZOHO_REFRESH_TOKEN = (process.env.ZOHO_REFRESH_TOKEN || "")
  .trim()
  .replace(/^["']|["']$/g, "");

export const ACCOUNTS_URL = `https://accounts.zoho.${ZOHO_DC}`;
export const MAIL_API_URL = `https://mail.zoho.${ZOHO_DC}`;
export const SHEET_API_URL = `https://sheet.zoho.${ZOHO_DC}`;

export const ZOHO_MAIL_ACCOUNT_ID = process.env.ZOHO_MAIL_ACCOUNT_ID || "";
export const ZOHO_SHEET_RESOURCE_ID = process.env.ZOHO_SHEET_RESOURCE_ID || "";
export const ZOHO_WORKSHEET_NAME = process.env.ZOHO_WORKSHEET_NAME || "All";
export const MAIL_SEARCH_KEY =
  process.env.MAIL_SEARCH_KEY || "sender:service@paypal.com";
export const HISTORIC_DAYS = Number(
  process.env.HISTORIC_DAYS || process.env.MAIL_LOOKBACK_DAYS || "30"
);
export const MAIL_LOOKBACK_DAYS = HISTORIC_DAYS;
export const PAYPAL_SENDER = process.env.PAYPAL_SENDER || "service@paypal.com";
export const ZOHO_FETCH_TAGGED =
  process.env.ZOHO_FETCH_TAGGED === "true" ||
  process.env.ZOHO_FETCH_TAGGED === "1";
export const ZOHO_MAIL_TAG =
  process.env.ZOHO_MAIL_TAG || process.env.PROCESSED_LABEL || "paypal-parsed";
export const PROCESSED_LABEL = ZOHO_MAIL_TAG;
export const POLL_INTERVAL_SECONDS = Number(
  process.env.POLL_INTERVAL_SECONDS || "300"
);
export const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || "30000");
export const FETCH_RETRIES = Number(process.env.FETCH_RETRIES || "3");
export const TOKEN_PATH = path.resolve(
  ROOT_DIR,
  process.env.TOKEN_PATH || "token.json"
);

export const SCOPES = [
  "ZohoMail.messages.ALL",
  "ZohoMail.accounts.READ",
  "ZohoMail.tags.ALL",
  "ZohoSheet.dataAPI.READ",
  "ZohoSheet.dataAPI.UPDATE",
];

export const SHEET_TABS = {
  case_final: [
    "gmail_message_id",
    "email_date",
    "subject",
    "account_name",
    "parsed_at",
    "email_type",
    "case_id",
    "buyer_name",
    "buyer_email",
    "buyer_txn_id",
    "seller_txn_id",
    "invoice_id",
    "txn_date",
    "txn_amount",
    "dispute_amount",
    "outcome",
  ],
  case_open: [
    "gmail_message_id",
    "email_date",
    "subject",
    "account_name",
    "parsed_at",
    "email_type",
    "case_id",
    "buyer_name",
    "buyer_email",
    "buyer_txn_id",
    "seller_txn_id",
    "invoice_id",
    "txn_date",
    "txn_amount",
    "disputed_amount",
    "response_deadline",
  ],
  case_update: [
    "gmail_message_id",
    "email_date",
    "subject",
    "account_name",
    "parsed_at",
    "email_type",
    "case_id",
    "buyer_name",
    "buyer_email",
    "buyer_txn_id",
    "seller_txn_id",
    "invoice_id",
    "txn_date",
    "txn_amount",
    "disputed_amount",
    "debit_reason",
    "chargeback_fee",
  ],
  payment_review: [
    "gmail_message_id",
    "email_date",
    "subject",
    "account_name",
    "parsed_at",
    "email_type",
    "case_id",
    "dispute_amount",
    "txn_id",
    "txn_amount",
    "txn_date",
    "buyer_name",
    "response_deadline",
    "refund_deadline",
  ],
  refund_requested: [
    "gmail_message_id",
    "email_date",
    "subject",
    "account_name",
    "parsed_at",
    "email_type",
    "case_id",
    "txn_amount",
    "disputed_amount",
    "txn_date",
    "buyer_name",
    "txn_id",
    "response_deadline",
  ],
  response_on_case: [
    "gmail_message_id",
    "email_date",
    "subject",
    "account_name",
    "parsed_at",
    "email_type",
    "case_id",
    "buyer_name",
    "txn_date",
    "txn_amount",
    "txn_id",
    "dispute_amount",
    "hold_amount",
  ],
  invoice_sent: [
    "gmail_message_id",
    "email_date",
    "subject",
    "account_name",
    "parsed_at",
    "email_type",
    "invoice_number",
    "recipient_email",
    "amount",
    "currency",
  ],
  invoice_paid: [
    "gmail_message_id",
    "email_date",
    "subject",
    "account_name",
    "parsed_at",
    "email_type",
    "invoice_number",
    "txn_id",
    "customer_name",
    "customer_email",
    "line_items",
    "invoice_total",
    "amount_paid",
    "fee",
    "currency",
    "seller_protection",
  ],
  invoice_update: [
    "gmail_message_id",
    "email_date",
    "subject",
    "account_name",
    "parsed_at",
    "email_type",
    "invoice_number",
    "recipient_email",
    "amount_due",
    "currency",
    "due_terms",
  ],
  transfer_request: [
    "gmail_message_id",
    "email_date",
    "subject",
    "account_name",
    "parsed_at",
    "email_type",
    "txn_id",
    "transfer_date",
    "amount",
    "currency",
    "bank_account",
    "estimated_arrival",
  ],
  _log: [
    "gmail_message_id",
    "email_date",
    "subject",
    "parsed_at",
    "email_type",
    "error",
    "raw_snippet",
  ],
};

/** Columns written to Zoho Sheet (yellow-highlighted fields). */
export const MASTER_COLUMNS = [
  "email_date",
  "subject",
  "parsed_at",
  "email_type",
  "case_id",
  "buyer_name",
  "buyer_email",
  "invoice_id",
  "txn_date",
  "txn_amount",
  "dispute_amount",
  "disputed_amount",
  "chargeback_fee",
  "txn_id",
  "hold_amount",
  "invoice_number",
  "recipient_email",
  "amount",
  "currency",
  "customer_name",
  "customer_email",
  "line_items",
  "amount_paid",
  "fee",
];
