import {
  extractAmountAfterLabel,
  extractCaseId,
  extractDateAfterLabel,
  extractEmailAfterLabel,
  extractFieldAfterLabel,
  extractInvoiceId,
  extractResponseDeadline,
  extractTxnIdAfterLabel,
} from "./base.js";

export function parseCaseFinal(text, meta) {
  const [txnAmount] = extractAmountAfterLabel(text, "Transaction amount");
  const [disputeAmount] = extractAmountAfterLabel(text, "Dispute amount");
  return {
    ...meta,
    case_id: extractCaseId(text),
    buyer_name: extractFieldAfterLabel(text, "Buyer's name"),
    buyer_email: extractEmailAfterLabel(text, "Buyer's email"),
    buyer_txn_id: extractTxnIdAfterLabel(text, "Buyer's transaction ID"),
    seller_txn_id: extractTxnIdAfterLabel(text, "Your transaction ID"),
    invoice_id: extractInvoiceId(text),
    txn_date: extractDateAfterLabel(text, "Transaction date"),
    txn_amount: txnAmount,
    dispute_amount: disputeAmount,
    outcome: "decided in your favor",
  };
}

export function parseCaseOpen(text, meta) {
  let [txnAmount] = extractAmountAfterLabel(text, "Transaction Amount");
  if (!txnAmount) [txnAmount] = extractAmountAfterLabel(text, "Transaction amount");

  let [disputedAmount] = extractAmountAfterLabel(text, "Disputed Amount");
  if (!disputedAmount) [disputedAmount] = extractAmountAfterLabel(text, "Disputed amount");

  let caseId = extractCaseId(text);
  if (!caseId) {
    const match = text.match(/Case ID\s+([^\n]+)/i);
    if (match) caseId = extractCaseId(match[1]) || match[1].trim();
  }

  return {
    ...meta,
    case_id: caseId,
    buyer_name:
      extractFieldAfterLabel(text, "Buyer's Name") ||
      extractFieldAfterLabel(text, "Buyer's name"),
    buyer_email:
      extractEmailAfterLabel(text, "Buyer's Email") ||
      extractEmailAfterLabel(text, "Buyer's email"),
    buyer_txn_id:
      extractTxnIdAfterLabel(text, "Buyer's Transaction ID") ||
      extractTxnIdAfterLabel(text, "Buyer's transaction ID"),
    seller_txn_id:
      extractTxnIdAfterLabel(text, "Your Transaction ID") ||
      extractTxnIdAfterLabel(text, "Your transaction ID"),
    invoice_id: extractInvoiceId(text),
    txn_date:
      extractDateAfterLabel(text, "Transaction Date") ||
      extractDateAfterLabel(text, "Transaction date"),
    txn_amount: txnAmount,
    disputed_amount: disputedAmount,
    response_deadline: extractResponseDeadline(text),
  };
}

export function parseCaseUpdate(text, meta) {
  const [txnAmount] = extractAmountAfterLabel(text, "Transaction amount");
  const [disputedAmount] = extractAmountAfterLabel(text, "Disputed amount");

  let debitReason = "";
  const debitMatch = text.match(
    /debited from your PayPal account for the following reason\(s\):\s*([^\n.]+)/i
  );
  if (debitMatch) debitReason = debitMatch[1].trim();

  let chargebackFee = "";
  const feeMatch = text.match(/chargeback fee of\s*([^\n.]+?)\s+has been debited/i);
  if (feeMatch) chargebackFee = feeMatch[1].trim();

  return {
    ...meta,
    case_id: extractCaseId(text),
    buyer_name: extractFieldAfterLabel(text, "Buyer's name"),
    buyer_email: extractEmailAfterLabel(text, "Buyer's email"),
    buyer_txn_id: extractTxnIdAfterLabel(text, "Buyer's transaction ID"),
    seller_txn_id: extractTxnIdAfterLabel(text, "Your transaction ID"),
    invoice_id: extractInvoiceId(text),
    txn_date: extractDateAfterLabel(text, "Transaction date"),
    txn_amount: txnAmount,
    disputed_amount: disputedAmount,
    debit_reason: debitReason,
    chargeback_fee: chargebackFee,
  };
}

export function parsePaymentReview(text, meta) {
  const [disputeAmount] = extractAmountAfterLabel(text, "Dispute amount");
  const [txnAmount] = extractAmountAfterLabel(text, "Transaction amount");

  let refundDeadline = "";
  const refundMatch = text.match(/issue a refund by\s+([^\n.]+)/i);
  if (refundMatch) refundDeadline = refundMatch[1].trim();

  return {
    ...meta,
    case_id: extractCaseId(text),
    dispute_amount: disputeAmount,
    txn_id: extractTxnIdAfterLabel(text, "Transaction ID"),
    txn_amount: txnAmount,
    txn_date: extractDateAfterLabel(text, "Transaction date"),
    buyer_name: extractFieldAfterLabel(text, "Buyer name"),
    response_deadline: extractResponseDeadline(text),
    refund_deadline: refundDeadline,
  };
}

export function parseRefundRequested(text, meta) {
  const [txnAmount] = extractAmountAfterLabel(text, "Transaction amount");
  const [disputedAmount] = extractAmountAfterLabel(text, "Disputed amount");

  return {
    ...meta,
    case_id: extractCaseId(text),
    txn_amount: txnAmount,
    disputed_amount: disputedAmount,
    txn_date: extractDateAfterLabel(text, "Transaction date"),
    buyer_name: extractFieldAfterLabel(text, "Buyer name"),
    txn_id: extractTxnIdAfterLabel(text, "Transaction ID"),
    response_deadline: extractResponseDeadline(text),
  };
}

export function parseResponseOnCase(text, meta) {
  const [txnAmount] = extractAmountAfterLabel(text, "Transaction amount");
  const [disputeAmount] = extractAmountAfterLabel(text, "Dispute amount");

  let holdAmount = "";
  const holdMatch = text.match(
    /([£$€][\d,]+\.\d{2}\s*(?:USD|GBP|EUR)?)\s+from this transaction is being temporarily held/i
  );
  if (holdMatch) holdAmount = holdMatch[1].trim();

  return {
    ...meta,
    case_id: extractCaseId(text),
    buyer_name: extractFieldAfterLabel(text, "Buyer's name"),
    txn_date: extractDateAfterLabel(text, "Transaction date"),
    txn_amount: txnAmount,
    txn_id: extractTxnIdAfterLabel(text, "Transaction ID"),
    dispute_amount: disputeAmount,
    hold_amount: holdAmount,
  };
}
