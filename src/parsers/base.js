export const CASE_ID_RE = /PP-R-[A-Z]{3}-\d+/;
export const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
export const AMOUNT_RE = /([\$£€][\d,]+\.\d{2})\s*(USD|GBP|EUR)?/i;
export const TXN_ID_RE = /\b[A-Z0-9]{17}\b/;
export const INVOICE_ID_RE = /INV2-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/;

export function utcNowIso() {
  return new Date().toISOString();
}

export function extractCaseId(text) {
  const match = text.match(CASE_ID_RE);
  return match ? match[0] : "";
}

export function extractInvoiceNumber(text) {
  let match = text.match(/invoice\s*#?\s*(\d+)/i);
  if (match) return match[1];
  match = text.match(/invoice\s*\((\d+)\)/i);
  return match ? match[1] : "";
}

export function extractInvoiceId(text) {
  const match = text.match(INVOICE_ID_RE);
  return match ? match[0] : "";
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractFieldAfterLabel(text, label) {
  const pattern = new RegExp(`${escapeRegex(label)}\\s*\\n?\\s*([^\\n]+)`, "i");
  const match = text.match(pattern);
  return match ? match[1].trim() : "";
}

function sectionAfterLabel(text, label, maxChars = 120) {
  const pattern = new RegExp(`${escapeRegex(label)}\\s*\\n?\\s*`, "i");
  const match = pattern.exec(text);
  if (!match) return "";
  return text.slice(match.index + match[0].length, match.index + match[0].length + maxChars);
}

export function extractAmountAfterLabel(text, label) {
  const value = extractFieldAfterLabel(text, label);
  if (!value) {
    const chunk = sectionAfterLabel(text, label);
    if (chunk) {
      const match = chunk.match(AMOUNT_RE);
      if (match) return [match[1], (match[2] || "").toUpperCase()];
    }
    return ["", ""];
  }
  const match = value.match(AMOUNT_RE);
  if (match) return [match[1], (match[2] || "").toUpperCase()];
  return [value, ""];
}

export function extractEmailAfterLabel(text, label) {
  const section = sectionAfterLabel(text, label);
  if (section) {
    const match = section.match(EMAIL_RE);
    if (match) return match[0];
  }
  return "";
}

export function extractTxnIdAfterLabel(text, label) {
  const value = extractFieldAfterLabel(text, label);
  if (value) {
    const match = value.match(TXN_ID_RE);
    if (match) return match[0];
  }
  const section = sectionAfterLabel(text, label);
  if (section) {
    const match = section.match(TXN_ID_RE);
    if (match) return match[0];
  }
  return "";
}

export function extractDateAfterLabel(text, label) {
  return extractFieldAfterLabel(text, label);
}

export function extractDeadline(text, keyword = "before") {
  const pattern = new RegExp(`${keyword}\\s+([A-Za-z]+\\s+\\d{1,2},\\s+\\d{4})`, "i");
  const match = text.match(pattern);
  return match ? match[1] : "";
}

export function extractResponseDeadline(text) {
  const deadline = extractDeadline(text, "before");
  if (deadline) return deadline;
  const match = text.match(/respond to this case by\s+([^\n.]+)/i);
  return match ? match[1].trim() : "";
}

export function extractAccountName(text) {
  let match = text.match(/Hello,\s+([^\n]+)/i);
  if (match) return match[1].trim();
  match = text.match(/Dear\s+([^,\n]+)/i);
  return match ? match[1].trim() : "";
}

export function baseMetadata({
  gmailMessageId,
  emailDate,
  subject,
  accountName,
  emailType,
}) {
  return {
    gmail_message_id: gmailMessageId,
    email_date: emailDate,
    subject,
    account_name: accountName,
    parsed_at: utcNowIso(),
    email_type: emailType,
  };
}
