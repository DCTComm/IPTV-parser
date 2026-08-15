import {
  AMOUNT_RE,
  extractFieldAfterLabel,
  extractTxnIdAfterLabel,
} from "./base.js";

export function parseTransferRequest(text, meta) {
  let txnId = "";
  let transferDate = "";
  let amount = "";
  let currency = "";
  let bankAccount = "";
  let estimatedArrival = "";

  const txnMatch = text.match(/Transaction ID:\s*([A-Z0-9]+)/i);
  txnId = txnMatch ? txnMatch[1] : extractTxnIdAfterLabel(text, "Transaction ID");

  const amountMatch = text.match(/transfer\s+([^\n]+?)\s+to your bank account/i);
  if (amountMatch) {
    const parsed = amountMatch[1].match(AMOUNT_RE);
    if (parsed) {
      amount = parsed[1];
      currency = (parsed[2] || "").toUpperCase();
    }
  }

  const totalMatch = text.match(/Total amount transferred\s+([^\n]+)/i);
  if (totalMatch) {
    const parsed = totalMatch[1].match(AMOUNT_RE);
    if (parsed) {
      amount = parsed[1];
      currency = (parsed[2] || "").toUpperCase();
    }
  }

  const arrivalMatch = text.match(/Estimated arrival:\s*([^\n]+)/i);
  if (arrivalMatch) estimatedArrival = arrivalMatch[1].trim();

  bankAccount = extractFieldAfterLabel(text, "Bank account");
  if (!bankAccount) {
    const bankMatch = text.match(/Bank account\s*\n?\s*([^\n]+)/i);
    if (bankMatch) bankAccount = bankMatch[1].trim();
  }

  const dateMatch = text.match(
    /Transfer details\s*\n?\s*Transaction ID:[^\n]+\n?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i
  );
  if (dateMatch) transferDate = dateMatch[1].trim();

  return {
    ...meta,
    txn_id: txnId,
    transfer_date: transferDate,
    amount,
    currency,
    bank_account: bankAccount,
    estimated_arrival: estimatedArrival,
  };
}
