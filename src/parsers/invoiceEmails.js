import {
  AMOUNT_RE,
  EMAIL_RE,
  extractAmountAfterLabel,
  extractFieldAfterLabel,
  extractInvoiceNumber,
  extractTxnIdAfterLabel,
} from "./base.js";

export function parseInvoiceSent(text, meta) {
  // Number often appears in subject as "invoice (6941)" rather than in body
  const invoiceNumber =
    extractInvoiceNumber(text) || extractInvoiceNumber(meta.subject || "");
  let recipientEmail = "";
  let amount = "";
  let currency = "";

  const match = text.match(/we sent your invoice to\s+(\S+@\S+)\s+for\s+([^\n]+)/i);
  if (match) {
    recipientEmail = match[1].trim();
    const amountMatch = match[2].match(AMOUNT_RE);
    if (amountMatch) {
      amount = amountMatch[1];
      currency = (amountMatch[2] || "").toUpperCase();
    }
  }

  if (!amount || !currency) {
    const subjectMatch = (meta.subject || "").match(AMOUNT_RE);
    if (subjectMatch) {
      if (!amount) amount = subjectMatch[1];
      if (!currency) currency = (subjectMatch[2] || "").toUpperCase();
    }
  }

  return {
    ...meta,
    invoice_number: invoiceNumber,
    recipient_email: recipientEmail,
    amount,
    currency,
  };
}

export function parseInvoicePaid(text, meta) {
  const invoiceNumber =
    extractInvoiceNumber(text) || extractInvoiceNumber(meta.subject || "");
  const txnId = extractTxnIdAfterLabel(text, "Transaction ID");

  let customerName = "";
  let customerEmail = "";
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase() === "customer" && i + 1 < lines.length) {
      // Skip the label-only row; next non-empty lines are name then email
      const maybeName = lines[i + 1];
      if (maybeName && !EMAIL_RE.test(maybeName) && !/^invoice/i.test(maybeName)) {
        customerName = maybeName;
      }
      if (i + 2 < lines.length) {
        const emailMatch = lines[i + 2].match(EMAIL_RE);
        if (emailMatch) customerEmail = emailMatch[0];
      }
      if (!customerEmail && i + 1 < lines.length) {
        const emailMatch = lines[i + 1].match(EMAIL_RE);
        if (emailMatch) customerEmail = emailMatch[0];
      }
      break;
    }
  }

  // Fallback: "Name paid for your invoice" in the subject
  if (!customerName) {
    const subjectName = (meta.subject || "").match(
      /^(.+?)\s+paid for your invoice/i
    );
    if (subjectName) customerName = subjectName[1].trim();
  }

  const lineItems = lines
    .filter((line) => /\d+\s*x\s+/i.test(line))
    .map((line) => line.trim());

  let invoiceTotal = "";
  let amountPaid = "";
  let fee = "";
  let currency = "";
  let sellerProtection = "";

  for (const label of ["Invoice total", "Amount paid", "Fee/tax collected by PayPal"]) {
    const [val, cur] = extractAmountAfterLabel(text, label);
    if (val) {
      if (label === "Invoice total") invoiceTotal = val;
      else if (label === "Amount paid") amountPaid = val;
      else if (label.startsWith("Fee")) fee = val;
      if (cur) currency = cur;
    }
  }

  if (text.includes("Seller Protection - Eligible")) {
    sellerProtection = "Eligible";
  }

  return {
    ...meta,
    invoice_number: invoiceNumber,
    txn_id: txnId,
    customer_name: customerName,
    customer_email: customerEmail,
    line_items: lineItems.join("; "),
    invoice_total: invoiceTotal,
    amount_paid: amountPaid,
    fee,
    currency,
    seller_protection: sellerProtection,
  };
}

export function parseInvoiceUpdate(text, meta) {
  const invoiceNumber = extractInvoiceNumber(text);
  let recipientEmail = "";
  let amountDue = "";
  let currency = "";
  let dueTerms = "";

  const emailMatch = text.match(/sent your updated invoice to\s+(\S+@\S+)/i);
  if (emailMatch) recipientEmail = emailMatch[1].trim();

  const dueMatch = text.match(/Amount due:\s*([^\n]+)/i);
  if (dueMatch) {
    const amountMatch = dueMatch[1].match(AMOUNT_RE);
    if (amountMatch) {
      amountDue = amountMatch[1];
      currency = (amountMatch[2] || "").toUpperCase();
    }
  }

  const termsMatch = text.match(/(Due on receipt)/i);
  if (termsMatch) dueTerms = termsMatch[1];

  return {
    ...meta,
    invoice_number: invoiceNumber,
    recipient_email: recipientEmail,
    amount_due: amountDue,
    currency,
    due_terms: dueTerms,
  };
}
